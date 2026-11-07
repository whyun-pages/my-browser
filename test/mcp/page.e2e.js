// 真实应用的端到端测试（页面工具）：导航、读取、截图、点击、填表、事件、等待、执行脚本。
// 运行：pnpm run test:mcp:e2e（需要先 pnpm run vite:build）
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setup, freePort, sleep } = require('./harness');

const ctx = setup();
const { call, callRaw, rpc, shell, windowOp, url, fixture } = ctx;

const ALL_TOOLS = ['list_tabs', 'open_tab', 'close_tab', 'activate_tab', 'navigate', 'navigate_history', 'get_html', 'get_text',
    'query_dom', 'screenshot', 'click', 'fill', 'dispatch_event', 'wait_for', 'evaluate'];

async function open(target) {
    const opened = await call('open_tab', { url: target });
    assert.equal(opened.loadState, 'loaded', JSON.stringify(opened));
    return opened.tabId;
}

/** 读页面主世界里的值（测试辅助，经由 evaluate） */
async function pageValue(tabId, expression) {
    const res = await call('evaluate', { tabId, expression });
    assert.ok(!res.error, JSON.stringify(res));
    return res.value;
}

async function activeTabId() {
    return (await call('list_tabs')).tabs.find((t) => t.active).tabId;
}

test('tools/list exposes all 15 tools with descriptions', async () => {
    const res = await rpc('tools/list', {});
    const names = res.result.tools.map((t) => t.name);
    for (const name of ALL_TOOLS) {
        assert.ok(names.includes(name), name);
    }
    const evaluate = res.result.tools.find((t) => t.name === 'evaluate');
    assert.match(evaluate.description, /untrusted/i);
});

test('navigate loads a page, reports failures, rejects bad URLs and handles hash changes', async () => {
    const tabId = await open(url('NavStart'));
    const res = await call('navigate', { tabId, url: url('NavSecond') });
    assert.equal(res.loadState, 'loaded');
    assert.equal(res.title, 'NavSecond');
    assert.equal(res.canGoBack, true);

    const dead = await freePort();
    const failed = await call('navigate', { tabId, url: `http://127.0.0.1:${dead}/`, timeoutMs: 15000 });
    assert.equal(failed.error.code, 'navigation_failed', JSON.stringify(failed));
    assert.ok(failed.error.details.errorCode < 0);

    assert.equal((await call('navigate', { tabId, url: 'javascript:alert(1)' })).error.code, 'invalid_argument');

    await call('navigate', { tabId, url: url('NavHash') });
    const hash = await call('navigate', { tabId, url: `${url('NavHash')}#part` });
    assert.equal(hash.sameDocument, true, JSON.stringify(hash));

    const commit = await call('navigate', { tabId, url: `http://127.0.0.1:${ctx.pagePort}/slow?ms=200`, waitUntil: 'commit' });
    assert.equal(commit.waitedFor, 'commit');

    const timeout = await call('navigate', { tabId, url: `http://127.0.0.1:${ctx.pagePort}/slow?ms=3000`, timeoutMs: 500 });
    assert.equal(timeout.error.code, 'timeout', JSON.stringify(timeout));
    await sleep(3000);
});

test('navigate_history goes back and forward and reports when there is nowhere to go', async () => {
    const tabId = await open(url('HistA'));
    const none = await call('navigate_history', { tabId, direction: 'back' });
    assert.deepEqual([none.navigated, none.reason], [false, 'no_back_entry']);
    await call('navigate', { tabId, url: url('HistB') });
    const back = await call('navigate_history', { tabId, direction: 'back' });
    assert.equal(back.navigated, true);
    assert.equal(back.title, 'HistA');
    assert.equal(back.canGoForward, true);
    const fwd = await call('navigate_history', { tabId, direction: 'forward' });
    assert.equal(fwd.title, 'HistB');
    assert.equal((await call('navigate_history', { tabId, direction: 'forward' })).navigated, false);
});

test('get_html returns the document or one element, truncates and distinguishes selector errors', async () => {
    const tabId = await open(fixture('dom.html'));
    const doc = await call('get_html', { tabId });
    assert.match(doc.html, /^<!DOCTYPE html>/);
    assert.match(doc.html, /Secret hidden text/);
    const item = await call('get_html', { tabId, selector: '.item', index: 1 });
    assert.match(item.html, /^<li class="item" data-n="1">Item one<\/li>$/);
    assert.equal(item.matchCount, 3);
    const cut = await call('get_html', { tabId, maxLength: 20 });
    assert.equal(cut.html.length, 20);
    assert.equal(cut.truncated, true);
    assert.ok(cut.length > 20);
    assert.equal((await call('get_html', { tabId, selector: 'li[' })).error.code, 'invalid_selector');
    const missing = await call('get_html', { tabId, selector: '.item', index: 3 });
    assert.equal(missing.error.code, 'element_not_found');
    assert.equal(missing.error.details.matchCount, 3);
    assert.equal((await call('get_html', { tabId, selector: '#nope' })).error.code, 'element_not_found');
});

test('get_text returns visible text of a background tab only', async () => {
    const before = await activeTabId();
    const tabId = await open(fixture('dom.html'));
    const res = await call('get_text', { tabId });
    assert.match(res.text, /Visible paragraph/);
    assert.doesNotMatch(res.text, /Secret hidden text/);
    assert.doesNotMatch(res.text, /Invisible text/);
    assert.equal((await call('get_text', { tabId, selector: '#list' })).text, 'Item zero\nItem one\nItem two');
    const cut = await call('get_text', { tabId, maxLength: 5 });
    assert.deepEqual([cut.text, cut.truncated], ['Dom f', true]);
    assert.equal(await activeTabId(), before, 'focus did not move');
});

test('query_dom describes matches with visibility and rectangles', async () => {
    const tabId = await open(fixture('dom.html'));
    const res = await call('query_dom', { tabId, selector: 'p' });
    assert.equal(res.matchCount, 3);
    const [visible, hidden, invisible] = res.elements;
    assert.equal(visible.visible, true);
    assert.ok(visible.rect.width > 0 && visible.rect.height > 0, JSON.stringify(visible.rect));
    assert.equal(hidden.visible, false);
    assert.equal(invisible.visible, false);
    const limited = await call('query_dom', { tabId, selector: '.item', limit: 2 });
    assert.equal(limited.elements.length, 2);
    assert.equal(limited.truncated, true);
    assert.equal(limited.elements[1].attributes['data-n'], undefined);
    assert.equal(limited.elements[1].text, 'Item one');
    const btn = (await call('query_dom', { tabId, selector: '#disabled' })).elements[0];
    assert.equal(btn.disabled, true);
});

test('screenshot captures a background tab and an element in CSS pixels', async () => {
    const before = await activeTabId();
    const tabId = await open(fixture('dom.html'));
    const raw = await callRaw('screenshot', { tabId });
    assert.ok(!raw.isError, JSON.stringify(raw));
    const image = raw.content.find((c) => c.type === 'image');
    assert.equal(image.mimeType, 'image/png');
    const png = Buffer.from(image.data, 'base64');
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    const meta = raw.structuredContent;
    assert.equal(png.readUInt32BE(16), meta.width);
    assert.equal(meta.width, meta.clip.width, 'scaled to CSS pixels');

    const el = await callRaw('screenshot', { tabId, selector: '#box', format: 'jpeg' });
    assert.ok(!el.isError, JSON.stringify(el));
    assert.equal(el.structuredContent.mimeType, 'image/jpeg');
    assert.deepEqual([el.structuredContent.width, el.structuredContent.height], [120, 60]);

    // 没设背景色的页面：浏览器里是白底，截图也必须是不透明的白底（JPEG 曾经变成黑底）
    for (const format of ['png', 'jpeg']) {
        const shot = await callRaw('screenshot', { tabId, format });
        const img = shot.content.find((c) => c.type === 'image');
        const pixel = await pageValue(tabId, `(async () => {
            const blob = await (await fetch('data:${img.mimeType};base64,${img.data}')).blob();
            const bmp = await createImageBitmap(blob);
            const cv = new OffscreenCanvas(bmp.width, bmp.height);
            const ctx = cv.getContext('2d');
            ctx.drawImage(bmp, 0, 0);
            return Array.from(ctx.getImageData(bmp.width - 40, bmp.height - 10, 1, 1).data);
        })()`);
        assert.ok(pixel.every((v) => v >= 240), `${format} background is opaque white: ${pixel}`);
    }
    assert.equal(await activeTabId(), before, 'focus did not move');

    await windowOp('minimize');
    try {
        const res = await call('screenshot', { tabId });
        assert.equal(res.error.code, 'window_minimized');
    } finally {
        await windowOp('restore');
    }
});

test('click sends a trusted click, scrolls to far elements and refuses covered ones', async () => {
    const before = await activeTabId();
    const focusedId = `document.activeElement && (document.activeElement.id || document.activeElement.tagName)`;
    const tabId = await open(fixture('dom.html'));
    // 用户正在地址栏里输入
    await shell(`document.getElementById('address-bar').focus(); true`);
    const focusBefore = await shell(focusedId);
    assert.equal(focusBefore, 'address-bar');
    const res = await call('click', { tabId, selector: '#btn' });
    assert.equal(res.clicked, true, JSON.stringify(res));
    assert.equal(res.received, true);
    const far = await call('click', { tabId, selector: '#far' });
    assert.equal(far.scrolled, true, JSON.stringify(far));
    const covered = await call('click', { tabId, selector: '#covered' });
    assert.equal(covered.error.code, 'element_not_interactable', JSON.stringify(covered));
    assert.equal((await call('click', { tabId, selector: '#disabled' })).error.code, 'element_not_interactable');
    assert.equal((await call('click', { tabId, selector: '#covered', method: 'dom' })).clicked, true);
    const log = await pageValue(tabId, 'window.log');
    assert.deepEqual(log.map((e) => [e.name, e.trusted]), [['btn', true], ['far', true], ['covered', false]]);
    assert.equal(await activeTabId(), before, 'focus did not move');
    // 外壳页面的键盘焦点没有被后台点击抢走
    assert.equal(await shell(focusedId), focusBefore);
});

test('concurrent real clicks on one or several tabs all land', async () => {
    // 客户端（如 Cola）会并发发出多个工具调用
    const a = await open(fixture('dom.html'));
    const b = await open(fixture('dom.html'));
    const results = await Promise.all([
        call('click', { tabId: a, selector: '#btn' }),
        call('click', { tabId: a, selector: '#far' }),
        call('click', { tabId: b, selector: '#btn' }),
        call('click', { tabId: a, selector: '#covered' }),
    ]);
    assert.equal(results[0].received, true, JSON.stringify(results[0]));
    assert.equal(results[1].received, true, JSON.stringify(results[1]));
    assert.equal(results[2].received, true, JSON.stringify(results[2]));
    assert.equal(results[3].error?.code, 'element_not_interactable', JSON.stringify(results[3]));
    assert.deepEqual((await pageValue(a, 'window.log')).map((e) => e.name), ['btn', 'far']);
    assert.deepEqual((await pageValue(b, 'window.log')).map((e) => e.name), ['btn']);
});

test('tools keep working while another window covers the browser', async () => {
    const tabId = await open(fixture('dom.html'));
    await windowOp('cover');
    try {
        assert.match((await call('get_text', { tabId })).text || '', /Visible paragraph/);
        const shot = await callRaw('screenshot', { tabId, selector: '#box' });
        assert.ok(!shot.isError, JSON.stringify(shot));
        assert.equal((await call('click', { tabId, selector: '#btn' })).received, true);
    } finally {
        await windowOp('uncover');
    }
});

test('click on a link starts navigation and wait_for follows it', async () => {
    const tabId = await open(fixture('dom.html'));
    const res = await call('click', { tabId, selector: '#nav-link' });
    assert.equal(res.clicked, true, JSON.stringify(res));
    const waited = await call('wait_for', { tabId, urlIncludes: 'LinkTarget', timeoutMs: 10000 });
    assert.equal(waited.satisfied, true, JSON.stringify(waited));
    const loaded = await call('wait_for', { tabId, text: 'LinkTarget', timeoutMs: 10000 });
    assert.equal(loaded.satisfied, true, JSON.stringify(loaded));
});

test('fill handles text, framework-tracked inputs, select, checkbox, radio, contenteditable', async () => {
    const tabId = await open(fixture('form.html'));
    assert.equal((await call('fill', { tabId, selector: '#name', value: 'Alice' })).value, 'Alice');
    assert.deepEqual(await pageValue(tabId, 'window.frameworkChanges'), ['Alice'], 'framework saw the change');
    assert.equal((await call('fill', { tabId, selector: '#bio', value: 'line1\nline2' })).value, 'line1\nline2');
    assert.equal((await call('fill', { tabId, selector: '#color', value: 'Green' })).value, 'g');
    assert.deepEqual((await call('fill', { tabId, selector: '#tags', value: ['a', 'Gamma'] })).value, ['a', 'c']);
    assert.equal((await call('fill', { tabId, selector: '#color', value: 'Purple' })).error.code, 'element_not_found');
    assert.equal((await call('fill', { tabId, selector: '#agree', value: true })).checked, true);
    assert.equal((await call('fill', { tabId, selector: '#agree', value: 'yes' })).error.code, 'invalid_argument');
    assert.equal((await call('fill', { tabId, selector: '#size-m', value: true })).checked, true);
    assert.equal((await call('fill', { tabId, selector: '#file', value: 'x' })).error.code, 'element_not_interactable');
    assert.equal((await call('fill', { tabId, selector: '#ro', value: 'x' })).error.code, 'element_not_interactable');
    assert.equal((await call('fill', { tabId, selector: '#editor', value: 'rich' })).value, 'rich');
    const events = await pageValue(tabId, 'window.events');
    for (const id of ['name', 'bio', 'color', 'tags', 'agree', 'size-m']) {
        assert.ok(events.some((e) => e.id === id && e.type === 'input'), `input on ${id}`);
        assert.ok(events.some((e) => e.id === id && e.type === 'change'), `change on ${id}`);
    }
    assert.ok(events.some((e) => e.id === 'editor' && e.type === 'input'));
});

test('fill with submit runs validation and submit listeners', async () => {
    const tabId = await open(fixture('form.html'));
    const invalid = await call('fill', { tabId, selector: '#name', value: 'Bob', submit: true });
    assert.equal(invalid.submit.valid, false, JSON.stringify(invalid));
    assert.equal(invalid.submit.invalidElement, 'input#email');
    assert.deepEqual(await pageValue(tabId, 'window.submits'), [], 'invalid form not submitted');
    const valid = await call('fill', { tabId, selector: '#email', value: 'bob@example.com', submit: true });
    assert.equal(valid.submit.valid, true);
    const submits = await pageValue(tabId, 'window.submits');
    assert.equal(submits.length, 1);
    assert.equal(submits[0].name, 'Bob');
    assert.equal(submits[0].email, 'bob@example.com');
});

test('dispatch_event dispatches untrusted events with init data', async () => {
    const tabId = await open(fixture('dom.html'));
    const custom = await call('dispatch_event', { tabId, selector: '#events', type: 'my-event', eventClass: 'CustomEvent', init: { detail: { n: 1, s: 'x' } } });
    assert.equal(custom.dispatched, true, JSON.stringify(custom));
    assert.equal(custom.defaultPrevented, true);
    await call('dispatch_event', { tabId, selector: '#events', type: 'keydown', eventClass: 'KeyboardEvent', init: { key: 'Enter' } });
    const log = await pageValue(tabId, 'window.log');
    assert.deepEqual(log[0], { name: 'my-event', detail: { n: 1, s: 'x' }, trusted: false });
    assert.deepEqual(log[1], { name: 'keydown', key: 'Enter', trusted: false });
    assert.equal((await call('dispatch_event', { tabId, selector: '#nope', type: 'x' })).error.code, 'element_not_found');
});

test('wait_for waits for elements, visibility, expressions and times out cleanly', async () => {
    const tabId = await open(`${fixture('dom.html')}?delay`);
    const attached = await call('wait_for', { tabId, selector: '#late', timeoutMs: 5000 });
    assert.equal(attached.satisfied, true, JSON.stringify(attached));
    assert.ok(attached.matchCount === 1);
    assert.equal((await call('wait_for', { tabId, selector: '#late', state: 'visible', timeoutMs: 5000 })).satisfied, true);
    assert.equal((await call('wait_for', { tabId, selector: '.hidden', state: 'hidden', timeoutMs: 2000 })).satisfied, true);
    assert.equal((await call('wait_for', { tabId, expression: 'document.querySelectorAll("li").length === 3' })).satisfied, true);
    const started = Date.now();
    const timeout = await call('wait_for', { tabId, selector: '#never', timeoutMs: 700 });
    assert.equal(timeout.error.code, 'timeout', JSON.stringify(timeout));
    assert.ok(Date.now() - started < 3000);
    assert.equal(timeout.error.details.last.matchCount, 0);
    assert.equal((await call('wait_for', { tabId })).error.code, 'invalid_argument');
    assert.equal((await call('wait_for', { tabId, selector: 'li[' })).error.code, 'invalid_selector');
    // 等待结束后不残留渲染状态
    const rendering = await shell(`document.querySelectorAll('webview.mcp-rendering').length`);
    assert.equal(rendering, 0);
});

test('evaluate returns JSON values and distinguishes errors', async () => {
    const tabId = await open(fixture('dom.html'));
    assert.equal(await pageValue(tabId, 'document.title'), 'DomFixture');
    assert.deepEqual(await pageValue(tabId, 'const n = 2; return { n, list: [1, "a", null] };'), { n: 2, list: [1, 'a', null] });
    assert.equal(await pageValue(tabId, 'await new Promise((r) => setTimeout(() => r(42), 50))'), 42);
    assert.equal((await pageValue(tabId, '({ a: 1 })')).a, 1);
    const undef = await call('evaluate', { tabId, expression: 'undefined' });
    assert.equal(undef.type, 'undefined');
    const thrown = await call('evaluate', { tabId, expression: 'throw new TypeError("boom")' });
    assert.equal(thrown.error.code, 'script_error', JSON.stringify(thrown));
    assert.match(thrown.error.message, /TypeError: boom/);
    const rejected = await call('evaluate', { tabId, expression: 'Promise.reject(new Error("nope"))' });
    assert.equal(rejected.error.code, 'script_error');
    assert.equal((await call('evaluate', { tabId, expression: 'document.body' })).error.details.type, 'node');
    assert.equal((await call('evaluate', { tabId, expression: '(() => { const a = {}; a.a = a; return a; })()' })).error.code, 'not_serializable');
    assert.equal((await call('evaluate', { tabId, expression: '1n' })).error.code, 'not_serializable');
    assert.equal((await call('evaluate', { tabId, expression: '"x".repeat(2000)', maxLength: 100 })).error.code, 'result_too_large');
    assert.equal((await call('evaluate', { tabId, expression: 'this is not js' })).error.code, 'invalid_argument');
});

test('a closed tab gives tab_not_found for page tools', async () => {
    const tabId = await open(fixture('dom.html'));
    await call('close_tab', { tabId });
    for (const [name, args] of [['get_html', {}], ['get_text', {}], ['click', { selector: 'a' }], ['evaluate', { expression: '1' }],
        ['screenshot', {}], ['wait_for', { selector: 'a' }], ['navigate', { url: url('X') }]]) {
        assert.equal((await call(name, { tabId, ...args })).error.code, 'tab_not_found', name);
    }
});

test('closing a tab while wait_for is pending returns tab_closed', async () => {
    const tabId = await open(fixture('dom.html'));
    const pending = call('wait_for', { tabId, selector: '#never', timeoutMs: 10000 });
    await sleep(300);
    await call('close_tab', { tabId });
    const res = await pending;
    assert.ok(['tab_closed', 'tab_not_found'].includes(res.error.code), JSON.stringify(res));
});

test('an infinite loop times out, marks the tab busy, and other tabs keep working', async () => {
    // 不同站点（127.0.0.1 与 localhost）的页面一般在不同渲染进程里
    const other = await open(url('OtherSite', 'localhost'));
    const sameSite = await open(url('SameSite'));
    const tabId = await open(url('Spinner'));
    const started = Date.now();
    const hung = await call('evaluate', { tabId, expression: 'while (true) {}', timeoutMs: 1000 });
    assert.equal(hung.error.code, 'timeout', JSON.stringify(hung));
    assert.ok(Date.now() - started < 5000);
    // 卡住的标签页不再接受页面操作，避免调用越堆越多
    for (const [name, args] of [['evaluate', { expression: '1' }], ['get_text', {}], ['get_html', {}]]) {
        assert.equal((await call(name, { tabId, ...args })).error.code, 'tab_busy', name);
    }
    // 服务和界面仍然响应
    assert.ok((await call('list_tabs')).tabs.length >= 3);
    const otherText = await call('get_text', { tabId: other, timeoutMs: 3000 });
    assert.equal(otherText.text, 'OtherSite', JSON.stringify(otherText));
    // 同站点的标签页可能共用渲染进程，这里只记录结果，不作为判断依据
    const same = await call('get_html', { tabId: sameSite, timeoutMs: 2000 });
    console.log(`# same-site tab while another spins: ${same.error ? same.error.code : 'responsive'}`);
    // 用户仍能关掉卡死的标签页
    assert.equal((await call('close_tab', { tabId })).closed, true);
    await call('close_tab', { tabId: sameSite }).catch(() => {});
    await call('close_tab', { tabId: other });
});
