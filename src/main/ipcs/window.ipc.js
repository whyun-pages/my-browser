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
        // 窗口被重建（macOS activate）后，需要给新窗口重新绑定状态监听
        this._bindWindowEvent();
    }
    // 监听窗口状态变化
    _bindWindowEvent() {
        const win = this.mainWindow;
        if (!win) {
            return;
        }
        win.on('maximize', () => {
            win.webContents.send('window-maximized');
        });

        win.on('unmaximize', () => {
            win.webContents.send('window-unmaximized');
        });
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

        this._bindWindowEvent();

        ipcMain.on('window-close', () => {
            if (this.mainWindow) {
                this.mainWindow.close();
            }
        });
    }
}

exports.WindowIPC = WindowIPC;
