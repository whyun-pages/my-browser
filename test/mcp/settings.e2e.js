// 设置页和 AI 接口开关的端到端测试：通过界面操作，配合 MCP 接口检查结果。
// 运行：pnpm run test:mcp:e2e（需要先 pnpm run vite:build）
const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const { setup, sleep } = require('./harness');

const ctx = setup();
const { call, callRaw, shell, waitUntil, url, control } = ctx;
const addressBar = () => shell(`document.getElementById('address-bar').value`);

const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
const click = (sel) => shell(`(() => { const el = ${q(sel)}; if (!el) return false; el.click(); return true; })()`);
const text = (sel) => shell(`${q(sel)}?.textContent ?? null`);
const settingsTabId = () => shell(`(() => { const el = ${q('.tab.settings-tab')}; return el ? Number(el.dataset.tabId) : null; })()`);
const mcpReachable = async () => {
    try {
        return Array.isArray((await call('list_tabs')).tabs);
    } catch {
        return false;
    }
};

test('“更多设置”打开设置页标签，再次打开不会重复', async () => {
    assert.equal(await click('#settings-btn'), true);
    assert.equal(await shell(`!${q('#settings-panel')}.classList.contains('hidden')`), true);
    assert.equal(await click('#menu-more-settings'), true);
    await waitUntil(() => shell(`!!${q('#settings-page.active')}`), 5000, 'settings page');
    assert.equal(await shell(`${q('#settings-panel')}.classList.contains('hidden')`), true, '菜单关闭');
    assert.equal(await shell(`document.getElementById('address-bar').value`), 'mybrowser://settings/appearance');
    assert.equal(await shell(`${q('#cors-chip')}.classList.contains('internal')`), true);
    // 设置页盖住整个内容区
    const rect = await shell(`(() => {
        const a = ${q('.content-area')}.getBoundingClientRect(), p = ${q('#settings-page')}.getBoundingClientRect();
        return [a.width - p.width, a.height - p.height, p.width > 0 && p.height > 0];
    })()`);
    assert.deepEqual(rect, [0, 0, true]);

    await click('#settings-btn');
    await click('#about-menu');
    await waitUntil(async () => (await shell(`document.getElementById('address-bar').value`)) === 'mybrowser://settings/about', 5000, 'about');
    assert.equal(await shell(`document.querySelectorAll('.tab.settings-tab').length`), 1);
    assert.match(await text('.sp-about'), /MyBrowser/);
});

test('设置页不出现在 AI 的标签页列表里，也不能被 AI 关闭或切换', async () => {
    const id = await settingsTabId();
    assert.ok(Number.isInteger(id));
    const { tabs } = await call('list_tabs');
    assert.ok(tabs.length >= 1);
    assert.ok(!tabs.some((t) => t.tabId === id || String(t.url).startsWith('mybrowser:')), JSON.stringify(tabs));
    assert.ok(!tabs.some((t) => t.active), '设置页在前台时，列表里没有前台标签页');
    assert.equal((await call('close_tab', { tabId: id })).error.code, 'tab_not_found');
    assert.equal((await call('activate_tab', { tabId: id })).error.code, 'tab_not_found');
    assert.ok(await shell(`!!${q('#settings-page.active')}`));
});

test('AI 接口分区显示真实状态、地址和配置文件位置', async () => {
    await click('#settings-btn');
    await click('#menu-mcp-status');
    await waitUntil(async () => (await shell(`document.getElementById('address-bar').value`)) === 'mybrowser://settings/mcp', 5000, 'mcp section');
    assert.equal((await text('#mcp-status-label')).trim(), '运行中');
    assert.equal(await text('#mcp-endpoint'), `http://127.0.0.1:${ctx.port}/mcp`);
    assert.match(await text('#mcp-config-path'), /mybrowser-e2e-[^\\/]+[\\/]mcp\.json$/);
    assert.match(await text('.sp-warn'), /所有已打开的标签页/);
    assert.equal(await shell(`${q('[data-key="mcp-switch"]')}.getAttribute('aria-checked')`), 'true');
});

test('连接配置弹窗：令牌默认打码，桌面版配置走转接脚本且不含令牌', async () => {
    assert.equal(await click('#mcp-connect-btn'), true);
    await waitUntil(() => shell(`!!${q('.mcp-dlg')}`), 5000, 'dialog');
    const claude = await text('.mcp-dlg-body pre');
    assert.match(claude, new RegExp(`claude mcp add --transport http mybrowser http://127\\.0\\.0\\.1:${ctx.port}/mcp`));
    assert.ok(!claude.includes('e2e-token-0123456789abcdef'), '令牌没有明文显示');
    assert.ok(claude.includes('e2e-'), '露出前几位');

    await click('#mcp-reveal-token');
    assert.ok((await text('.mcp-dlg-body pre')).includes('e2e-token-0123456789abcdef'));

    await click('#mcp-client-claude-desktop');
    const desktop = JSON.parse(await text('.mcp-dlg-body pre'));
    const server = desktop.mcpServers.mybrowser;
    assert.match(server.args[0], /stdio-bridge\.js$/);
    assert.equal(server.args[1], '--config');
    assert.match(server.args[2], /mcp\.json$/);
    assert.equal(server.env.ELECTRON_RUN_AS_NODE, '1');
    assert.ok(!JSON.stringify(desktop).includes('e2e-token'), '桌面版配置不含令牌');

    await click('#mcp-client-vscode');
    const vscode = JSON.parse((await text('.mcp-dlg-body pre')).replace(/e2e-•+/, 'x'));
    assert.equal(vscode.servers.mybrowser.type, 'http');

    // Esc 关闭
    await shell(`${q('.mcp-dlg-mask')}.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
    assert.equal(await shell(`!!${q('.mcp-dlg')}`), false);
});

test('关掉开关后服务停止，打开后恢复', async () => {
    await click('[data-key="mcp-switch"]');
    await waitUntil(async () => (await text('#mcp-status-label'))?.trim() === '未开启', 10000, 'stopped');
    assert.equal(await mcpReachable(), false);
    assert.equal(await shell(`${q('#mcp-connect-btn')}.disabled`), true);
    assert.equal(await shell(`${q('#menu-mcp-status')}.classList.contains('hidden')`), true);

    await click('[data-key="mcp-switch"]');
    await waitUntil(async () => (await text('#mcp-status-label'))?.trim() === '运行中', 10000, 'running');
    await waitUntil(mcpReachable, 10000, 'reachable');
});

test('端口被占用时显示失败原因，放开端口后点“重试”恢复', async () => {
    await click('[data-key="mcp-switch"]');
    await waitUntil(async () => (await text('#mcp-status-label'))?.trim() === '未开启', 10000, 'stopped');
    const blocker = net.createServer();
    await new Promise((r) => blocker.listen(ctx.port, '127.0.0.1', r));
    try {
        await click('[data-key="mcp-switch"]');
        await waitUntil(async () => (await text('#mcp-status-label'))?.trim() === '启动失败', 10000, 'error');
        assert.match(await text('.sp-row-desc.bad'), /已被占用/);
        assert.equal(await shell(`${q('#menu-mcp-status .menu-status-title')}.textContent`), 'AI 接口启动失败');
        assert.equal(await shell(`!!${q('.sp-nav [data-section="mcp"] .sp-dot.error')}`), true);
    } finally {
        await new Promise((r) => blocker.close(r));
    }
    assert.equal(await click('[data-key="mcp-retry"]'), true);
    await waitUntil(async () => (await text('#mcp-status-label'))?.trim() === '运行中', 10000, 'running after retry');
    await waitUntil(mcpReachable, 10000, 'reachable');
});

test('搜索跨分区查找并高亮，没有结果时给出提示', async () => {
    await shell(`(() => { const i = ${q('#settings-search')}; i.value = '令牌'; i.dispatchEvent(new Event('input')); return true; })()`);
    assert.equal(await shell(`document.getElementById('address-bar').value`), 'mybrowser://settings?search=%E4%BB%A4%E7%89%8C');
    const found = await shell(`[...document.querySelectorAll('.sp-main .sp-sec')].map((s) => s.dataset.section)`);
    assert.deepEqual(found, ['mcp']);
    assert.ok(await shell(`document.querySelectorAll('.sp-main mark').length`) > 0);

    await shell(`(() => { const i = ${q('#settings-search')}; i.value = '主题'; i.dispatchEvent(new Event('input')); return true; })()`);
    assert.deepEqual(await shell(`[...document.querySelectorAll('.sp-main .sp-sec')].map((s) => s.dataset.section)`), ['appearance']);

    await shell(`(() => { const i = ${q('#settings-search')}; i.value = 'zzzz不存在'; i.dispatchEvent(new Event('input')); return true; })()`);
    assert.match(await text('.sp-empty'), /没有找到/);

    await shell(`(() => { const i = ${q('#settings-search')}; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; })()`);
    assert.equal(await shell(`${q('#settings-search')}.value`), '');
});

test('主题“跟随系统”删除保存的值；菜单和设置页显示同一个选择', async () => {
    await click('[data-key="nav-appearance"]');
    await click('[data-key="theme-dark"]');
    assert.equal(await shell(`localStorage.getItem('theme')`), 'dark');
    assert.equal(await shell(`${q('#settings-panel [data-theme-value="dark"]')}.getAttribute('aria-checked')`), 'true');
    await click('#settings-btn');
    await click('#settings-panel [data-theme-value="system"]');
    assert.equal(await shell(`localStorage.getItem('theme')`), null);
    assert.equal(await shell(`${q('[data-key="theme-system"]')}.getAttribute('aria-checked')`), 'true');
    await click('#settings-backdrop');
});

test('关闭设置页标签后回到网页，再打开是新的设置页', async () => {
    const id = await settingsTabId();
    assert.equal(await click(`[data-tab-id="${id}"] .tab-close`), true);
    await waitUntil(async () => (await settingsTabId()) === null, 5000, 'closed');
    assert.equal(await shell(`!!${q('#settings-page')}`), false);
    assert.equal(await shell(`!!${q('webview.active')}`), true);
    const { tabs } = await call('list_tabs');
    assert.ok(tabs.some((t) => t.active));
    await sleep(100);
});

// 菜单打开时外壳铺了一层透明遮罩；它盖在网页视图上，但不应影响 AI 操作，也不应被 AI 操作关掉
test('菜单遮罩打开时，前台和后台标签页的工具照常工作', async () => {
    const front = await call('open_tab', { url: url('UnderMenu'), background: false });
    const back = await call('open_tab', { url: url('BehindMenu') });
    assert.equal(await click('#settings-btn'), true);
    const menuOpen = () => shell(`!${q('#settings-backdrop')}.classList.contains('hidden') && !${q('#settings-panel')}.classList.contains('hidden')`);
    assert.equal(await menuOpen(), true);
    try {
        const probe = await call('__test_render_probe', { tabId: back.tabId });
        assert.equal(probe.during.visibility, 'visible', JSON.stringify(probe));
        assert.equal(probe.after.visibility, 'hidden');
        assert.match((await call('get_text', { tabId: front.tabId })).text, /UnderMenu/);
        assert.match((await call('get_text', { tabId: back.tabId })).text, /BehindMenu/);
        for (const tabId of [front.tabId, back.tabId]) {
            const raw = await callRaw('screenshot', { tabId });
            assert.ok(!raw.isError, JSON.stringify(raw));
            assert.ok(raw.content.some((c) => c.type === 'image' && c.data.length > 1000));
        }
        assert.equal((await call('click', { tabId: front.tabId, selector: 'h1' })).clicked, true);
        assert.equal(await menuOpen(), true, '菜单没有被关掉');
        const { tabs } = await call('list_tabs');
        assert.equal(tabs.find((t) => t.active).tabId, front.tabId, '焦点没有变');
    } finally {
        await click('#settings-backdrop');
    }
    assert.equal(await menuOpen(), false);
});

test('设置页在前台时，所有网页都在后台，工具仍能渲染和读取', async () => {
    const tab = await call('open_tab', { url: url('UnderSettings'), background: false });
    await click('#settings-btn');
    await click('#menu-more-settings');
    await waitUntil(() => shell(`!!${q('#settings-page.active')}`), 5000, 'settings page');
    const probe = await call('__test_render_probe', { tabId: tab.tabId });
    assert.equal(probe.during.visibility, 'visible', JSON.stringify(probe));
    assert.match((await call('get_text', { tabId: tab.tabId })).text, /UnderSettings/);
    assert.ok(await shell(`!!${q('#settings-page.active')}`), '设置页仍在前台');
    assert.match(await addressBar(), /^mybrowser:\/\/settings/);
});

test('焦点在网页里时按 Ctrl+, 打开设置页；在外壳里按也一样', async () => {
    const id = await settingsTabId();
    if (id !== null) {
        await click(`[data-tab-id="${id}"] .tab-close`);
        await waitUntil(async () => (await settingsTabId()) === null, 5000, 'closed');
    }
    const tab = await call('open_tab', { url: url('KeyFocus'), background: false });
    assert.equal((await call('list_tabs')).tabs.find((t) => t.active).tabId, tab.tabId);
    await control('/key', { url: 'KeyFocus', keyCode: ',', modifiers: ['control'] });
    await waitUntil(() => shell(`!!${q('#settings-page.active')}`), 5000, 'settings via webview shortcut');
    assert.equal(await addressBar(), 'mybrowser://settings/appearance');
    // 网页里没有收到这个按键的默认行为（preventDefault），普通字符仍交给网页
    await call('activate_tab', { tabId: tab.tabId });
    await waitUntil(async () => (await addressBar()) === url('KeyFocus'), 5000, 'back to page');

    await shell(`document.getElementById('address-bar').focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key: ',', code: 'Comma', ctrlKey: true, bubbles: true })); true`);
    await waitUntil(() => shell(`!!${q('#settings-page.active')}`), 5000, 'settings via shell shortcut');
    assert.equal(await shell(`document.querySelectorAll('.tab.settings-tab').length`), 1);
});
