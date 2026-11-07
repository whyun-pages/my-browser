const { ipcMain, webContents } = require('electron');
const { Slogger } = require('node-slogger');
const logger = new Slogger();
class WebviewHandlerIPC {
    constructor(rpcOptions) {
        this.rpcOptions = rpcOptions;
        this._addEvent();
    }
    resetRpcOptions(rpcOptions) {
        this.rpcOptions = rpcOptions;
    }
    _addEvent() {
        // 监听来自渲染进程的 webview 注册请求。
        // allowCrossOrigin 是这个标签页创建时的跨域设置，由渲染进程一并告知
        ipcMain.on('register-webview-handler', (event, { wcId, tabId, allowCrossOrigin }) => {
            // 登记给 AI 接口使用；内部会校验发送者是主窗口、网页视图属于主窗口
            if (this.rpcOptions.tabBridge && Number.isInteger(tabId)) {
                this.rpcOptions.tabBridge.register(event.sender, { wcId, tabId });
            }
            const wc = webContents.fromId(wcId);
            if (wc) {
                logger.info('注册 webview 拦截新窗口:', wcId, wc);
                wc.setWindowOpenHandler((handlerDetails) => {
                    if (handlerDetails.disposition === 'foreground-tab') {
                        console.log('webview 拦截新窗口:', handlerDetails);
                        this.rpcOptions.mainWindow.webContents.send(
                            'open-new-window', handlerDetails
                        );
                        return { action: 'deny' };
                    }
                    // 弹出的独立窗口不会继承标签页的跨域设置，这里让它和打开它的标签页保持一致
                    if (allowCrossOrigin) {
                        return {
                            action: 'allow',
                            overrideBrowserWindowOptions: {
                                webPreferences: {
                                    webSecurity: false,
                                    allowRunningInsecureContent: true,
                                },
                            },
                        };
                    }
                    return { action: 'allow' };
                });
            }
        });
    }
}

exports.WebviewHandlerIPC = WebviewHandlerIPC;
