#!/usr/bin/env node
// stdio ⇄ HTTP 转接：给只支持 stdio 的 MCP 客户端（如 Claude 桌面版）用。
// 从 stdin 逐行读 JSON-RPC 消息，转发到 MyBrowser 本机的 MCP HTTP 接口，把应答逐行写到 stdout。
//
// 零依赖，可以用 node 或 `ELECTRON_RUN_AS_NODE=1 MyBrowser.exe` 运行。
// stdout 只输出协议消息，日志和错误一律写 stderr。
//
// 连接信息的来源（前面的优先）：
//   MYBROWSER_MCP_URL / MYBROWSER_MCP_TOKEN 环境变量
//   --config <mcp.json 的绝对路径>，或 MYBROWSER_MCP_CONFIG 环境变量
// 配置文件每次请求都重新读，用户在 MyBrowser 里重新开关接口后不用重启客户端。
'use strict';

const fs = require('fs');
const http = require('http');
const readline = require('readline');

const HOST = '127.0.0.1';
const MCP_PATH = '/mcp';
const DEFAULT_PORT = 17345;
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

function log(...args) {
    process.stderr.write(`[mybrowser-bridge] ${args.join(' ')}\n`);
}

function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--config') {
            out.config = argv[++i];
        } else if (a.startsWith('--config=')) {
            out.config = a.slice('--config='.length);
        } else if (a === '--help' || a === '-h') {
            out.help = true;
        }
    }
    return out;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
    process.stderr.write('usage: stdio-bridge.js --config <path to mcp.json>\n'
        + 'env: MYBROWSER_MCP_CONFIG, MYBROWSER_MCP_URL, MYBROWSER_MCP_TOKEN\n');
    process.exit(0);
}
const configPath = process.env.MYBROWSER_MCP_CONFIG || args.config || '';

/** @returns {{url: URL, token: string}} */
function resolveTarget() {
    let file = {};
    if (configPath) {
        try {
            file = JSON.parse(fs.readFileSync(configPath, 'utf8')) || {};
        } catch (e) {
            if (e.code !== 'ENOENT') {
                throw new BridgeError(`无法读取 ${configPath}：${e.message}`);
            }
        }
    }
    const port = Number.isInteger(file.port) ? file.port : DEFAULT_PORT;
    const url = new URL(process.env.MYBROWSER_MCP_URL || `http://${HOST}:${port}${MCP_PATH}`);
    const token = process.env.MYBROWSER_MCP_TOKEN || (typeof file.token === 'string' ? file.token : '');
    if (!token) {
        throw new BridgeError('MyBrowser 的 AI 接口还没有开启过：请在 MyBrowser 设置 → AI 接口（MCP）里打开开关');
    }
    return { url, token };
}

class BridgeError extends Error {}

// 服务端返回的协议头，后续请求原样带回
const session = { id: '', protocolVersion: '' };

function writeMessage(msg) {
    rememberProtocolVersion(msg);
    process.stdout.write(JSON.stringify(msg) + '\n');
}

/** 给带 id 的请求回一个错误，避免客户端一直等 */
function replyError(message, text) {
    const list = Array.isArray(message) ? message : [message];
    for (const m of list) {
        if (m && typeof m === 'object' && m.id !== undefined && m.id !== null && typeof m.method === 'string') {
            writeMessage({ jsonrpc: '2.0', id: m.id, error: { code: -32000, message: text } });
        }
    }
}

/** 解析 text/event-stream：每个事件的 data 行拼起来就是一条 JSON-RPC 消息 */
function pipeSse(res, onMessage) {
    return new Promise((resolve, reject) => {
        let buf = '';
        let data = [];
        const dispatch = () => {
            if (data.length) {
                const payload = data.join('\n');
                data = [];
                try {
                    onMessage(JSON.parse(payload));
                } catch (e) {
                    log('bad SSE payload:', e.message);
                }
            }
        };
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
            buf += chunk;
            let nl;
            while ((nl = buf.search(/\r?\n/)) >= 0) {
                const line = buf.slice(0, nl);
                buf = buf.slice(nl + (buf[nl] === '\r' ? 2 : 1));
                if (line === '') {
                    dispatch();
                } else if (line.startsWith('data:')) {
                    data.push(line.slice(5).replace(/^ /, ''));
                }
                // event: / id: / retry: / 注释行不需要处理
            }
        });
        res.on('end', () => {
            if (buf.startsWith('data:')) {
                data.push(buf.slice(5).replace(/^ /, ''));
            }
            dispatch();
            resolve();
        });
        res.on('error', reject);
    });
}

function readBody(res) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
    });
}

function forward(message) {
    const { url, token } = resolveTarget();
    const body = JSON.stringify(message);
    const headers = {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${token}`,
        'content-length': Buffer.byteLength(body),
    };
    if (session.id) {
        headers['mcp-session-id'] = session.id;
    }
    if (session.protocolVersion) {
        headers['mcp-protocol-version'] = session.protocolVersion;
    }
    return new Promise((resolve, reject) => {
        const req = http.request(url, { method: 'POST', headers, timeout: REQUEST_TIMEOUT_MS }, async (res) => {
            try {
                const sid = res.headers['mcp-session-id'];
                if (typeof sid === 'string' && sid) {
                    session.id = sid;
                }
                const status = res.statusCode || 0;
                const type = String(res.headers['content-type'] || '');
                if (status === 202 || status === 204) {
                    res.resume();
                    return resolve();
                }
                if (status >= 200 && status < 300 && type.includes('text/event-stream')) {
                    await pipeSse(res, writeMessage);
                    return resolve();
                }
                const text = await readBody(res);
                if (status >= 200 && status < 300) {
                    if (text.trim()) {
                        writeMessage(JSON.parse(text));
                    }
                    return resolve();
                }
                // 服务端已经给了 JSON-RPC 错误时直接转发
                try {
                    const parsed = JSON.parse(text);
                    if (parsed && parsed.jsonrpc) {
                        writeMessage(parsed);
                        return resolve();
                    }
                } catch {
                    // 不是 JSON，按下面的说明返回
                }
                const hint = status === 401
                    ? '令牌不匹配：MyBrowser 里的令牌已变更，请检查 mcp.json'
                    : `MyBrowser 返回 HTTP ${status}${text ? `：${text.slice(0, 200)}` : ''}`;
                reject(new BridgeError(hint));
            } catch (e) {
                reject(e);
            }
        });
        req.on('timeout', () => req.destroy(new BridgeError('请求超时')));
        req.on('error', (e) => {
            if (e instanceof BridgeError) {
                return reject(e);
            }
            if (e.code === 'ECONNREFUSED') {
                return reject(new BridgeError('连不上 MyBrowser：请确认 MyBrowser 已启动，并在设置里开启了 AI 接口（MCP）'));
            }
            reject(new BridgeError(`连接 MyBrowser 失败：${e.message}`));
        });
        req.end(body);
    });
}

function rememberProtocolVersion(message) {
    // initialize 的应答里带着协商好的版本，之后的请求要在协议头里带上
    const list = Array.isArray(message) ? message : [message];
    for (const m of list) {
        const v = m && m.result && m.result.protocolVersion;
        if (typeof v === 'string') {
            session.protocolVersion = v;
        }
    }
}
let pending = 0;
let inputClosed = false;
function maybeExit() {
    if (inputClosed && pending === 0) {
        process.exit(0);
    }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
    if (!line.trim()) {
        return;
    }
    let message;
    try {
        message = JSON.parse(line);
    } catch (e) {
        writeMessage({ jsonrpc: '2.0', id: null, error: { code: -32700, message: `Parse error: ${e.message}` } });
        return;
    }
    pending++;
    // 各请求并发转发：工具调用可能很慢，不能挡住后面的 ping / 取消通知
    Promise.resolve()
        .then(() => forward(message))
        .catch((e) => {
            const text = e instanceof BridgeError ? e.message : `转接出错：${e.message}`;
            log(text);
            replyError(message, text);
        })
        .finally(() => {
            pending--;
            maybeExit();
        });
});
rl.on('close', () => {
    inputClosed = true;
    maybeExit();
});
process.stdout.on('error', (e) => {
    if (e.code === 'EPIPE') {
        process.exit(0);
    }
});
