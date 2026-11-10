// preload.js
const { ipcRenderer } = require('electron');

// 向WebView内部页面暴露通信方法（WebView内可调用）

window.sendToRenderer = (...data) => {
    ipcRenderer.sendToHost('webview-to-renderer', ...data);
};


// 接收渲染进程消息并转发给WebView内部
ipcRenderer.on('renderer-to-webview', (_, data) => {
  // 通知WebView内部页面（可通过自定义事件）
  window.dispatchEvent(new CustomEvent('renderer-msg', { detail: data }));
});

const isMac = /Mac/i.test(navigator.platform);
// 是否为浏览器自身的快捷键。只拦截这些按键，其余（复制、粘贴、全选等）交还给网页处理。
// 需与 renderer/helpers/webview.helper.tsx 中的 shortcutAction 保持一致
function isAppShortcut(e) {
    // 网页脚本或自动填充派发的合成事件可能没有 key
    if (!e.key) {
        return false;
    }
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === 'F12' || key === 'F5') {
        return true;
    }
    const mod = (isMac ? e.metaKey : e.ctrlKey) && !e.altKey;
    if (mod && key === 'r') {
        return true;
    }
    if (mod && !e.shiftKey && ['t', 'w', 'd', 'l', ','].includes(key)) {
        return true;
    }
    if (isMac) {
        return mod && (key === '[' || key === ']');
    }
    return e.altKey && !e.ctrlKey && (key === 'ArrowLeft' || key === 'ArrowRight');
}

window.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = `
    /* 滚动条样式 - 简约细致设计 */
    ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
    }

    ::-webkit-scrollbar-track {
        background: transparent;
    }

    ::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.2);
        border-radius: 10px;
        transition: all 0.2s ease;
    }

    ::-webkit-scrollbar-thumb:hover {
        background: rgba(0, 0, 0, 0.4);
    }

    ::-webkit-scrollbar-thumb:active {
        background: rgba(0, 0, 0, 0.6);
    }

    ::-webkit-scrollbar-corner {
        background: transparent;
    }
    `;
    document.head.appendChild(style);
    // 全局键盘事件监听
    window.addEventListener('keydown', (e) => {
        if (isAppShortcut(e)) {
            e.preventDefault();
            window.sendToRenderer('keyboard-event', {
                key: e.key,
                code: e.code,
                ctrlKey: e.ctrlKey,
                shiftKey: e.shiftKey,
                altKey: e.altKey,
                metaKey: e.metaKey,
                repeat: e.repeat,
                isComposing: e.isComposing,
            });
            console.log('sendToRenderer on preload', e);
        }
    }, true);
});
  