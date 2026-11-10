// stdio 转接脚本的测试：起一个真实的 MCP HTTP 服务，用子进程运行 stdio-bridge.js 对话。
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const readline = require('readline');
const { z } = require('zod');

const { McpConfig } = require('../../src/main/mcp/config');
const { McpHttpService } = require('../../src/main/mcp/server');
const { createServerFactory } = require('../../src/main/mcp/factory');

const BRIDGE = path.join(__dirname, '..', '..', 'src', 'main', 'mcp', 'stdio-bridge.js');
const TOKEN = 'test-token-0123456789abcdef';
const silent = { info() {}, warn() {}, error() {} };

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

function registerTestTools(server) {
    server.registerTool('ping', {
        description: 'Connectivity check',
        inputSchema: z.object({ text: z.string() }),
    }, async ({ text }) => ({ content: [{ type: 'text', text: 'pong:' + text }] }));
}

/** 启动转接脚本，返回按 id 等应答的小客户端 */
function startBridge(args, env = {}) {
    const child = spawn(process.execPath, [BRIDGE, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, MYBROWSER_MCP_URL: '', MYBROWSER_MCP_TOKEN: '', MYBROWSER_MCP_CONFIG: '', ...env },
    });
    const lines = [];
    const waiters = [];
    let stderr = '';
    child.stderr.on('data', (c) => { stderr += c; });
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
        const msg = JSON.parse(line); // stdout 上的每一行都必须是 JSON
        lines.push(msg);
        for (const w of waiters.splice(0)) w();
    });
    const waitFor = (pred, ms = 5000) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout; stderr=' + stderr)), ms);
        const check = () => {
            const hit = lines.find(pred);
            if (hit) {
                clearTimeout(timer);
                resolve(hit);
            } else {
                waiters.push(check);
            }
        };
        check();
    });
    return {
        child,
        lines,
        get stderr() { return stderr; },
        send: (msg) => child.stdin.write(JSON.stringify(msg) + '\n'),
        reply: (id) => waitFor((m) => m.id === id),
        close: () => new Promise((resolve) => {
            child.once('exit', (code) => resolve(code));
            child.stdin.end();
        }),
    };
}

const INIT = {
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'bridge-test', version: '0' } },
};

describe('stdio-bridge', () => {
    let dir, service, configFile;

    before(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mybrowser-bridge-test-'));
        configFile = path.join(dir, 'mcp.json');
        const port = await freePort();
        fs.writeFileSync(configFile, JSON.stringify({ enabled: true, port, token: TOKEN }));
        service = new McpHttpService({
            config: new McpConfig(dir),
            buildServer: createServerFactory({ registerTools: registerTestTools }),
            logger: silent,
        });
        await service.init();
        assert.equal(service.getStatus().state, 'running');
    });

    after(async () => {
        await service.stop();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('转发 initialize、通知、tools/list 和 tools/call，stdout 只有协议消息', async () => {
        const b = startBridge(['--config', configFile]);
        b.send(INIT);
        const init = await b.reply(1);
        assert.equal(init.result.serverInfo.name.length > 0, true);
        b.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
        b.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
        b.send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'ping', arguments: { text: 'hi' } } });
        const list = await b.reply(2);
        assert.ok(list.result.tools.some((t) => t.name === 'ping'));
        const call = await b.reply(3);
        assert.equal(call.result.content[0].text, 'pong:hi');
        assert.equal(await b.close(), 0);
        // 通知没有应答：一共只有三条
        assert.deepEqual(b.lines.map((m) => m.id), [1, 2, 3]);
    });

    test('无法解析的输入回 -32700，不中断后续请求', async () => {
        const b = startBridge(['--config', configFile]);
        b.child.stdin.write('{not json\n');
        b.send(INIT);
        const bad = await b.reply(null);
        assert.equal(bad.error.code, -32700);
        await b.reply(1);
        await b.close();
    });

    test('令牌不对时给带 id 的请求回错误', async () => {
        const b = startBridge(['--config', configFile], { MYBROWSER_MCP_TOKEN: 'wrong-token-0123456789' });
        b.send(INIT);
        const r = await b.reply(1);
        assert.match(r.error.message, /令牌/);
        await b.close();
    });

    test('服务没开时说明原因，通知不产生输出', async () => {
        const port = await freePort();
        const b = startBridge([], { MYBROWSER_MCP_URL: `http://127.0.0.1:${port}/mcp`, MYBROWSER_MCP_TOKEN: TOKEN });
        b.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
        b.send(INIT);
        const r = await b.reply(1);
        assert.match(r.error.message, /连不上 MyBrowser/);
        await b.close();
        assert.equal(b.lines.length, 1);
    });

    test('配置文件里没有令牌时提示去开启接口', async () => {
        const empty = path.join(dir, 'empty.json');
        fs.writeFileSync(empty, JSON.stringify({ enabled: false }));
        const b = startBridge(['--config', empty]);
        b.send(INIT);
        const r = await b.reply(1);
        assert.match(r.error.message, /AI 接口/);
        await b.close();
    });
});
