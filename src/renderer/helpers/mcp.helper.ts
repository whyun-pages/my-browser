// 界面一侧的 AI 接口（MCP）处理：响应主进程的标签页请求（列表、打开、关闭、切换、按需渲染）。
// 页面内容的读取和操作由主进程直接对网页视图执行，不经过这里。
import type { WebviewHelper } from './webview.helper';

interface TabRequest {
    requestId: number;
    op: string;
    payload: Record<string, unknown>;
}

class RequestError extends Error {
    code: string;
    constructor(code: string, message: string) {
        super(message);
        this.code = code;
    }
}

/** 主进程只接受 http(s)、file 和 about:blank；这里再校验一次，防止异常输入进入网页视图 */
function checkUrl(value: unknown): string {
    if (typeof value !== 'string' || !value) {
        throw new RequestError('invalid_argument', 'url 必须是非空字符串');
    }
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new RequestError('invalid_argument', `无效的地址：${value}`);
    }
    if (!['http:', 'https:', 'file:'].includes(parsed.protocol) && value !== 'about:blank') {
        throw new RequestError('invalid_argument', `不支持的协议：${parsed.protocol}`);
    }
    return value;
}

function checkTabId(value: unknown): number {
    if (!Number.isInteger(value)) {
        throw new RequestError('invalid_argument', 'tabId 必须是整数');
    }
    return value as number;
}

export class McpHelper {
    private helper: WebviewHelper;
    /** 真实鼠标点击前外壳页面里的焦点元素 */
    private savedFocus: Element | null = null;

    constructor(helper: WebviewHelper) {
        this.helper = helper;
        window.electronAPI.on('mcp-tab-request', (request: TabRequest) => this.handle(request));
        // 告诉主进程界面已就绪；界面重新加载后会再次发送
        window.electronAPI.send('mcp-renderer-ready');
    }

    private handle(request: TabRequest) {
        if (!request || typeof request.requestId !== 'number') {
            return;
        }
        let response;
        try {
            response = { requestId: request.requestId, ok: true, result: this.run(request.op, request.payload || {}) };
        } catch (e) {
            const err = e instanceof RequestError ? e : new RequestError('internal_error', String((e as Error)?.message || e));
            response = { requestId: request.requestId, ok: false, error: { code: err.code, message: err.message } };
        }
        window.electronAPI.send('mcp-tab-response', response);
    }

    private run(op: string, payload: Record<string, unknown>) {
        const helper = this.helper;
        switch (op) {
            case 'list':
                // 设置页是外壳绘制的内置页面，不对 AI 开放
                return [...helper.tabs.values()].filter((tab) => !tab.kind).map((tab) => ({
                    tabId: tab.id,
                    url: tab.url,
                    title: tab.title,
                    active: tab.id === helper.activeTabId,
                    loading: !!tab.loading,
                    aiOpened: !!tab.aiOpened,
                    crossOrigin: tab.crossOrigin,
                    loadError: tab.loadError,
                }));
            case 'open': {
                const url = checkUrl(payload.url);
                const background = payload.background !== false;
                const tabId = helper.createNewTab(url, { background, aiOpened: true });
                return { tabId };
            }
            case 'close': {
                const closeId = checkTabId(payload.tabId);
                if (helper.tabs.get(closeId)?.kind) {
                    throw new RequestError('tab_not_found', '标签页不存在或已关闭');
                }
                const result = helper.closeTab(closeId);
                if (result === 'not_found') {
                    throw new RequestError('tab_not_found', '标签页不存在或已关闭');
                }
                if (result === 'last_tab') {
                    throw new RequestError('last_tab', '这是最后一个标签页，浏览器至少保留一个标签页，不能关闭');
                }
                return { closed: true };
            }
            case 'activate': {
                const tabId = checkTabId(payload.tabId);
                if (!helper.tabs.has(tabId) || helper.tabs.get(tabId)?.kind) {
                    throw new RequestError('tab_not_found', '标签页不存在或已关闭');
                }
                helper.switchToTab(tabId);
                return { activated: true };
            }
            case 'render': {
                const ok = helper.setTabRendering(checkTabId(payload.tabId), payload.on === true);
                // 关闭渲染时标签页可能刚被关掉，不算错误
                if (!ok && payload.on === true) {
                    throw new RequestError('tab_not_found', '标签页不存在或已关闭');
                }
                // 读取尺寸会强制立即布局，不等下一帧；同时返回外壳页面状态，渲染失败时便于排查
                const webview = document.getElementById(`webview-${payload.tabId}`) as HTMLElement | null;
                return {
                    rendering: ok && payload.on === true,
                    width: webview ? webview.offsetWidth : 0,
                    height: webview ? webview.offsetHeight : 0,
                    shellVisibility: document.visibilityState,
                    shellFocused: document.hasFocus(),
                };
            }
            case 'focus-save':
                this.savedFocus = document.activeElement;
                return { saved: true };
            case 'focus-restore': {
                // 鼠标点击会让后台网页视图拿到键盘焦点，用户正在地址栏或前台页面里的输入会被打断；
                // 只处理后台标签页，前台页面被点击后获得焦点是正常的
                const tabId = checkTabId(payload.tabId);
                const prev = this.savedFocus;
                this.savedFocus = null;
                const current = document.activeElement;
                if (tabId === helper.activeTabId || !current || current.id !== `webview-${tabId}`) {
                    return { restored: false };
                }
                if (prev instanceof HTMLElement && prev !== current && prev.isConnected) {
                    prev.focus();
                } else {
                    (current as HTMLElement).blur();
                }
                return { restored: true };
            }
            default:
                throw new RequestError('invalid_argument', `未知操作：${op}`);
        }
    }
}
