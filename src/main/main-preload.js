const { ipcRenderer } = require('electron');
const validChannels = [
    'window-maximized',
    'window-unmaximized',
    'window-minimize',
    'window-maximize',
    'window-close',
    'open-new-window',
    'webview-keyboard-event',
    'get-bookmarks',
    'add-bookmark',
    'remove-bookmark',
    'update-bookmark',
    'get-history',
    'add-history',
    'delete-history',
    'register-webview-handler',
    'mcp-get-status',
    'mcp-set-enabled',
    'mcp-get-connection',
    'mcp-get-config-path',
    'mcp-show-config',
    'mcp-status-changed',
    'mcp-renderer-ready',
    'mcp-tab-request',
    'mcp-tab-response',
];
// 暴露安全的 API 给渲染进程
window.electronAPI = {
    send: (channel, data) => {
        // 只允许特定的通道
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        } else {
            console.warn(`Invalid channel: ${channel}`);
        }
    },
    // 返回取消监听的函数
    on: (channel, func) => {
        if (validChannels.includes(channel)) {
            const listener = (event, ...args) => func(...args);
            ipcRenderer.on(channel, listener);
            return () => ipcRenderer.removeListener(channel, listener);
        } else {
            console.warn(`Invalid channel: ${channel}`);
            return () => {};
        }
    },
    invoke: async (channel, ...args) => {
        if (validChannels.includes(channel)) {
            return await ipcRenderer.invoke(channel, ...args);
        } else {
            console.warn(`Invalid channel: ${channel}`);
        }
    }
};