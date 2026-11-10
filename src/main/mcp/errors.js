// MCP 工具的错误类型。code 是给 AI 客户端判断用的稳定标识，message 是给人看的说明。
class McpToolError extends Error {
    /**
     * @param {string} code
     * @param {string} message
     * @param {object} [details] 附加在结果里的结构化信息，例如标签页当前状态
     */
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
    }
}

const ErrorCodes = Object.freeze({
    WINDOW_UNAVAILABLE: 'window_unavailable',
    RENDERER_TIMEOUT: 'renderer_timeout',
    TAB_NOT_FOUND: 'tab_not_found',
    TAB_NOT_READY: 'tab_not_ready',
    LAST_TAB: 'last_tab',
    INVALID_ARGUMENT: 'invalid_argument',
    RENDER_UNAVAILABLE: 'render_unavailable',
    /** 窗口最小化时无法截图 */
    WINDOW_MINIMIZED: 'window_minimized',
    /** 操作进行中标签页被关闭 */
    TAB_CLOSED: 'tab_closed',
    /** 操作进行中页面跳转到了新文档，旧文档里的操作结果拿不到了 */
    PAGE_NAVIGATED: 'page_navigated',
    /** 页面渲染进程崩溃或被结束 */
    TAB_CRASHED: 'tab_crashed',
    /** 之前的脚本超时后仍未结束（例如死循环），暂停接受新的页面操作 */
    TAB_BUSY: 'tab_busy',
    INVALID_SELECTOR: 'invalid_selector',
    ELEMENT_NOT_FOUND: 'element_not_found',
    /** 元素不可见、被遮挡或类型不支持该操作 */
    ELEMENT_NOT_INTERACTABLE: 'element_not_interactable',
    NAVIGATION_FAILED: 'navigation_failed',
    TIMEOUT: 'timeout',
    /** 客户端取消了请求 */
    CANCELLED: 'cancelled',
    /** 页面脚本抛出异常 */
    SCRIPT_ERROR: 'script_error',
    /** 结果无法转换为 JSON */
    NOT_SERIALIZABLE: 'not_serializable',
    RESULT_TOO_LARGE: 'result_too_large',
    INTERNAL: 'internal_error',
});

module.exports = { McpToolError, ErrorCodes };
