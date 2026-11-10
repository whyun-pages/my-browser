// 真实应用的端到端测试（标签页工具）：用临时用户数据目录启动 MyBrowser，通过 MCP HTTP 接口调用。
// 运行：pnpm run test:mcp:e2e（需要先 pnpm run vite:build）
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setup, freePort, sleep } = require('./harness');

const ctx = setup();
const { call, rpc, shell, windowOp, waitUntil, url } = ctx;

test('tools/list exposes the tab tools', async () => {
    const res = await rpc('tools/list', {});
    const names = res.result.tools.map((t) => t.name);
    for (const name of ['list_tabs', 'open_tab', 'close_tab', 'activate_tab']) {
        assert.ok(names.includes(name), name);
    }
});

test('open_tab opens in the background, waits for load and marks the tab', async () => {
    const { tabs: beforeTabs } = await call('list_tabs');
    const activeBefore = beforeTabs.find((t) => t.active);
    assert.ok(activeBefore, 'there is an active tab');

    const opened = await call('open_tab', { url: url('BgOne') });
    assert.equal(opened.loadState, 'loaded');
    assert.equal(opened.title, 'BgOne');
    assert.ok(Number.isInteger(opened.tabId));

    const { tabs } = await call('list_tabs');
    const tab = tabs.find((t) => t.tabId === opened.tabId);
    assert.ok(tab, 'new tab is listed');
    assert.equal(tab.aiOpened, true);
    assert.equal(tab.active, false);
    assert.equal(tabs.find((t) => t.active).tabId, activeBefore.tabId, 'focus did not move');
    // 用户手动打开的标签页也在列表里，且不带 AI 标记
    assert.equal(tabs.find((t) => t.tabId === activeBefore.tabId).aiOpened, false);

    const badge = await shell(`(() => {
        const el = [...document.querySelectorAll('.tab')].find((t) => t.title === 'BgOne');
        return el ? { ai: el.classList.contains('ai-tab'), badge: el.querySelector('.tab-ai-badge')?.textContent } : null;
    })()`);
    assert.deepEqual(badge, { ai: true, badge: 'AI' });
});

test('activate_tab brings a tab to the front', async () => {
    const opened = await call('open_tab', { url: url('ActivateMe') });
    const res = await call('activate_tab', { tabId: opened.tabId });
    assert.equal(res.active, true);
    const { tabs } = await call('list_tabs');
    assert.equal(tabs.find((t) => t.active).tabId, opened.tabId);
    const addressBar = await shell(`document.getElementById('address-bar').value`);
    assert.equal(addressBar, url('ActivateMe'));
});

test('open_tab with background=false switches to the tab', async () => {
    const opened = await call('open_tab', { url: url('Foreground'), background: false });
    const { tabs } = await call('list_tabs');
    assert.equal(tabs.find((t) => t.active).tabId, opened.tabId);
});

test('open_tab reports a failed load but still returns the tab', async () => {
    const dead = await freePort();
    const opened = await call('open_tab', { url: `http://127.0.0.1:${dead}/`, timeoutMs: 15000 });
    assert.equal(opened.loadState, 'failed');
    assert.ok(Number.isInteger(opened.tabId));
    assert.ok(opened.error && opened.error.code < 0, JSON.stringify(opened.error));
    const { tabs } = await call('list_tabs');
    assert.ok(tabs.some((t) => t.tabId === opened.tabId));
});

test('open_tab on a port the browser blocks reports failed, not tab_not_ready', async () => {
    // 端口 1 被 Chromium 禁止，页面永远不会到达 dom-ready
    const opened = await call('open_tab', { url: 'http://127.0.0.1:1/', timeoutMs: 15000 });
    assert.ok(Number.isInteger(opened.tabId), JSON.stringify(opened));
    assert.equal(opened.loadState, 'failed', JSON.stringify(opened));
    const { tabs } = await call('list_tabs');
    assert.ok(tabs.some((t) => t.tabId === opened.tabId));
});

test('open_tab rejects unsupported URLs without opening a tab', async () => {
    const { tabs: beforeTabs } = await call('list_tabs');
    for (const bad of ['javascript:alert(1)', 'chrome://settings', 'not a url']) {
        const res = await call('open_tab', { url: bad });
        assert.equal(res.error.code, 'invalid_argument', bad);
    }
    const { tabs } = await call('list_tabs');
    assert.equal(tabs.length, beforeTabs.length);
});

test('close_tab closes; repeated close and unknown ids give tab_not_found', async () => {
    const opened = await call('open_tab', { url: url('CloseMe') });
    assert.deepEqual(await call('close_tab', { tabId: opened.tabId }), { tabId: opened.tabId, closed: true });
    const { tabs } = await call('list_tabs');
    assert.ok(!tabs.some((t) => t.tabId === opened.tabId));
    assert.equal((await call('close_tab', { tabId: opened.tabId })).error.code, 'tab_not_found');
    assert.equal((await call('activate_tab', { tabId: 987654 })).error.code, 'tab_not_found');
});

test('a tab the user closes manually becomes tab_not_found', async () => {
    const opened = await call('open_tab', { url: url('UserCloses') });
    const clicked = await shell(`(() => {
        const el = [...document.querySelectorAll('.tab')].find((t) => t.title === 'UserCloses');
        el.querySelector('.tab-close').click();
        return true;
    })()`);
    assert.equal(clicked, true);
    await waitUntil(async () => (await call('activate_tab', { tabId: opened.tabId })).error?.code === 'tab_not_found', 5000, 'tab_not_found');
});

test('on-demand rendering makes a background tab visible only while a tool runs', async () => {
    const opened = await call('open_tab', { url: url('RenderProbe') });
    const res = await call('__test_render_probe', { tabId: opened.tabId });
    assert.equal(res.before.visibility, 'hidden');
    assert.equal(res.during.visibility, 'visible');
    assert.ok(res.during.width > 0 && res.during.height > 0, JSON.stringify(res.during));
    // 渲染结束后页面重新变为隐藏。视口大小会保留上一次渲染时的值（第一阶段实验已观察到），不作为判断依据
    assert.equal(res.after.visibility, 'hidden');
    // 渲染期间和结束后焦点都没有变
    const { tabs } = await call('list_tabs');
    assert.notEqual(tabs.find((t) => t.active).tabId, opened.tabId);
    const cls = await shell(`[...document.querySelectorAll('webview')].filter((w) => w.classList.contains('mcp-rendering')).length`);
    assert.equal(cls, 0);
});

test('concurrent render requests on one tab share a single render', async () => {
    const opened = await call('open_tab', { url: url('RenderShared') });
    const results = await Promise.all([1, 2, 3].map(() => call('__test_render_probe', { tabId: opened.tabId })));
    for (const r of results) {
        assert.equal(r.during.visibility, 'visible', JSON.stringify(r));
    }
    await sleep(300);
    const cls = await shell(`[...document.querySelectorAll('webview')].filter((w) => w.classList.contains('mcp-rendering')).length`);
    assert.equal(cls, 0);
});

test('closing the last tab fails with last_tab', async () => {
    let { tabs } = await call('list_tabs');
    for (const t of tabs.slice(1)) {
        assert.equal((await call('close_tab', { tabId: t.tabId })).closed, true);
    }
    ({ tabs } = await call('list_tabs'));
    assert.equal(tabs.length, 1);
    const res = await call('close_tab', { tabId: tabs[0].tabId });
    assert.equal(res.error.code, 'last_tab');
    assert.equal((await call('list_tabs')).tabs.length, 1);
});

test('active webview fills the content area in both layouts', async () => {
    const measure = `(() => {
        const area = document.querySelector('.content-area').getBoundingClientRect();
        const wv = document.querySelector('webview.active').getBoundingClientRect();
        return { area: [area.x, area.y, area.width, area.height].map(Math.round), wv: [wv.x, wv.y, wv.width, wv.height].map(Math.round) };
    })()`;
    for (const layout of ['rail', 'classic']) {
        await shell(`localStorage.setItem('layout', '${layout}'); document.documentElement.dataset.layout = '${layout}'; true`);
        await sleep(300);
        const m = await shell(measure);
        assert.deepEqual(m.wv, m.area, `${layout}: ${JSON.stringify(m)}`);
    }
});

test('tools keep working while the window is minimized', async () => {
    await windowOp('minimize');
    try {
        const opened = await call('open_tab', { url: url('WhileMinimized') });
        assert.equal(opened.loadState, 'loaded');
        assert.equal(opened.title, 'WhileMinimized');
        // 不需要渲染的工具照常工作
        const html = await call('get_html', { tabId: opened.tabId, selector: 'h1' });
        assert.match(html.html, /WhileMinimized/);
        // 需要渲染的工具立刻说明是窗口最小化，而不是等超时后报“页面可能卡死”
        for (const [name, args] of [
            ['get_text', {}],
            ['query_dom', { selector: 'h1' }],
            ['click', { selector: 'h1' }],
            ['wait_for', { selector: 'h1', state: 'visible', timeoutMs: 2000 }],
        ]) {
            const started = Date.now();
            const res = await call(name, { tabId: opened.tabId, ...args });
            assert.equal(res.error?.code, 'window_minimized', `${name}: ${JSON.stringify(res)}`);
            assert.ok(Date.now() - started < 1500, `${name} failed fast`);
        }
    } finally {
        await windowOp('restore');
    }
});

test('after the browser UI reloads, old tab ids are invalid and new ones work', async () => {
    const opened = await call('open_tab', { url: url('BeforeReload') });
    await windowOp('reload');
    // 重新加载期间的调用返回明确错误，不会挂起
    const during = await call('list_tabs');
    assert.ok(during.tabs || during.error.code === 'window_unavailable', JSON.stringify(during));
    await waitUntil(async () => (await call('list_tabs')).tabs?.length >= 1, 20000, 'ui reloaded');
    assert.equal((await call('activate_tab', { tabId: opened.tabId })).error.code, 'tab_not_found');
    const { tabs } = await call('list_tabs');
    assert.ok(!tabs.some((t) => t.tabId === opened.tabId), 'old id is not reused');
    const again = await call('open_tab', { url: url('AfterReload') });
    assert.equal(again.loadState, 'loaded');
});
