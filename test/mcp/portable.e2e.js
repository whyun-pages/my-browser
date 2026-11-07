// 便携版的 Claude 桌面版配置：程序解压在临时目录里，转接脚本要复制到用户数据目录，改由本机 Node.js 运行。
// electron-builder 的便携版外壳会设置 PORTABLE_EXECUTABLE_FILE，这里用同名环境变量模拟。
// 运行：pnpm run test:mcp:e2e（需要先 pnpm run vite:build）
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');
const { setup } = require('./harness');

const ctx = setup({ env: { PORTABLE_EXECUTABLE_FILE: 'C:\\Portable Apps\\MyBrowser 2.0.1.exe' } });
const { shell, waitUntil } = ctx;
const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
const click = (sel) => shell(`(() => { const el = ${q(sel)}; if (!el) return false; el.click(); return true; })()`);

test('便携版：桌面版配置用 node 运行复制到用户数据目录的脚本，并给出说明', async () => {
    await click('#settings-btn');
    await click('#menu-more-settings');
    await click('[data-key="nav-mcp"]');
    await waitUntil(() => shell(`!!${q('#mcp-connect-btn')} && !${q('#mcp-connect-btn')}.disabled`), 5000, 'connect button');
    await click('#mcp-connect-btn');
    await waitUntil(() => shell(`!!${q('#mcp-client-claude-desktop')}`), 5000, 'dialog');
    await click('#mcp-client-claude-desktop');
    const config = JSON.parse(await shell(`${q('.mcp-dlg-body pre')}.textContent`));
    const server = config.mcpServers.mybrowser;
    const script = path.join(ctx.userData, 'mcp-bridge', 'stdio-bridge.js');
    assert.deepEqual(server, { command: 'node', args: [script, '--config', path.join(ctx.userData, 'mcp.json')] });
    assert.ok(fs.existsSync(script), '脚本已复制');
    assert.equal(fs.readFileSync(script, 'utf8'), fs.readFileSync(path.join(__dirname, '../../src/main/mcp/stdio-bridge.js'), 'utf8'));
    assert.match(await shell(`${q('.mcp-dlg-body .mcp-note')}.textContent`), /便携版.*Node\.js/);

    // 按这份配置真正启动一次：本机 node + 复制出来的脚本
    const child = spawn(process.execPath, server.args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = [];
    readline.createInterface({ input: child.stdout }).on('line', (l) => lines.push(JSON.parse(l)));
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } }) + '\n');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_tabs', arguments: {} } }) + '\n');
    await waitUntil(() => lines.some((m) => m.id === 2), 10000, 'bridge reply');
    child.stdin.end();
    const tabs = lines.find((m) => m.id === 2).result.structuredContent.tabs;
    assert.ok(tabs.length >= 1);
    await shell(`${q('.mcp-dlg-mask')}.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
});
