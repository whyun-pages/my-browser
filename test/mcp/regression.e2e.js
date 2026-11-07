// 浏览器基本功能的回归检查（原计划提到的 101 项冒烟测试在仓库和提交历史里都找不到，按现有功能补建）。
// 覆盖：地址栏、快捷键（焦点在网页和外壳里）、书签、跨域开关、切换标签页和布局不刷新、重启后记住设置。
// 运行：pnpm run test:mcp:e2e（需要先 pnpm run vite:build）
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, sleep } = require('./harness');

const ctx = setup();
const { call, shell, waitUntil, url, fixture, control } = ctx;

const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
const click = (sel) => shell(`(() => { const el = ${q(sel)}; if (!el) return false; el.click(); return true; })()`);
const addressBar = () => shell(`document.getElementById('address-bar').value`);
// 新标签页刚切到前台时，网页视图可能还没在主进程注册，列表里暂时没有前台标签页，稍等一下
const activeTab = () => waitUntil(async () => (await call('list_tabs')).tabs.find((t) => t.active), 5000, 'active tab listed');
const evaluate = async (tabId, expression) => {
    const res = await call('evaluate', { tabId, expression });
    assert.ok(!res.error, JSON.stringify(res));
    return res.value;
};
/** 向网页视图发真实按键（焦点在网页里） */
const pageKey = (pageUrl, keyCode, modifiers = []) => control('/key', { url: pageUrl, keyCode, modifiers });
/** 在外壳里按键（焦点在地址栏等外壳控件上） */
const shellKey = (init) => shell(`document.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify({ bubbles: true, cancelable: true, ...init })})); true`);
const typeInAddressBar = (value) => shell(`(() => {
    const bar = document.getElementById('address-bar');
    bar.focus();
    bar.value = ${JSON.stringify(value)};
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return true;
})()`);
const openFront = async (title) => {
    const tab = await call('open_tab', { url: url(title), background: false });
    assert.equal(tab.loadState, 'loaded', JSON.stringify(tab));
    return tab.tabId;
};
const tabCount = () => shell(`document.querySelectorAll('.tab').length`);

test('地址栏：网址、本机地址补 http、搜索词、设置页地址', async () => {
    const tabId = await openFront('AddrStart');
    // 不带协议的本机地址按 http 打开
    await typeInAddressBar(`127.0.0.1:${ctx.pagePort}/?AddrTyped`);
    await waitUntil(async () => (await call('list_tabs')).tabs.find((t) => t.tabId === tabId).title === 'AddrTyped', 10000, 'typed url loads');
    assert.equal(await addressBar(), url('AddrTyped'));
    assert.equal((await activeTab()).tabId, tabId, '在当前标签页里打开');

    // 带空格的输入走搜索；只看网页视图要打开的地址，不依赖外网
    await typeInAddressBar('my browser test');
    assert.equal(await shell(`${q('webview.active')}.getAttribute('src')`), 'https://www.bing.com/search?q=my%20browser%20test');

    // 设置页地址打开设置页，不替换当前网页
    await call('navigate', { tabId, url: url('AddrBack') });
    await typeInAddressBar('mybrowser://settings/web');
    await waitUntil(() => shell(`!!${q('#settings-page.active')}`), 5000, 'settings page');
    assert.equal(await addressBar(), 'mybrowser://settings/web');
    // 在设置页里输入网址：用网页取代设置页
    await typeInAddressBar(url('AddrFromSettings'));
    await waitUntil(async () => (await addressBar()) === url('AddrFromSettings'), 10000, 'page replaces settings');
    assert.equal(await shell(`document.querySelectorAll('.tab.settings-tab').length`), 0);
});

test('快捷键（焦点在网页里）：Ctrl+T、Ctrl+L、Ctrl+D、Ctrl+R、Alt+←/→', async () => {
    const tabId = await openFront('KeyPage');
    const before = await tabCount();
    await pageKey('KeyPage', 'T', ['control']);
    await waitUntil(async () => (await tabCount()) === before + 1, 5000, 'Ctrl+T');
    // 新标签页在前台；用外壳里的 Ctrl+W 关掉它，回到原网页
    assert.notEqual((await activeTab())?.tabId, tabId);
    await shellKey({ key: 'w', code: 'KeyW', ctrlKey: true });
    await waitUntil(async () => (await tabCount()) === before, 5000, 'Ctrl+W');
    await waitUntil(async () => (await activeTab())?.tabId === tabId, 5000, 'back to page');

    await pageKey('KeyPage', 'L', ['control']);
    await waitUntil(() => shell(`document.activeElement?.id === 'address-bar'`), 5000, 'Ctrl+L');

    await pageKey('KeyPage', 'D', ['control']);
    await waitUntil(() => shell(`[...document.querySelectorAll('#bookmarks-list .bookmark-info')].some((b) => b.title === ${JSON.stringify(url('KeyPage'))})`), 5000, 'Ctrl+D');

    await evaluate(tabId, 'window.__marker = 42');
    await pageKey('KeyPage', 'R', ['control']);
    await waitUntil(async () => (await evaluate(tabId, 'typeof window.__marker')) === 'undefined', 10000, 'Ctrl+R reloads');
    // 等刷新完全结束再跳转：加载中的跳转会替换当前历史记录，后退就回不去了
    await waitUntil(async () => !(await shell(`${q('webview.active')}.isLoading()`))
        && (await evaluate(tabId, 'document.readyState')) === 'complete', 10000, 'reload finished');

    await call('navigate', { tabId, url: url('KeyPageNext') });
    await waitUntil(() => shell(`${q('webview.active')}.canGoBack()`), 5000, 'has history');
    await pageKey('KeyPageNext', 'Left', ['alt']);
    await waitUntil(async () => (await addressBar()) === url('KeyPage'), 10000, 'Alt+Left');
    await pageKey('KeyPage', 'Right', ['alt']);
    await waitUntil(async () => (await addressBar()) === url('KeyPageNext'), 10000, 'Alt+Right');
});

test('普通按键和 Ctrl+A 仍交给网页处理', async () => {
    const tab = await call('open_tab', { url: fixture('form.html'), background: false });
    await evaluate(tab.tabId, `document.getElementById('name').focus(); true`);
    for (const k of ['A', 'B', 'C']) {
        await pageKey('form.html', k);
    }
    await waitUntil(async () => (await evaluate(tab.tabId, `document.getElementById('name').value`)).toLowerCase() === 'abc', 5000, 'typing');
    await pageKey('form.html', 'A', ['control']);
    const sel = await evaluate(tab.tabId, `(() => { const i = document.getElementById('name'); return [i.selectionStart, i.selectionEnd]; })()`);
    assert.deepEqual(sel, [0, 3], 'Ctrl+A 在输入框里全选');
    assert.equal((await activeTab()).tabId, tab.tabId, '没有触发浏览器操作');
});

test('书签：星标收藏和取消，收藏夹里打开和移除，写入 bookmarks.json', async () => {
    const tabId = await openFront('Starred');
    const starOn = () => shell(`${q('#bookmark-btn')}.classList.contains('on')`);
    const listed = () => shell(`[...document.querySelectorAll('#bookmarks-list .bookmark-info')].some((b) => b.title === ${JSON.stringify(url('Starred'))})`);
    await click('#bookmark-btn');
    await waitUntil(listed, 5000, 'bookmarked');
    assert.equal(await starOn(), true);
    const file = path.join(ctx.userData, 'bookmarks.json');
    await waitUntil(() => fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(url('Starred')), 5000, 'saved to file');

    await click('#bookmark-btn');
    await waitUntil(async () => !(await listed()), 5000, 'unbookmarked');
    assert.equal(await starOn(), false);

    await click('#bookmark-btn');
    await waitUntil(listed, 5000, 'bookmarked again');
    const before = await tabCount();
    await shell(`[...document.querySelectorAll('#bookmarks-list .bookmark-info')].find((b) => b.title === ${JSON.stringify(url('Starred'))}).click(); true`);
    await waitUntil(async () => (await tabCount()) === before + 1, 5000, 'opened from bookmarks');
    await waitUntil(async () => (await addressBar()) === url('Starred'), 10000, 'bookmark url');
    assert.notEqual((await activeTab()).tabId, tabId, '在新标签页里打开');

    await shell(`[...document.querySelectorAll('#bookmarks-list .bookmark-item')].find((li) => li.querySelector('.bookmark-info').title === ${JSON.stringify(url('Starred'))}).querySelector('.bookmark-remove').click(); true`);
    await waitUntil(async () => !(await listed()), 5000, 'removed');
    assert.equal(await starOn(), false, '当前页的星标同步熄灭');
    await waitUntil(() => !fs.readFileSync(file, 'utf8').includes(url('Starred')), 5000, 'removed from file');
});

test('跨域开关：只影响之后新开的标签页，并真正改变同源策略', async () => {
    const other = url('CorsTarget', 'localhost');
    const tryFetch = (tabId) => evaluate(tabId, `return fetch(${JSON.stringify(other)}).then((r) => r.text()).then((t) => t.includes('CorsTarget') ? 'ok' : 'bad', (e) => 'blocked:' + e.name)`);
    const chip = () => shell(`document.getElementById('cors-chip-text').textContent`);

    assert.equal(await shell(`localStorage.getItem('allowCrossOrigin') !== '0'`), true, '默认放行');
    const allowed = await openFront('CorsOn');
    assert.equal(await chip(), '跨域已放行');
    assert.equal(await tryFetch(allowed), 'ok');

    await typeInAddressBar('mybrowser://settings/web');
    await waitUntil(() => shell(`!!${q('[data-key="cors"]')}`), 5000, 'cors switch');
    await click('[data-key="cors"]');
    assert.equal(await shell(`${q('[data-key="cors"]')}.getAttribute('aria-checked')`), 'false');

    const blocked = await openFront('CorsOff');
    assert.equal(await chip(), '未放行跨域');
    assert.match(await tryFetch(blocked), /^blocked:TypeError/);
    // 已经打开的标签页保持原状
    assert.equal(await tryFetch(allowed), 'ok');
    await call('activate_tab', { tabId: allowed });
    await waitUntil(async () => (await chip()) === '跨域已放行', 5000, 'chip follows tab');

    await typeInAddressBar('mybrowser://settings/web');
    await waitUntil(() => shell(`!!${q('[data-key="cors"]')}`), 5000, 'cors switch');
    await click('[data-key="cors"]');
    assert.equal(await shell(`localStorage.getItem('allowCrossOrigin')`), '1');
});

test('切换标签页、切换布局、收起侧栏都不会刷新网页', async () => {
    const a = await openFront('KeepA');
    const b = await openFront('KeepB');
    const stamp = (tabId) => evaluate(tabId, `window.__keep = window.__keep || Math.random(); return [window.__keep, performance.timeOrigin]`);
    const sa = await stamp(a);
    const sb = await stamp(b);
    const clickTab = (title) => shell(`[...document.querySelectorAll('.tab')].find((t) => t.title === ${JSON.stringify(title)}).click(); true`);
    await clickTab('KeepA');
    await waitUntil(async () => (await activeTab())?.tabId === a, 5000, 'switch to A');
    await clickTab('KeepB');
    await waitUntil(async () => (await activeTab())?.tabId === b, 5000, 'switch to B');

    await typeInAddressBar('mybrowser://settings/appearance');
    await waitUntil(() => shell(`!!${q('[data-key="layout-rail"]')}`), 5000, 'appearance');
    for (const layout of ['rail', 'classic', 'rail']) {
        await click(`[data-key="layout-${layout}"]`);
        await waitUntil(() => shell(`document.documentElement.dataset.layout === '${layout}'`), 5000, layout);
        await sleep(200);
    }
    await click('#rail-fold-btn');
    await sleep(200);
    await click('#rail-fold-btn');
    await clickTab('KeepA');
    await waitUntil(async () => (await activeTab())?.tabId === a, 5000, 'back to A');

    assert.deepEqual(await stamp(a), sa);
    assert.deepEqual(await stamp(b), sb);
});

test('重启后记住布局、主题、侧栏收起、跨域开关、书签和 AI 接口开关', async () => {
    const keep = await openFront('KeepAfterRestart');
    await click('#bookmark-btn');
    await typeInAddressBar('mybrowser://settings/appearance');
    await waitUntil(() => shell(`!!${q('[data-key="layout-rail"]')}`), 5000, 'appearance');
    await click('[data-key="layout-rail"]');
    await click('[data-key="theme-dark"]');
    await click('[data-key="rail-slim"]');
    await click('[data-key="nav-web"]');
    await click('[data-key="cors"]');
    const saved = await shell(`[localStorage.getItem('layout'), localStorage.getItem('theme'), localStorage.getItem('railCollapsed'), localStorage.getItem('allowCrossOrigin')]`);
    assert.deepEqual(saved, ['rail', 'dark', '1', '0']);
    assert.ok(keep >= 0);

    await ctx.restart();

    const after = await shell(`({
        layout: document.documentElement.dataset.layout,
        dark: document.documentElement.classList.contains('dark-theme'),
        storage: [localStorage.getItem('layout'), localStorage.getItem('theme'), localStorage.getItem('railCollapsed'), localStorage.getItem('allowCrossOrigin')],
    })`);
    assert.deepEqual(after.storage, ['rail', 'dark', '1', '0']);
    assert.equal(after.layout, 'rail');
    assert.equal(after.dark, true);
    await waitUntil(() => shell(`[...document.querySelectorAll('#bookmarks-list .bookmark-info')].some((b) => b.title === ${JSON.stringify(url('KeepAfterRestart'))})`), 5000, 'bookmark kept');
    // 跨域关闭后，重启后新开的标签页同样不放行
    await openFront('AfterRestart');
    assert.equal(await shell(`document.getElementById('cors-chip-text').textContent`), '未放行跨域');
    // AI 接口保持开启：能调用说明服务已自动启动
    assert.equal(JSON.parse(fs.readFileSync(path.join(ctx.userData, 'mcp.json'), 'utf8')).enabled, true);
});
