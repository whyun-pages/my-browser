// preload.js
const { ipcRenderer } = require('electron');
const validChannels = [
    'window-maximized',
    'window-unmaximized',
    'open-new-window',
    'webview-keyboard-event',
    'get-bookmarks',
    'add-bookmark',
    'delete-bookmark',
    'update-bookmark',
    'get-history',
    'add-history',
    'delete-history',
    'register-webview-handler',
];
// 暴露安全的 API 给渲染进程
window.electronAPI = {
    send: (channel, data) => {
        // 只允许特定的通道
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    on: (channel, func) => {
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
    }
};

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
});
  