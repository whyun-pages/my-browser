const { ipcMain } = require('electron');
class WindowIPC {
    constructor(rpcInitOptions) {
        this.rpcInitOptions = rpcInitOptions;
        this._addEvent();
    }
    get mainWindow() {
        return this.rpcInitOptions.mainWindow;
    }
    resetRpcOptions(rpcInitOptions) {
        this.rpcInitOptions = rpcInitOptions;
    }
    _addEvent() {
        // 窗口控制 IPC 处理器
        ipcMain.on('window-minimize', () => {
            if (this.mainWindow) {
                this.mainWindow.minimize();
            }
        });

        ipcMain.on('window-maximize', () => {
            if (this.mainWindow) {
                if (this.mainWindow.isMaximized()) {
                    this.mainWindow.unmaximize();
                } else {
                    this.mainWindow.maximize();
                }
            }
        });

        // 监听窗口状态变化

        if (this.mainWindow) {
            this.mainWindow.on('maximize', () => {
                this.mainWindow.webContents.send('window-maximized');
            });

            this.mainWindow.on('unmaximize', () => {
                this.mainWindow.webContents.send('window-unmaximized');
            });
        }


        ipcMain.on('window-close', () => {
            if (this.mainWindow) {
                this.mainWindow.close();
            }
        });
    }
}

exports.WindowIPC = WindowIPC;
