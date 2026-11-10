// MCP HTTP 服务的集成测试：纯 Node 运行，不需要启动 Electron。
// 运行：node --test test/mcp/
// 每个用例使用临时配置目录和随机端口，不读写真实用户数据。
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const http = require('http');
const { z } = require('zod');

const { McpConfig } = require('../../src/main/mcp/config');
const { McpHttpService } = require('../../src/main/mcp/server');
const { createServerFactory } = require('../../src/main/mcp/factory');

const silent = { info() {}, warn() {}, error() {} };

function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'mybrowser-mcp-test-'));
}

function freePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const { port } = srv.address();
            srv.close(() => resolve(port));
        });
    });
}

function writeConfig(dir, data) {
    fs.writeFileSync(path.join(dir, 'mcp.json'), typeof data === 'string' ? data : JSON.stringify(data));
}

function registerTestTools(server) {
    server.registerTool('ping', {
        description: 'Connectivity check',
        inputSchema: z.object({ text: z.string() }),
    }, async ({ text }) => ({ content: [{ type: 'text', text: 'pong:' + text }] }));
}

async function startService(port, extra = {}) {
    const dir = tmpDir();
    writeConfig(dir, { enabled: true, port, token: 'test-token-0123456789abcdef', ...extra });
    const service = new McpHttpService({
        config: new McpConfig(dir),
        buildServer: createServerFactory({ registerTools: registerTestTools }),
        logger: silent,
    });
    await service.init();
    return { dir, service };
}

/** 用原始 http 发送请求，以便自由控制 Host、Origin 等头 */
function rawRequest(port, { method = 'POST', headers = {}, body, path: p = '/mcp' } = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                let json;
                try { json = JSON.parse(text); } catch { /* 非 JSON 应答 */ }
                resolve({ status: res.statusCode, headers: res.headers, text, json });
            });
        });
        req.on('error', reject);
        if (body !== undefined) req.write(body);
        req.end();
    });
}

const TOKEN = 'test-token-0123456789abcdef';
const JSON_HEADERS = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };

function rpc(port, message, headers = {}) {
    return rawRequest(port, {
        headers: { ...JSON_HEADERS, authorization: `Bearer ${TOKEN}`, ...headers },
        body: JSON.stringify(message),
    });
}

describe('mcp http service', () => {
    let port;
    let ctx;
    before(async () => {
        port = await freePort();
        ctx = await startService(port);
        assert.equal(ctx.service.getStatus().state, 'running');
    });
    after(async () => {
        await ctx.service.stop();
        fs.rmSync(ctx.dir, { recursive: true, force: true });
    });

    test('2025 handshake returns JSON and lists tools', async () => {
        const init = await rpc(port, {
            jsonrpc: '2.0', id: 1, method: 'initialize',
            params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } },
        });
        assert.equal(init.status, 200);
        assert.match(init.headers['content-type'], /application\/json/);
        assert.equal(init.json.result.serverInfo.name, 'mybrowser');
        assert.match(init.json.result.instructions, /untrusted/);

        const note = await rpc(port, { jsonrpc: '2.0', method: 'notifications/initialized' }, { 'mcp-protocol-version': '2025-06-18' });
        assert.equal(note.status, 202);

        const list = await rpc(port, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { 'mcp-protocol-version': '2025-06-18' });
        assert.deepEqual(list.json.result.tools.map((t) => t.name), ['ping']);

        const call = await rpc(port, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'ping', arguments: { text: 'a' } } }, { 'mcp-protocol-version': '2025-06-18' });
        assert.equal(call.json.result.content[0].text, 'pong:a');
    });

    test('missing or wrong token is rejected', async () => {
        const none = await rawRequest(port, { headers: JSON_HEADERS, body: '{}' });
        assert.equal(none.status, 401);
        assert.match(none.headers['www-authenticate'], /Bearer/);
        const wrong = await rawRequest(port, { headers: { ...JSON_HEADERS, authorization: 'Bearer nope' }, body: '{}' });
        assert.equal(wrong.status, 401);
        const notBearer = await rawRequest(port, { headers: { ...JSON_HEADERS, authorization: TOKEN }, body: '{}' });
        assert.equal(notBearer.status, 401);
    });

    test('wrong Host header is rejected even with a valid token', async () => {
        const res = await rawRequest(port, {
            headers: { ...JSON_HEADERS, authorization: `Bearer ${TOKEN}`, host: `evil.example:${port}` },
            body: '{}',
        });
        assert.equal(res.status, 403);
    });

    test('any browser Origin is rejected even with a valid token, without CORS headers', async () => {
        for (const origin of ['https://evil.example', 'null', `http://127.0.0.1:${port}`, 'file://']) {
            const res = await rawRequest(port, {
                headers: { ...JSON_HEADERS, authorization: `Bearer ${TOKEN}`, origin },
                body: '{}',
            });
            assert.equal(res.status, 403, origin);
            assert.equal(res.headers['access-control-allow-origin'], undefined);
        }
        const preflight = await rawRequest(port, {
            method: 'OPTIONS',
            headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
        });
        assert.equal(preflight.status, 403);
        assert.equal(preflight.headers['access-control-allow-origin'], undefined);
    });

    test('wrong path, content type and oversized body are rejected', async () => {
        const auth = { authorization: `Bearer ${TOKEN}` };
        assert.equal((await rawRequest(port, { path: '/other', headers: { ...JSON_HEADERS, ...auth }, body: '{}' })).status, 404);
        assert.equal((await rawRequest(port, { headers: { 'content-type': 'text/plain', ...auth }, body: '{}' })).status, 415);
        const big = await rawRequest(port, { headers: { ...JSON_HEADERS, ...auth }, body: 'x'.repeat(2 * 1024 * 1024) })
            .catch((e) => ({ status: 'reset:' + e.code }));
        assert.ok(big.status === 413 || String(big.status).startsWith('reset'), String(big.status));
        // 拒绝大请求后服务仍然可用
        const ok = await rpc(port, { jsonrpc: '2.0', id: 9, method: 'tools/list' }, { 'mcp-protocol-version': '2025-06-18' });
        assert.equal(ok.status, 200);
    });

    test('GET on legacy endpoint returns 405', async () => {
        const res = await rawRequest(port, { method: 'GET', headers: { authorization: `Bearer ${TOKEN}`, accept: 'text/event-stream' } });
        assert.equal(res.status, 405);
    });
});

describe('mcp service lifecycle', () => {
    test('first enable generates a token and persists state atomically', async () => {
        const dir = tmpDir();
        const port = await freePort();
        writeConfig(dir, { enabled: false, port });
        const service = new McpHttpService({ config: new McpConfig(dir), buildServer: createServerFactory(), logger: silent });
        assert.equal((await service.init()).state, 'stopped');

        const status = await service.setEnabled(true);
        assert.equal(status.state, 'running');
        const saved = JSON.parse(fs.readFileSync(path.join(dir, 'mcp.json'), 'utf8'));
        assert.equal(saved.enabled, true);
        assert.ok(saved.token.length >= 32);
        assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')), []);

        // 重启：新实例读取同一目录后自动恢复运行，令牌不变
        await service.stop();
        const again = new McpHttpService({ config: new McpConfig(dir), buildServer: createServerFactory(), logger: silent });
        assert.equal((await again.init()).state, 'running');
        assert.equal(again.getToken(), saved.token);

        assert.equal((await again.setEnabled(false)).state, 'stopped');
        await assert.rejects(rawRequest(port, { headers: JSON_HEADERS, body: '{}' }), /ECONNREFUSED/);
        assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'mcp.json'), 'utf8')).enabled, false);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('rapid toggling ends in the last requested state with a single listener', async () => {
        const dir = tmpDir();
        const port = await freePort();
        writeConfig(dir, { enabled: false, port });
        const service = new McpHttpService({ config: new McpConfig(dir), buildServer: createServerFactory(), logger: silent });
        await service.init();
        const results = await Promise.all([true, false, true, true, false, true].map((v) => service.setEnabled(v)));
        assert.equal(results.at(-1).state, 'running');
        assert.equal(service.getStatus().state, 'running');
        const res = await rawRequest(port, { headers: JSON_HEADERS, body: '{}' });
        assert.equal(res.status, 401);
        await service.stop();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('port in use reports a clear error and can recover', async () => {
        const port = await freePort();
        const blocker = net.createServer();
        await new Promise((r) => blocker.listen(port, '127.0.0.1', r));
        const dir = tmpDir();
        writeConfig(dir, { enabled: true, port });
        const service = new McpHttpService({ config: new McpConfig(dir), buildServer: createServerFactory(), logger: silent });
        const status = await service.init();
        assert.equal(status.state, 'error');
        assert.equal(status.error.code, 'port_in_use');
        assert.match(status.error.message, new RegExp(String(port)));

        await new Promise((r) => blocker.close(r));
        assert.equal((await service.setEnabled(true)).state, 'running');
        await service.stop();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('corrupt config is reported and never overwritten', async () => {
        const dir = tmpDir();
        writeConfig(dir, '{ not json');
        const service = new McpHttpService({ config: new McpConfig(dir), buildServer: createServerFactory(), logger: silent });
        const status = await service.init();
        assert.equal(status.state, 'error');
        assert.equal(status.error.code, 'corrupt');
        const toggled = await service.setEnabled(true);
        assert.equal(toggled.state, 'error');
        assert.equal(fs.readFileSync(path.join(dir, 'mcp.json'), 'utf8'), '{ not json');

        // 用户修好文件后，直接在界面重试即可
        writeConfig(dir, { enabled: false, port: await freePort() });
        assert.equal((await service.setEnabled(true)).state, 'running');
        await service.stop();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('invalid port in config is reported', async () => {
        const dir = tmpDir();
        writeConfig(dir, { enabled: true, port: 80 });
        const service = new McpHttpService({ config: new McpConfig(dir), buildServer: createServerFactory(), logger: silent });
        const status = await service.init();
        assert.equal(status.state, 'error');
        assert.match(status.error.message, /端口/);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('stop closes open keep-alive connections', async () => {
        const port = await freePort();
        const ctx = await startService(port);
        const agent = new http.Agent({ keepAlive: true });
        await new Promise((resolve, reject) => {
            http.request({ host: '127.0.0.1', port, method: 'POST', path: '/mcp', agent, headers: JSON_HEADERS }, (res) => {
                res.resume();
                res.on('end', resolve);
            }).on('error', reject).end('{}');
        });
        const t0 = Date.now();
        await ctx.service.stop();
        assert.ok(Date.now() - t0 < 2000, 'stop should not wait for idle keep-alive sockets');
        agent.destroy();
        fs.rmSync(ctx.dir, { recursive: true, force: true });
    });
});
