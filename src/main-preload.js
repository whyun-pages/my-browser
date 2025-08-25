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
        } else {
            console.warn(`Invalid channel: ${channel}`);
        }
    },
    on: (channel, func) => {
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        } else {
            console.warn(`Invalid channel: ${channel}`);
        }
    }
};