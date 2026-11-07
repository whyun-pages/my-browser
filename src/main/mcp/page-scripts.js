// 在网页里执行的脚本。
//
// 这里的函数不会在主进程里运行：buildScript 用 Function#toString 取出源码，
// 和 JSON.stringify 编码后的参数拼成一段表达式，交给 executeJavaScriptInIsolatedWorld。
// 所以每个函数都必须自包含，不能引用本文件里的其他变量（公共逻辑放在 pageLib 里，作为第一个参数传入）。
//
// 脚本不抛异常，统一返回 { ok: true, ...结果 } 或 { ok: false, error: { code, message, details } }，
// 主进程据此区分“选择器无效 / 元素不存在 / 不可操作”和执行本身的失败。

/* eslint-disable no-undef */

/** 页面里的公共函数 */
function pageLib() {
    const fail = (code, message, details) => ({ ok: false, error: { code, message, ...(details ? { details } : {}) } });

    function cut(value, max) {
        const text = value == null ? '' : String(value);
        return text.length > max
            ? { value: text.slice(0, max), length: text.length, truncated: true }
            : { value: text, length: text.length, truncated: false };
    }

    /** 按选择器和从零开始的索引取一个元素 */
    function resolve(selector, index) {
        let list;
        try {
            list = document.querySelectorAll(selector);
        } catch (e) {
            return { error: fail('invalid_selector', `无效的 CSS 选择器：${selector}（${e.message}）`) };
        }
        const i = index || 0;
        if (i >= list.length) {
            return {
                error: fail('element_not_found',
                    list.length ? `选择器匹配到 ${list.length} 个元素，索引 ${i} 超出范围（从 0 开始）` : `没有元素匹配选择器：${selector}`,
                    { selector, index: i, matchCount: list.length }),
            };
        }
        return { el: list[i], matchCount: list.length };
    }

    function rectOf(el) {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    }

    function isVisible(el) {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) {
            return false;
        }
        return typeof el.checkVisibility === 'function'
            ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
            : getComputedStyle(el).visibility !== 'hidden';
    }

    /** 元素的简短描述，用于结果和错误信息 */
    function brief(el) {
        if (!el || el.nodeType !== 1) {
            return null;
        }
        let s = el.tagName.toLowerCase();
        if (el.id) s += `#${el.id}`;
        const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3) : [];
        if (cls.length) s += `.${cls.join('.')}`;
        return s;
    }

    const ATTRS = ['name', 'type', 'href', 'src', 'value', 'placeholder', 'title', 'alt', 'role', 'aria-label', 'for', 'action', 'method'];

    function describe(el, index, textMax) {
        const attributes = {};
        for (const name of ATTRS) {
            const v = el.getAttribute(name);
            if (v != null) attributes[name] = v.length > 300 ? `${v.slice(0, 300)}…` : v;
        }
        const text = cut((el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim(), textMax);
        const item = {
            index,
            tag: el.tagName.toLowerCase(),
            id: el.id || undefined,
            classes: typeof el.className === 'string' && el.className.trim() ? el.className.trim().split(/\s+/) : undefined,
            attributes,
            text: text.value,
            textTruncated: text.truncated || undefined,
            visible: isVisible(el),
            rect: rectOf(el),
        };
        if ('value' in el && typeof el.value === 'string' && el.tagName !== 'BUTTON' && el.tagName !== 'OPTION') {
            item.currentValue = el.value.length > 300 ? `${el.value.slice(0, 300)}…` : el.value;
        }
        if ('checked' in el && (el.type === 'checkbox' || el.type === 'radio')) item.checked = el.checked;
        if ('disabled' in el && el.disabled) item.disabled = true;
        return item;
    }

    /** 元素不在视口内时滚动到中间（瞬时滚动），返回滚动后的位置 */
    function bringIntoView(el) {
        const r = el.getBoundingClientRect();
        const inView = r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
        if (!inView) {
            el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        }
        return !inView;
    }

    return { fail, cut, resolve, rectOf, isVisible, brief, describe, bringIntoView };
}

function getHtml(lib, { selector, index, maxLength }) {
    let html;
    let matchCount;
    if (selector) {
        const found = lib.resolve(selector, index);
        if (found.error) return found.error;
        html = found.el.outerHTML;
        matchCount = found.matchCount;
    } else {
        const dt = document.doctype;
        html = (dt ? `<!DOCTYPE ${dt.name}>\n` : '') + document.documentElement.outerHTML;
    }
    const c = lib.cut(html, maxLength);
    return { ok: true, html: c.value, length: c.length, truncated: c.truncated, matchCount };
}

function getText(lib, { selector, index, maxLength }) {
    let el = document.body || document.documentElement;
    let matchCount;
    if (selector) {
        const found = lib.resolve(selector, index);
        if (found.error) return found.error;
        el = found.el;
        matchCount = found.matchCount;
    }
    // innerText 按渲染结果取可见文字，需要页面处于渲染状态
    const c = lib.cut(el ? el.innerText : '', maxLength);
    return { ok: true, text: c.value, length: c.length, truncated: c.truncated, matchCount };
}

function queryDom(lib, { selector, limit, textMax }) {
    let list;
    try {
        list = document.querySelectorAll(selector);
    } catch (e) {
        return lib.fail('invalid_selector', `无效的 CSS 选择器：${selector}（${e.message}）`);
    }
    const elements = [];
    for (let i = 0; i < list.length && i < limit; i++) {
        elements.push(lib.describe(list[i], i, textMax));
    }
    return {
        ok: true,
        matchCount: list.length,
        elements,
        truncated: list.length > limit,
        viewport: { width: innerWidth, height: innerHeight, scrollX: Math.round(scrollX), scrollY: Math.round(scrollY) },
    };
}

/**
 * 点击、截图前的定位：必要时滚动到视口内，返回元素位置和命中检查结果。
 * armClick 为 true 时在元素上挂一次性监听，供 clickReceived 确认真实点击已送达。
 */
function locate(lib, { selector, index, armClick }) {
    const found = lib.resolve(selector, index);
    if (found.error) return found.error;
    const el = found.el;
    const scrolled = lib.bringIntoView(el);
    const r = el.getBoundingClientRect();
    const visible = lib.isVisible(el);
    // 只看元素在视口内的部分
    const left = Math.max(0, r.left);
    const top = Math.max(0, r.top);
    const right = Math.min(innerWidth, r.right);
    const bottom = Math.min(innerHeight, r.bottom);
    const clip = right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : null;
    let hit = null;
    let hitOk = false;
    if (clip) {
        const cx = clip.x + clip.width / 2;
        const cy = clip.y + clip.height / 2;
        const target = document.elementFromPoint(cx, cy);
        hitOk = !!target && (target === el || el.contains(target));
        hit = { x: cx, y: cy, target: lib.brief(target) };
    }
    if (armClick) {
        // 隔离世界的全局对象在同一文档内保留，不会被页面看到
        const state = { received: false };
        globalThis.__mybrowserMcpClick = state;
        el.addEventListener('click', () => { state.received = true; }, { capture: true, once: true });
    }
    return {
        ok: true,
        element: lib.brief(el),
        matchCount: found.matchCount,
        scrolled,
        visible,
        disabled: !!el.disabled,
        rect: lib.rectOf(el),
        clip,
        hit,
        hitOk,
        viewport: { width: innerWidth, height: innerHeight },
    };
}

function clickReceived() {
    const state = globalThis.__mybrowserMcpClick;
    return { ok: true, armed: !!state, received: !!(state && state.received) };
}

function domClick(lib, { selector, index }) {
    const found = lib.resolve(selector, index);
    if (found.error) return found.error;
    found.el.click();
    return { ok: true, element: lib.brief(found.el), matchCount: found.matchCount };
}

function fill(lib, { selector, index, value, submit }) {
    const found = lib.resolve(selector, index);
    if (found.error) return found.error;
    const el = found.el;
    const tag = el.tagName;
    const type = (el.getAttribute('type') || '').toLowerCase();
    const fire = (name, Ctor = Event, init = {}) => el.dispatchEvent(new Ctor(name, { bubbles: true, cancelable: name !== 'input', composed: true, ...init }));
    if (el.disabled) {
        return lib.fail('element_not_interactable', `元素已禁用：${lib.brief(el)}`);
    }
    let kind;
    let result;
    if (tag === 'INPUT' && (type === 'checkbox' || type === 'radio')) {
        kind = type;
        if (typeof value !== 'boolean') {
            return lib.fail('invalid_argument', `${type} 需要布尔值 value（true 勾选 / false 取消）`);
        }
        if (type === 'radio' && value === false && el.checked) {
            return lib.fail('invalid_argument', '单选框不能直接取消，请选中同组的另一个选项');
        }
        if (el.checked !== value) {
            // click 会按浏览器默认行为切换状态并触发 input / change，和用户勾选一致
            el.click();
        }
        result = { checked: el.checked };
    } else if (tag === 'INPUT' && type === 'file') {
        return lib.fail('element_not_interactable', '不支持填写文件选择框');
    } else if (tag === 'SELECT') {
        kind = el.multiple ? 'select-multiple' : 'select';
        const wanted = Array.isArray(value) ? value.map(String) : [String(value)];
        if (!el.multiple && wanted.length !== 1) {
            return lib.fail('invalid_argument', '单选下拉框只能选择一个值');
        }
        const options = [...el.options];
        const pick = (w) => options.find((o) => o.value === w) || options.find((o) => o.label.trim() === w || o.text.trim() === w);
        const picked = wanted.map(pick);
        const missing = wanted.filter((_, i) => !picked[i]);
        if (missing.length) {
            return lib.fail('element_not_found', `下拉框里没有这些选项：${missing.join('、')}`,
                { options: options.slice(0, 50).map((o) => ({ value: o.value, label: o.label })) });
        }
        options.forEach((o) => { o.selected = picked.includes(o); });
        fire('input');
        fire('change');
        result = { value: el.multiple ? picked.map((o) => o.value) : el.value };
    } else if (tag === 'INPUT' || tag === 'TEXTAREA') {
        kind = tag === 'TEXTAREA' ? 'textarea' : (type || 'text');
        if (el.readOnly) {
            return lib.fail('element_not_interactable', `元素是只读的：${lib.brief(el)}`);
        }
        el.focus();
        // 在隔离世界里赋值走的是原生 setter，页面框架（如 React）记录的旧值不会被同步，
        // 随后的 input 事件能被框架识别为一次真实修改
        el.value = String(value);
        fire('input', InputEvent, { inputType: 'insertReplacementText', data: String(value) });
        fire('change');
        result = { value: el.value };
    } else if (el.isContentEditable) {
        kind = 'contenteditable';
        el.focus();
        el.textContent = String(value);
        fire('input', InputEvent, { inputType: 'insertReplacementText', data: String(value) });
        result = { value: el.textContent };
    } else {
        return lib.fail('element_not_interactable', `不是可填写的元素：${lib.brief(el)}（支持 input、textarea、select、contenteditable）`);
    }
    const out = { ok: true, element: lib.brief(el), kind, ...result };
    if (submit) {
        const form = el.form || el.closest('form');
        if (!form) {
            return lib.fail('element_not_found', '元素不在表单里，无法提交', { filled: out });
        }
        const valid = form.checkValidity();
        out.submit = { valid };
        if (!valid) {
            const bad = form.querySelector(':invalid');
            out.submit.invalidElement = lib.brief(bad);
            out.submit.validationMessage = bad ? bad.validationMessage : undefined;
        }
        // requestSubmit 和点击提交按钮一样：先做表单校验，通过后触发 submit 事件，事件未被取消才提交
        form.requestSubmit();
        out.submit.requested = true;
    }
    return out;
}

const EVENT_CLASSES = ['Event', 'CustomEvent', 'MouseEvent', 'PointerEvent', 'KeyboardEvent', 'InputEvent', 'FocusEvent', 'WheelEvent', 'UIEvent'];

function dispatchEvent(lib, { selector, index, type, eventClass, init }) {
    const found = lib.resolve(selector, index);
    if (found.error) return found.error;
    const Ctor = globalThis[eventClass];
    if (typeof Ctor !== 'function') {
        return lib.fail('invalid_argument', `不支持的事件类型：${eventClass}`);
    }
    let event;
    try {
        event = new Ctor(type, { bubbles: true, cancelable: true, composed: true, ...(init || {}) });
    } catch (e) {
        return lib.fail('invalid_argument', `无法构造事件：${e.message}`);
    }
    const notCanceled = found.el.dispatchEvent(event);
    return { ok: true, element: lib.brief(found.el), matchCount: found.matchCount, dispatched: true, defaultPrevented: !notCanceled };
}

/** wait_for 的一次探测 */
function waitProbe(lib, { selector, state, text }) {
    const out = { ok: true, url: location.href, readyState: document.readyState };
    let satisfied = true;
    if (selector) {
        let list;
        try {
            list = document.querySelectorAll(selector);
        } catch (e) {
            return lib.fail('invalid_selector', `无效的 CSS 选择器：${selector}（${e.message}）`);
        }
        const visibleCount = state === 'visible' || state === 'hidden' ? [...list].filter(lib.isVisible).length : undefined;
        out.matchCount = list.length;
        out.visibleCount = visibleCount;
        if (state === 'attached') satisfied = list.length > 0;
        else if (state === 'detached') satisfied = list.length === 0;
        else if (state === 'visible') satisfied = visibleCount > 0;
        else if (state === 'hidden') satisfied = visibleCount === 0;
    }
    if (satisfied && text) {
        const body = document.body ? document.body.innerText : '';
        out.textFound = body.includes(text);
        satisfied = out.textFound;
    }
    out.satisfied = satisfied;
    return out;
}

/**
 * 拼出在隔离世界执行的表达式。参数经 JSON.stringify 编码，不直接拼接调用方的输入。
 * @param {Function} fn 本文件中的页面函数
 * @param {object} [args]
 */
function buildScript(fn, args = {}) {
    return `(() => { const lib = (${pageLib.toString()})(); return (${fn.toString()})(lib, ${JSON.stringify(args)}); })()`;
}

/**
 * evaluate 在页面主世界执行的包装：把结果在页面里转成 JSON 字符串，异常和不可序列化的值都返回描述。
 * 返回的 Promise 会被等待。
 * @param {string} body 已确定写法的函数体（`return (表达式)` 或语句）
 */
function buildEvaluate(body) {
    return `(async () => {
const __describe = (v) => v === null ? 'null' : Array.isArray(v) ? 'array' : (typeof Node !== 'undefined' && v instanceof Node) ? 'node' : typeof v;
try {
    const __v = await (async () => {\n${body}\n})();
    const __type = __describe(__v);
    if (__v === undefined) return { kind: 'undefined', type: 'undefined' };
    if (__type === 'node') return { kind: 'unserializable', type: 'node', description: String(__v.nodeName) };
    if (typeof __v === 'function' || typeof __v === 'symbol') return { kind: 'unserializable', type: __type };
    if (typeof __v === 'bigint') return { kind: 'unserializable', type: 'bigint', description: String(__v) };
    if (typeof __v === 'number' && !Number.isFinite(__v)) return { kind: 'unserializable', type: 'number', description: String(__v) };
    let __s;
    try { __s = JSON.stringify(__v); } catch (e) { return { kind: 'unserializable', type: __type, description: String(e && e.message) }; }
    if (__s === undefined) return { kind: 'unserializable', type: __type };
    return { kind: 'json', type: __type, json: __s };
} catch (e) {
    return { kind: 'exception', name: e && e.name, message: String(e && e.message !== undefined ? e.message : e), stack: e && typeof e.stack === 'string' ? e.stack.slice(0, 2000) : undefined };
}
})()`;
}

module.exports = {
    buildScript,
    buildEvaluate,
    EVENT_CLASSES,
    scripts: { getHtml, getText, queryDom, locate, clickReceived, domClick, fill, dispatchEvent, waitProbe },
};
