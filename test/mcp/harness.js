// 端到端测试的公共部分：用临时用户数据目录启动真实应用，提供 MCP 调用、界面控制和本地测试页面。
// 每个 *.e2e.js 文件调用 setup() 启动一个独立的应用实例。
const { before, after } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const ELECTRON = require(path.join(ROOT, 'node_modules/electron'));
const FIXTURES = path.join(__dirname, 'fixtures');
const TOKEN = 'e2e-token-0123456789abcdef';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fetch 规范里的禁用端口：Node 的 fetch 和 Chromium 都拒绝连接。
// 系统分配的随机端口偶尔会落在里面（实测出现过 "bad port"），要跳过
const BAD_PORTS = new Set([1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95,
    101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465,
    512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995,
    1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679,
    6697, 10080]);

/** 在 127.0.0.1 上监听一个不在禁用列表里的随机端口 */
async function listenSafe(server) {
    for (;;) {
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', () => {
                server.off('error', reject);
                resolve();
            });
        });
        const p = server.address().port;
        if (!BAD_PORTS.has(p)) {
            return p;
        }
        await new Promise((r) => server.close(r));
    }
}

async function freePort() {
    const srv = net.createServer();
    const p = await listenSafe(srv);
    await new Promise((r) => srv.close(r));
    return p;
}

function testPage(title) {
    return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>`
        + `<body><h1>${title}</h1></body></html>`;
}

/**
 * 测试页面服务：
 * - /fixture/<name>   test/mcp/fixtures 下的文件
 * - /slow?ms=N        延迟 N 毫秒后返回
 * - /?Title           标题和正文都是 Title 的简单页面
 */
function handlePage(req, res) {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/fixture/')) {
        const name = path.basename(u.pathname);
        const file = path.join(FIXTURES, name);
        if (!fs.existsSync(file)) {
            res.writeHead(404);
            res.end('not found');
            return;
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(file));
        return;
    }
    if (u.pathname === '/slow') {
        const ms = Number(u.searchParams.get('ms') || 1000);
        setTimeout(() => {
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(testPage('Slow'));
        }, ms);
        return;
    }
    const title = decodeURIComponent((req.url.split('?')[1] || 'page').replace(/[^\w%-]/g, ''));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(testPage(title));
}

/** @param {{env?: Record<string, string>}} [options] env 会合并进应用进程的环境变量 */
function setup(options = {}) {
    const ctx = {
        port: 0, pagePort: 0, controlPort: 0, rpcId: 0,
        /** 页面地址，host 可换成 localhost 得到另一个站点 */
        url: (title, host = '127.0.0.1') => `http://${host}:${ctx.pagePort}/?${title}`,
        fixture: (name, host = '127.0.0.1') => `http://${host}:${ctx.pagePort}/fixture/${name}`,
        freePort,
        sleep,
    };
    let pageServer;
    let userData;
    let app;

    ctx.rpc = async (method, params) => {
        const res = await fetch(`http://127.0.0.1:${ctx.port}/mcp`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                accept: 'application/json, text/event-stream',
                authorization: `Bearer ${TOKEN}`,
                'mcp-protocol-version': '2025-06-18',
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: ++ctx.rpcId, method, params }),
            signal: AbortSignal.timeout(150000),
        });
        return res.json();
    };

    /** 调用工具，返回原始 result */
    ctx.callRaw = async (name, args = {}) => {
        const res = await ctx.rpc('tools/call', { name, arguments: args });
        if (res.error) {
            throw new Error(`JSON-RPC error: ${JSON.stringify(res.error)}`);
        }
        return res.result;
    };

    /** 调用工具；成功返回 structuredContent，失败返回 {error} */
    ctx.call = async (name, args = {}) => {
        const result = await ctx.callRaw(name, args);
        if (result.isError) {
            return JSON.parse(result.content[0].text);
        }
        return result.structuredContent;
    };

    /** 在浏览器界面里执行代码，模拟用户操作 */
    ctx.control = async (pathname, body) => {
        const res = await fetch(`http://127.0.0.1:${ctx.controlPort}${pathname}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000),
        });
        const msg = await res.json();
        if (!msg.ok) throw new Error(msg.error);
        return msg.value;
    };
    ctx.shell = (code) => ctx.control('/shell', { code });
    ctx.windowOp = (op) => ctx.control('/window', { op });

    ctx.waitUntil = async (fn, timeoutMs = 15000, label = 'condition') => {
        const deadline = Date.now() + timeoutMs;
        let last;
        while (Date.now() < deadline) {
            try {
                last = await fn();
                if (last) return last;
            } catch (e) {
                last = e;
            }
            await sleep(100);
        }
        throw new Error(`timeout waiting for ${label}: ${last && (last.message || JSON.stringify(last))}`);
    };

    async function launch() {
        app = spawn(ELECTRON, [path.join(__dirname, 'launch-app.js'), userData], {
            cwd: ROOT,
            env: { ...process.env, MYBROWSER_MCP_TEST_TOOLS: '1', MYBROWSER_TEST_CONTROL_PORT: String(ctx.controlPort), ...options.env },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        app.stdout.resume();
        app.stderr.resume();
        // 等服务启动、界面就绪
        await ctx.waitUntil(async () => {
            const res = await ctx.call('list_tabs');
            return res.tabs && res.tabs.length >= 1;
        }, 30000, 'app ready');
    }

    /** graceful 为 true 时先请应用自己退出，10 秒内没退再强制结束 */
    async function quit(graceful = false) {
        if (!app || app.exitCode !== null) {
            return;
        }
        const exited = new Promise((r) => app.once('exit', r));
        if (graceful) {
            await ctx.windowOp('quit').catch(() => {});
            const timer = new Promise((r) => setTimeout(() => r('timeout'), 10000));
            if (await Promise.race([exited, timer]) !== 'timeout') {
                return;
            }
        }
        app.kill();
        await exited;
    }

    /**
     * 关掉应用后用同一个用户数据目录重新启动，检查设置是否记住。
     * 要求 AI 接口保持开启，否则重启后无法通过它判断就绪。
     */
    ctx.restart = async () => {
        await quit(true);
        // 等上一个实例的单实例锁和端口释放
        await sleep(500);
        await launch();
    };

    before(async () => {
        ctx.port = await freePort();
        ctx.controlPort = await freePort();
        pageServer = http.createServer(handlePage);
        ctx.pagePort = await listenSafe(pageServer);

        userData = fs.mkdtempSync(path.join(os.tmpdir(), 'mybrowser-e2e-'));
        ctx.userData = userData;
        fs.writeFileSync(path.join(userData, 'mcp.json'), JSON.stringify({ enabled: true, port: ctx.port, token: TOKEN }));
        await launch();
    });

    after(async () => {
        await quit();
        pageServer && pageServer.close();
        pageServer && pageServer.closeAllConnections();
        // Electron 退出后才能删除用户数据目录
        for (let i = 0; i < 10; i++) {
            try {
                fs.rmSync(userData, { recursive: true, force: true });
                break;
            } catch {
                await sleep(300);
            }
        }
    });

    return ctx;
}

module.exports = { setup, freePort, sleep };
