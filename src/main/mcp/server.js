// 本机 MCP HTTP 服务：只监听 127.0.0.1，校验 Host / Origin / Bearer 令牌后交给 MCP SDK 处理。
// 2026-07-28 新协议走 SDK 的 createMcpHandler；2025 版请求手动分流，以便返回纯 JSON 而不是 SSE。
const http = require('http');
const crypto = require('crypto');
const { Readable } = require('stream');
const {
    createMcpHandler,
    isLegacyRequest,
    isJsonContentType,
    WebStandardStreamableHTTPServerTransport,
} = require('@modelcontextprotocol/server');

const MCP_PATH = '/mcp';
const HOST = '127.0.0.1';
/** 请求体上限：工具参数都很小，1 MiB 足够，同时限制恶意大请求 */
const MAX_REQUEST_BODY = 1024 * 1024;
/** 这些是逐跳头，不能原样放进 Web Request */
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'content-length', 'proxy-connection']);

/**
 * 常量时间比较，避免通过响应时间猜令牌
 */
function tokenMatches(header, token) {
    if (typeof header !== 'string' || !token) {
        return false;
    }
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (!match) {
        return false;
    }
    const a = crypto.createHash('sha256').update(match[1]).digest();
    const b = crypto.createHash('sha256').update(token).digest();
    return crypto.timingSafeEqual(a, b);
}

function sendText(res, status, text, headers = {}) {
    if (res.headersSent) {
        res.end();
        return;
    }
    res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...headers });
    res.end(text);
}

function readBody(req, limit) {
    return new Promise((resolve, reject) => {
        const declared = Number(req.headers['content-length']);
        if (declared > limit) {
            reject(Object.assign(new Error('Request body too large'), { status: 413 }));
            return;
        }
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > limit) {
                reject(Object.assign(new Error('Request body too large'), { status: 413 }));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

/**
 * 管理 HTTP 服务的启停。所有启停请求串行执行，快速切换开关时不会出现两个监听。
 */
class McpHttpService {
    /**
     * @param {object} options
     * @param {import('./config').McpConfig} options.config
     * @param {(ctx: object) => import('@modelcontextprotocol/server').McpServer} options.buildServer 每个请求创建一个新的 MCP 服务实例
     * @param {{info: Function, warn: Function, error: Function}} [options.logger]
     */
    constructor({ config, buildServer, logger = console }) {
        this.config = config;
        this.buildServer = buildServer;
        this.logger = logger;
        this.httpServer = null;
        this.handler = null;
        this.sockets = new Set();
        this.queue = Promise.resolve();
        this.listeners = new Set();
        /** @type {{state: 'stopped'|'running'|'error', port: number, url: string, error?: {code: string, message: string}}} */
        this.status = this._makeStatus('stopped');
    }

    _makeStatus(state, error) {
        const port = this.config.data.port;
        const status = { state, enabled: this.config.data.enabled, port, url: `http://${HOST}:${port}${MCP_PATH}` };
        if (error) {
            status.error = { code: error.code || 'unknown', message: error.message };
        }
        return status;
    }

    _setStatus(state, error) {
        this.status = this._makeStatus(state, error);
        for (const listener of this.listeners) {
            try {
                listener(this.status);
            } catch (e) {
                this.logger.error('mcp status listener failed', e);
            }
        }
    }

    onStatusChange(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    getStatus() {
        return this.status;
    }

    /** 当前令牌，只给设置面板生成连接配置使用，不写日志 */
    getToken() {
        return this.config.data.token;
    }

    _enqueue(task) {
        const run = this.queue.then(task, task);
        // 队列本身不能因为某个任务失败而中断
        this.queue = run.catch(() => {});
        return run;
    }

    /**
     * 应用启动时调用：读取配置，上次是开启状态就启动服务。
     */
    init() {
        return this._enqueue(async () => {
            this.config.load();
            if (this.config.loadError) {
                this._setStatus('error', this.config.loadError);
                return this.status;
            }
            if (this.config.data.enabled) {
                await this._start();
            } else {
                this._setStatus('stopped');
            }
            return this.status;
        });
    }

    /**
     * 设置面板切换开关。保存失败或启动失败都会反映在返回的状态里。
     */
    setEnabled(enabled) {
        return this._enqueue(async () => {
            // 每次切换前重读一次，允许用户手动修好 mcp.json 后直接在界面上重试
            this.config.load();
            try {
                this.config.setEnabled(enabled);
            } catch (e) {
                await this._stop();
                this._setStatus('error', e);
                return this.status;
            }
            if (enabled) {
                await this._stop();
                await this._start();
            } else {
                await this._stop();
                this._setStatus('stopped');
            }
            return this.status;
        });
    }

    stop() {
        return this._enqueue(async () => {
            await this._stop();
            this._setStatus('stopped');
            return this.status;
        });
    }

    /**
     * 应用退出时同步断开所有连接，不等待异步清理。
     */
    destroyNow() {
        for (const socket of this.sockets) {
            socket.destroy();
        }
        this.sockets.clear();
        if (this.httpServer) {
            this.httpServer.close();
            this.httpServer = null;
        }
        if (this.handler) {
            this.handler.close().catch(() => {});
            this.handler = null;
        }
    }

    async _start() {
        const { port } = this.config.data;
        this.handler = createMcpHandler((ctx) => this.buildServer(ctx), {
            legacy: 'reject',
            responseMode: 'json',
            maxRequestBodySize: MAX_REQUEST_BODY,
            onerror: (e) => this.logger.warn('mcp handler error:', e.message),
        });
        const server = http.createServer((req, res) => {
            this._handle(req, res).catch((e) => {
                this.logger.error('mcp request failed:', e && e.message);
                sendText(res, 500, 'Internal server error');
            });
        });
        server.on('connection', (socket) => {
            this.sockets.add(socket);
            socket.on('close', () => this.sockets.delete(socket));
        });
        try {
            await new Promise((resolve, reject) => {
                server.once('error', reject);
                server.listen(port, HOST, () => {
                    server.off('error', reject);
                    resolve();
                });
            });
        } catch (e) {
            await this.handler.close().catch(() => {});
            this.handler = null;
            const error = e.code === 'EADDRINUSE'
                ? { code: 'port_in_use', message: `端口 ${port} 已被占用，可能已有另一个 MyBrowser 实例开启了 AI 接口；可在 mcp.json 中修改端口` }
                : { code: e.code || 'listen_failed', message: `无法监听 ${HOST}:${port}：${e.message}` };
            this.logger.warn('mcp server failed to start:', error.message);
            this._setStatus('error', error);
            return;
        }
        server.on('error', (e) => this.logger.error('mcp server error:', e.message));
        this.httpServer = server;
        this.logger.info(`mcp server listening on ${HOST}:${port}`);
        this._setStatus('running');
    }

    async _stop() {
        const server = this.httpServer;
        const handler = this.handler;
        this.httpServer = null;
        this.handler = null;
        if (handler) {
            // 中止进行中的请求和 subscriptions/listen 长连接
            await handler.close().catch((e) => this.logger.warn('mcp handler close failed:', e.message));
        }
        if (server) {
            const closed = new Promise((resolve) => server.close(() => resolve()));
            for (const socket of this.sockets) {
                socket.destroy();
            }
            this.sockets.clear();
            await closed;
            this.logger.info('mcp server stopped');
        }
    }

    _checkAccess(req) {
        const { port, token } = this.config.data;
        const host = req.headers.host;
        if (host !== `${HOST}:${port}` && host !== `localhost:${port}`) {
            return { status: 403, text: 'Forbidden: invalid Host header' };
        }
        // 浏览器发起的请求一定带 Origin；本机客户端不带。网页（包括开了跨域的标签页）一律拒绝，
        // 不返回任何 CORS 头，预检请求也会在这里失败
        if (req.headers.origin !== undefined) {
            return { status: 403, text: 'Forbidden: browser origins are not allowed' };
        }
        if (!tokenMatches(req.headers.authorization, token)) {
            return { status: 401, text: 'Unauthorized', headers: { 'www-authenticate': 'Bearer realm="mybrowser"' } };
        }
        const pathname = (req.url || '').split('?')[0];
        if (pathname !== MCP_PATH) {
            return { status: 404, text: 'Not found' };
        }
        return null;
    }

    async _handle(req, res) {
        const handler = this.handler;
        if (!handler) {
            sendText(res, 503, 'MCP server is stopping');
            return;
        }
        const denied = this._checkAccess(req);
        if (denied) {
            sendText(res, denied.status, denied.text, denied.headers);
            req.resume();
            return;
        }

        let body;
        if (req.method === 'POST') {
            if (!isJsonContentType(req.headers['content-type'] || '')) {
                sendText(res, 415, 'Unsupported Media Type: expected application/json');
                req.resume();
                return;
            }
            try {
                body = await readBody(req, MAX_REQUEST_BODY);
            } catch (e) {
                sendText(res, e.status || 400, e.message);
                return;
            }
        }

        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
            if (HOP_BY_HOP.has(key) || value === undefined) {
                continue;
            }
            if (Array.isArray(value)) {
                value.forEach((v) => headers.append(key, v));
            } else {
                headers.set(key, value);
            }
        }
        // 客户端断开时通知 SDK 取消对应的处理
        const abort = new AbortController();
        res.on('close', () => {
            if (!res.writableFinished) {
                abort.abort();
            }
        });
        const request = new Request(`http://${req.headers.host}${req.url}`, {
            method: req.method,
            headers,
            body: body && body.length ? body : undefined,
            signal: abort.signal,
        });

        const legacy = await isLegacyRequest(request, undefined, { maxRequestBodySize: MAX_REQUEST_BODY });
        const response = legacy ? await this._handleLegacy(request) : await handler.fetch(request);
        await this._writeResponse(response, res, abort);
    }

    /**
     * 2025 版协议：每个请求一个新实例，无会话，JSON 应答
     */
    async _handleLegacy(request) {
        if (request.method !== 'POST') {
            return new Response('Method not allowed.', { status: 405, headers: { allow: 'POST' } });
        }
        const server = await this.buildServer({ era: 'legacy', requestInfo: request });
        const transport = new WebStandardStreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
        });
        await server.connect(transport);
        try {
            return await transport.handleRequest(request);
        } finally {
            transport.close().catch(() => {});
            server.close().catch(() => {});
        }
    }

    /**
     * 把 Web Response 写回 Node 响应。SSE 应答（subscriptions/listen）是长连接，必须边读边写。
     */
    async _writeResponse(response, res, abort) {
        const headers = {};
        response.headers.forEach((value, key) => {
            headers[key] = value;
        });
        res.writeHead(response.status, headers);
        if (!response.body) {
            res.end();
            return;
        }
        const stream = Readable.fromWeb(response.body);
        res.on('close', () => stream.destroy());
        abort.signal.addEventListener('abort', () => stream.destroy(), { once: true });
        await new Promise((resolve) => {
            stream.on('error', () => {
                res.destroy();
                resolve();
            });
            stream.on('end', resolve);
            stream.on('close', resolve);
            stream.pipe(res);
        });
    }
}

module.exports = { McpHttpService, MCP_PATH, HOST, MAX_REQUEST_BODY };
