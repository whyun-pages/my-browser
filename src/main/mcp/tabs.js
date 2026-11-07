// 标签页桥：维护“标签页编号 → 网页视图”的对应表，并通过 IPC 请求界面执行开关、切换、按需渲染。
//
// 对外的标签页编号直接使用网页视图的 webContents id：它在整个应用运行期间不会重复，
// 界面重新加载或窗口重建后，旧编号也不会指向新的页面。
const { ipcMain, webContents } = require('electron');
const { McpToolError, ErrorCodes } = require('./errors');
const { buildScript } = require('./page-scripts');

const RENDERER_TIMEOUT_MS = 5000;
/** 按需渲染：开始渲染后等待页面变为可见的时间 */
const RENDER_READY_TIMEOUT_MS = 1500;

/**
 * 工具脚本使用的隔离世界编号。Electron 的 preload 在开启上下文隔离时使用 999，这里避开它；
 * 页面改写的全局对象（如 innerWidth）影响不到隔离世界。
 */
const MCP_WORLD_ID = 1001;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 等待主框架加载结束。
 * @returns {Promise<{loadState: 'loaded'|'failed'|'timeout'|'closed', error?: {code: number, description: string}}>}
 */
function waitForLoad(wc, timeoutMs) {
    return new Promise((resolve) => {
        if (wc.isDestroyed()) {
            resolve({ loadState: 'closed' });
            return;
        }
        let timer;
        const finish = (result) => {
            clearTimeout(timer);
            if (!wc.isDestroyed()) {
                wc.off('did-stop-loading', onStop);
                wc.off('did-fail-load', onFail);
            }
            wc.off('destroyed', onDestroyed);
            resolve(result);
        };
        let failure;
        const onFail = (_event, code, description, _url, isMainFrame) => {
            // -3 是被新的跳转打断，后面还会有新的加载结果
            if (isMainFrame && code !== -3) {
                failure = { code, description };
            }
        };
        const onStop = () => finish(failure ? { loadState: 'failed', error: failure } : { loadState: 'loaded' });
        const onDestroyed = () => finish({ loadState: 'closed' });
        wc.on('did-fail-load', onFail);
        wc.on('did-stop-loading', onStop);
        wc.once('destroyed', onDestroyed);
        timer = setTimeout(() => finish({ loadState: 'timeout' }), timeoutMs);
        if (!wc.isLoading()) {
            onStop();
        }
    });
}

class TabBridge {
    /**
     * @param {{logger?: {info: Function, warn: Function, error: Function}}} [options]
     */
    constructor({ logger = console } = {}) {
        this.logger = logger;
        /** @type {import('electron').BrowserWindow | null} */
        this.window = null;
        /** 界面是否已初始化标签页逻辑；界面重新加载期间为 false */
        this.rendererReady = false;
        /** @type {Map<number, {wc: import('electron').WebContents, rendererTabId: number}>} key 为 webContents id */
        this.tabs = new Map();
        /** 等待注册的标签页：rendererTabId → resolve 列表 */
        this.registerWaiters = new Map();
        /** @type {Map<number, {resolve: Function, reject: Function, timer: NodeJS.Timeout}>} */
        this.pending = new Map();
        this.requestSeq = 0;
        /** 按需渲染引用计数：webContents id → 正在使用的工具数 */
        this.renderRefs = new Map();
        /**
         * 超时后仍未结束的脚本：webContents id → {since, op}。
         * 超时返回并不会终止页面里的 JavaScript；在它结束前不再向这个页面发送新脚本，避免调用越堆越多。
         */
        this.busy = new Map();
        this._addEvent();
    }

    /**
     * 绑定主窗口；macOS 上窗口重建后再次调用。
     * @param {import('electron').BrowserWindow | null} win
     */
    attachWindow(win) {
        this.window = win;
        this.rendererReady = false;
        if (!win) {
            return;
        }
        const shell = win.webContents;
        // 界面重新加载时，旧的请求不会再有应答
        shell.on('did-start-navigation', (details) => {
            if (details.isMainFrame && !details.isSameDocument) {
                this.rendererReady = false;
                this._rejectAll(ErrorCodes.WINDOW_UNAVAILABLE, '浏览器界面正在重新加载');
            }
        });
        win.on('closed', () => {
            if (this.window === win) {
                this.window = null;
                this.rendererReady = false;
                this._rejectAll(ErrorCodes.WINDOW_UNAVAILABLE, '浏览器窗口已关闭');
            }
        });
    }

    _isShell(sender) {
        const win = this.window;
        return !!win && !win.isDestroyed() && sender === win.webContents;
    }

    _addEvent() {
        ipcMain.on('mcp-renderer-ready', (event) => {
            if (this._isShell(event.sender)) {
                this.rendererReady = true;
            }
        });
        ipcMain.on('mcp-tab-response', (event, message) => {
            if (!this._isShell(event.sender) || !message || typeof message.requestId !== 'number') {
                return;
            }
            const entry = this.pending.get(message.requestId);
            if (!entry) {
                return; // 已超时或已取消
            }
            this.pending.delete(message.requestId);
            clearTimeout(entry.timer);
            if (message.ok) {
                entry.resolve(message.result);
            } else {
                const err = message.error || {};
                entry.reject(new McpToolError(err.code || ErrorCodes.INTERNAL, err.message || '界面处理请求失败', err.details));
            }
        });
    }

    _rejectAll(code, message) {
        for (const [id, entry] of this.pending) {
            clearTimeout(entry.timer);
            entry.reject(new McpToolError(code, message));
            this.pending.delete(id);
        }
    }

    /**
     * 登记网页视图。由 register-webview-handler 调用，重复调用是幂等的。
     * @returns {boolean} 是否通过校验
     */
    register(sender, { wcId, tabId }) {
        if (!this._isShell(sender) || !Number.isInteger(wcId) || !Number.isInteger(tabId)) {
            return false;
        }
        const wc = webContents.fromId(wcId);
        // 只接受挂在当前主窗口里的网页视图
        if (!wc || wc.isDestroyed() || wc.getType() !== 'webview' || wc.hostWebContents !== sender) {
            return false;
        }
        const existing = this.tabs.get(wcId);
        if (existing) {
            existing.rendererTabId = tabId;
        } else {
            this.tabs.set(wcId, { wc, rendererTabId: tabId });
            wc.once('destroyed', () => {
                this.tabs.delete(wcId);
                this.renderRefs.delete(wcId);
                this.busy.delete(wcId);
            });
            // 跳转到新文档后，旧文档里卡住的脚本已经不存在
            wc.on('did-navigate', () => this.busy.delete(wcId));
            wc.on('render-process-gone', () => this.busy.delete(wcId));
        }
        const waiters = this.registerWaiters.get(tabId);
        if (waiters) {
            this.registerWaiters.delete(tabId);
            waiters.forEach((resolve) => resolve(wcId));
        }
        return true;
    }

    _ensureWindow() {
        const win = this.window;
        if (!win || win.isDestroyed()) {
            throw new McpToolError(ErrorCodes.WINDOW_UNAVAILABLE, '浏览器窗口不可用（可能已关闭），请重新打开 MyBrowser 窗口');
        }
        if (!this.rendererReady) {
            throw new McpToolError(ErrorCodes.WINDOW_UNAVAILABLE, '浏览器界面尚未就绪，请稍后重试');
        }
        return win;
    }

    /**
     * 请求界面执行操作并等待应答。
     */
    request(op, payload = {}, timeoutMs = RENDERER_TIMEOUT_MS) {
        const win = this._ensureWindow();
        const requestId = ++this.requestSeq;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(requestId);
                reject(new McpToolError(ErrorCodes.RENDERER_TIMEOUT, `浏览器界面在 ${timeoutMs} ms 内没有响应（${op}）`));
            }, timeoutMs);
            this.pending.set(requestId, { resolve, reject, timer });
            win.webContents.send('mcp-tab-request', { requestId, op, payload });
        });
    }

    /**
     * 等待界面中某个标签页完成注册，返回对外编号。
     */
    waitForRegistration(rendererTabId, timeoutMs) {
        for (const [wcId, entry] of this.tabs) {
            if (entry.rendererTabId === rendererTabId && !entry.wc.isDestroyed()) {
                return Promise.resolve(wcId);
            }
        }
        return new Promise((resolve, reject) => {
            const list = this.registerWaiters.get(rendererTabId) || [];
            const timer = setTimeout(() => {
                const current = this.registerWaiters.get(rendererTabId) || [];
                const rest = current.filter((fn) => fn !== done);
                if (rest.length) this.registerWaiters.set(rendererTabId, rest);
                else this.registerWaiters.delete(rendererTabId);
                reject(new McpToolError(ErrorCodes.TAB_NOT_READY, `标签页在 ${timeoutMs} ms 内没有完成初始化`));
            }, timeoutMs);
            const done = (wcId) => {
                clearTimeout(timer);
                resolve(wcId);
            };
            list.push(done);
            this.registerWaiters.set(rendererTabId, list);
        });
    }

    /**
     * 按对外编号取网页视图；不存在或已销毁时抛出 tab_not_found。
     */
    get(tabId) {
        if (!Number.isInteger(tabId)) {
            throw new McpToolError(ErrorCodes.INVALID_ARGUMENT, 'tabId 必须是整数');
        }
        const entry = this.tabs.get(tabId);
        if (!entry || entry.wc.isDestroyed()) {
            throw new McpToolError(ErrorCodes.TAB_NOT_FOUND, `标签页 ${tabId} 不存在或已关闭，请用 list_tabs 获取当前标签页`);
        }
        return entry;
    }

    rendererTabIdToPublic(rendererTabId) {
        for (const [wcId, entry] of this.tabs) {
            if (entry.rendererTabId === rendererTabId) {
                return wcId;
            }
        }
        return undefined;
    }

    /**
     * 在执行 fn 期间让目标标签页保持渲染（后台标签页临时放到前台页下方）。
     * 同一标签页的多个工具调用共用一次渲染，最后一个结束时恢复。
     */
    async withRender(tabId, fn) {
        const entry = this.get(tabId);
        // 页面卡死时渲染探测也不会返回，先拒绝
        this.checkBusy(tabId);
        // 最小化时整个窗口停止渲染，等下去只会超时并误报“页面卡死”，直接说明原因
        if (this.isWindowMinimized()) {
            throw new McpToolError(ErrorCodes.WINDOW_MINIMIZED, '浏览器窗口已最小化，需要渲染页面的操作做不了，请让用户恢复窗口后重试');
        }
        const count = (this.renderRefs.get(tabId) || 0) + 1;
        this.renderRefs.set(tabId, count);
        try {
            if (count === 1) {
                await this._startRender(tabId, entry);
            } else {
                await this._waitVisible(entry.wc, RENDER_READY_TIMEOUT_MS);
            }
            return await fn(entry.wc);
        } finally {
            const left = (this.renderRefs.get(tabId) || 1) - 1;
            if (left <= 0) {
                this.renderRefs.delete(tabId);
                if (!entry.wc.isDestroyed()) {
                    // 等界面确认已恢复隐藏再返回，避免下一次调用看到残留的渲染状态
                    await this.request('render', { tabId: entry.rendererTabId, on: false }).catch(() => {});
                }
            } else {
                this.renderRefs.set(tabId, left);
            }
        }
    }

    async _startRender(tabId, entry) {
        // 实验中偶尔出现第一次切换未生效，失败时关掉再开一次
        let shell;
        for (let attempt = 0; attempt < 2; attempt++) {
            if (attempt > 0) {
                await this.request('render', { tabId: entry.rendererTabId, on: false });
            }
            shell = await this.request('render', { tabId: entry.rendererTabId, on: true });
            if (await this._waitVisible(entry.wc, RENDER_READY_TIMEOUT_MS)) {
                return;
            }
        }
        // 等待期间窗口被最小化
        if (this.isWindowMinimized()) {
            throw new McpToolError(ErrorCodes.WINDOW_MINIMIZED, '浏览器窗口已最小化，需要渲染页面的操作做不了，请让用户恢复窗口后重试');
        }
        // 偶发失败原因未查明，带上现场信息便于排查
        const win = this.window;
        const page = await Promise.race([
            entry.wc.executeJavaScriptInIsolatedWorld(MCP_WORLD_ID, [{ code: '({ visibility: document.visibilityState, width: innerWidth, height: innerHeight })' }]).catch((e) => ({ error: String(e && e.message) })),
            sleep(500).then(() => ({ error: 'no response' })),
        ]);
        throw new McpToolError(ErrorCodes.RENDER_UNAVAILABLE, `标签页 ${tabId} 无法进入渲染状态，页面可能卡死`, {
            page,
            shell,
            window: win && !win.isDestroyed()
                ? { visible: win.isVisible(), minimized: win.isMinimized(), focused: win.isFocused() }
                : null,
        });
    }

    /**
     * 等待页面认为自己可见且有视口；页面卡死时 executeJavaScript 不返回，所以每次探测都有超时。
     */
    async _waitVisible(wc, timeoutMs) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (wc.isDestroyed()) {
                return false;
            }
            const left = Math.max(50, deadline - Date.now());
            const visible = await Promise.race([
                wc.executeJavaScriptInIsolatedWorld(MCP_WORLD_ID, [{ code: 'document.visibilityState === "visible" && innerWidth > 0' }]).catch(() => false),
                sleep(left).then(() => false),
            ]);
            if (visible) {
                return true;
            }
            await sleep(20);
        }
        return false;
    }

    // ---- 页面脚本 ----

    checkBusy(tabId) {
        const busy = this.busy.get(tabId);
        if (busy) {
            throw new McpToolError(ErrorCodes.TAB_BUSY,
                `标签页 ${tabId} 上一次的脚本（${busy.op}）超时后仍在运行，页面可能卡死。`
                + '在它结束前不接受新的页面操作；等待片刻重试，或请用户刷新、关闭该标签页。',
                { tabId, op: busy.op, busyForMs: Date.now() - busy.since });
        }
    }

    _markBusy(tabId, op, run) {
        const mark = { since: Date.now(), op };
        this.busy.set(tabId, mark);
        const clear = () => {
            if (this.busy.get(tabId) === mark) {
                this.busy.delete(tabId);
            }
        };
        run.then(clear, clear);
    }

    /**
     * 在页面里执行一段脚本。默认在工具专用的隔离世界，main 为 true 时在页面主世界。
     * 超时、取消、页面关闭 / 跳转 / 崩溃都会立即返回对应错误；超时和取消不会终止已经在执行的脚本。
     * @param {number} tabId
     * @param {string} code
     * @param {{main?: boolean, timeoutMs?: number, signal?: AbortSignal, op?: string}} [options]
     */
    exec(tabId, code, { main = false, timeoutMs = 30000, signal, op = 'script' } = {}) {
        const { wc } = this.get(tabId);
        this.checkBusy(tabId);
        if (signal && signal.aborted) {
            return Promise.reject(new McpToolError(ErrorCodes.CANCELLED, '请求已取消'));
        }
        const run = main
            ? wc.executeJavaScript(code)
            : wc.executeJavaScriptInIsolatedWorld(MCP_WORLD_ID, [{ code }]);
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (fn, value, stillRunning) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (!wc.isDestroyed()) {
                    wc.off('did-navigate', onNavigate);
                    wc.off('render-process-gone', onGone);
                }
                wc.off('destroyed', onDestroyed);
                if (signal) signal.removeEventListener('abort', onAbort);
                if (stillRunning) this._markBusy(tabId, op, run);
                fn(value);
            };
            const onDestroyed = () => finish(reject, new McpToolError(ErrorCodes.TAB_CLOSED, `操作进行中标签页 ${tabId} 被关闭`));
            const onNavigate = () => finish(reject, new McpToolError(ErrorCodes.PAGE_NAVIGATED,
                `操作进行中标签页 ${tabId} 跳转到了新页面，结果丢失`, { url: wc.getURL() }));
            const onGone = (_e, details) => finish(reject, new McpToolError(ErrorCodes.TAB_CRASHED,
                `标签页 ${tabId} 的渲染进程已结束（${details && details.reason}）`));
            const onAbort = () => finish(reject, new McpToolError(ErrorCodes.CANCELLED, '请求已取消，已发出的脚本仍会在页面里执行完'), true);
            const timer = setTimeout(() => finish(reject, new McpToolError(ErrorCodes.TIMEOUT,
                `脚本在 ${timeoutMs} ms 内没有返回，页面可能卡死。超时不会终止页面里的脚本，它结束前该标签页不接受新的页面操作`,
                { tabId, op }), true), timeoutMs);
            wc.once('destroyed', onDestroyed);
            wc.on('did-navigate', onNavigate);
            wc.on('render-process-gone', onGone);
            if (signal) signal.addEventListener('abort', onAbort, { once: true });
            run.then(
                (value) => finish(resolve, value),
                (e) => finish(reject, new McpToolError(ErrorCodes.SCRIPT_ERROR, `脚本执行失败：${e && e.message ? e.message : e}`)),
            );
        });
    }

    /**
     * 在隔离世界执行 page-scripts.js 里的脚本，把脚本返回的 {ok: false, error} 转成 McpToolError。
     */
    async page(tabId, fn, args, options = {}) {
        const result = await this.exec(tabId, buildScript(fn, args), { op: fn.name, ...options });
        if (!result || typeof result !== 'object') {
            throw new McpToolError(ErrorCodes.INTERNAL, `页面脚本 ${fn.name} 没有返回结果`);
        }
        if (!result.ok) {
            const err = result.error || {};
            throw new McpToolError(err.code || ErrorCodes.INTERNAL, err.message || '页面脚本失败', err.details);
        }
        delete result.ok;
        return result;
    }

    /**
     * 开始一次导航并等待结果。
     * waitUntil：commit 等到新文档开始接收（did-navigate）；domcontentloaded 等到 DOMContentLoaded（dom-ready）；
     * load 等到主框架 load 事件（did-finish-load）。同文档跳转（锚点、history.pushState）在提交时就算完成。
     * @param {number} tabId
     * @param {(wc: import('electron').WebContents) => void} start
     */
    navigate(tabId, start, { waitUntil = 'load', timeoutMs = 30000, signal } = {}) {
        const { wc } = this.get(tabId);
        if (signal && signal.aborted) {
            return Promise.reject(new McpToolError(ErrorCodes.CANCELLED, '请求已取消'));
        }
        return new Promise((resolve, reject) => {
            let settled = false;
            let started = false;
            let committed = false;
            let sameDocument = false;
            const listeners = [];
            const on = (name, fn) => { wc.on(name, fn); listeners.push([name, fn]); };
            const finish = (fn, value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (!wc.isDestroyed()) listeners.forEach(([name, f]) => wc.off(name, f));
                wc.off('destroyed', onDestroyed);
                if (signal) signal.removeEventListener('abort', onAbort);
                fn(value);
            };
            const done = () => finish(resolve, {
                tabId, url: wc.getURL(), title: wc.getTitle(), loadState: 'loaded', waitedFor: sameDocument ? 'same-document' : waitUntil, sameDocument,
            });
            on('did-start-navigation', (details) => {
                if (details && details.isMainFrame) {
                    started = true;
                    sameDocument = !!details.isSameDocument;
                }
            });
            on('did-navigate-in-page', (_e, _url, isMainFrame) => {
                if (isMainFrame) {
                    sameDocument = true;
                    done();
                }
            });
            on('did-navigate', () => {
                committed = true;
                if (waitUntil === 'commit') done();
            });
            on('dom-ready', () => {
                if (committed && waitUntil === 'domcontentloaded') done();
            });
            // 要求新文档已提交：上一个页面还没加载完时，它的 did-finish-load 可能在新导航开始后才到
            on('did-finish-load', () => {
                if (started && committed) done();
            });
            // 从往返缓存恢复的页面不会再触发 load
            on('did-stop-loading', () => {
                if (committed) done();
            });
            on('did-fail-load', (_e, code, description, url, isMainFrame) => {
                // -3（ERR_ABORTED）是被新的跳转打断，继续等新的结果
                if (isMainFrame && code !== -3) {
                    finish(reject, new McpToolError(ErrorCodes.NAVIGATION_FAILED, `页面加载失败：${description}（${code}）`,
                        { tabId, url, errorCode: code, description }));
                }
            });
            const onDestroyed = () => finish(reject, new McpToolError(ErrorCodes.TAB_CLOSED, `导航过程中标签页 ${tabId} 被关闭`));
            wc.once('destroyed', onDestroyed);
            const onAbort = () => finish(reject, new McpToolError(ErrorCodes.CANCELLED, '请求已取消，页面可能仍在加载'));
            if (signal) signal.addEventListener('abort', onAbort, { once: true });
            const timer = setTimeout(() => finish(reject, new McpToolError(ErrorCodes.TIMEOUT,
                `导航在 ${timeoutMs} ms 内没有完成（等待 ${waitUntil}），页面仍会继续加载`,
                { tabId, url: wc.isDestroyed() ? undefined : wc.getURL(), stillLoading: !wc.isDestroyed() && wc.isLoading(), committed })), timeoutMs);
            try {
                start(wc);
            } catch (e) {
                finish(reject, e instanceof McpToolError ? e : new McpToolError(ErrorCodes.NAVIGATION_FAILED, String(e && e.message)));
            }
        });
    }

    // ---- 标签页操作（供 tools.js 使用） ----

    async listTabs() {
        const rendererTabs = await this.request('list');
        const tabs = [];
        let initializing = 0;
        for (const tab of rendererTabs) {
            const tabId = this.rendererTabIdToPublic(tab.tabId);
            if (tabId === undefined) {
                initializing++; // 网页视图还没挂载，暂时无法操作
                continue;
            }
            tabs.push({ ...tab, tabId });
        }
        return { tabs, initializing };
    }

    /**
     * 打开标签页并等待首次加载结束。加载失败或超时不算调用失败：返回编号和实际状态，避免客户端重复打开。
     */
    async openTab(url, { background = true, timeoutMs = 30000 } = {}) {
        const { tabId: rendererTabId } = await this.request('open', { url, background });
        let tabId;
        try {
            tabId = await this.waitForRegistration(rendererTabId, RENDERER_TIMEOUT_MS);
        } catch (e) {
            // 没法寻址的标签页留着只会越积越多，关掉它
            this.request('close', { tabId: rendererTabId }).catch(() => {});
            throw e;
        }
        const { wc } = this.get(tabId);
        const load = await waitForLoad(wc, timeoutMs);
        if (load.loadState === 'loaded') {
            // 首次加载失败时，失败事件发生在网页视图登记之前，主进程监听不到；
            // 界面从一开始就在记录，以界面记录的为准
            const tab = await this._rendererTab(rendererTabId);
            if (tab && tab.loadError) {
                return {
                    tabId, url: wc.getURL(), title: wc.getTitle(),
                    loadState: 'failed', error: { code: tab.loadError.code, description: tab.loadError.description },
                };
            }
        }
        return { tabId, url: wc.getURL(), title: wc.getTitle(), ...load };
    }

    async _rendererTab(rendererTabId) {
        const list = await this.request('list');
        return list.find((t) => t.tabId === rendererTabId);
    }

    async closeTab(tabId) {
        const { rendererTabId } = this.get(tabId);
        await this.request('close', { tabId: rendererTabId });
        return { tabId, closed: true };
    }

    async activateTab(tabId) {
        const { rendererTabId } = this.get(tabId);
        await this.request('activate', { tabId: rendererTabId });
        return { tabId, active: true };
    }

    isWindowMinimized() {
        const win = this.window;
        return !!win && !win.isDestroyed() && win.isMinimized();
    }
}

module.exports = { TabBridge, MCP_WORLD_ID, waitForLoad };
