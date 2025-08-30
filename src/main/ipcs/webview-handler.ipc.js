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
        // 监听来自渲染进程的 webview 注册请求
        ipcMain.on('register-webview-handler', (event, wcId) => {
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
                    return { action: 'allow' };
                });
            }
        });
    }
}

exports.WebviewHandlerIPC = WebviewHandlerIPC;
