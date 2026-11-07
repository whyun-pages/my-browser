// AI 接口（MCP）相关的 IPC：设置页读取状态、切换开关、获取连接配置、打开配置文件所在位置。
// 标签页操作的请求 / 应答通道在 mcp/tabs.js。
const fs = require('fs');
const path = require('path');
const { app, ipcMain, shell } = require('electron');

/**
 * stdio 转接脚本的位置：打包后由 extraResources 拷贝到 resources/mcp，开发时直接用源码。
 * Claude 桌面版用应用自己的可执行文件以 Node 模式（ELECTRON_RUN_AS_NODE=1）运行它。
 *
 * 便携版例外：程序每次运行时解压到临时目录，process.execPath 和 resources 都在那里，
 * 浏览器没开或临时目录被清理时路径就失效；便携版外壳又不转发 stdio（2026-11-07 实测），
 * 不能拿它当命令。所以把脚本复制到用户数据目录，改用本机的 Node.js 运行。
 *
 * @returns {{command: string, args: string[], env?: Record<string, string>, portable: boolean}}
 */
function bridgeCommand(configPath) {
    const script = app.isPackaged
        ? path.join(process.resourcesPath, 'mcp', 'stdio-bridge.js')
        : path.join(__dirname, '..', 'mcp', 'stdio-bridge.js');
    if (process.env.PORTABLE_EXECUTABLE_FILE) {
        const stable = path.join(path.dirname(configPath), 'mcp-bridge', 'stdio-bridge.js');
        fs.mkdirSync(path.dirname(stable), { recursive: true });
        // 每次都覆盖，升级后用的是新版脚本
        fs.copyFileSync(script, stable);
        return { command: 'node', args: [stable, '--config', configPath], portable: true };
    }
    return {
        command: process.execPath,
        args: [script, '--config', configPath],
        env: { ELECTRON_RUN_AS_NODE: '1' },
        portable: false,
    };
}

class McpIPC {
    /**
     * @param {{mainWindow: import('electron').BrowserWindow, mcpService: import('../mcp/server').McpHttpService}} rpcOptions
     */
    constructor(rpcOptions) {
        this.rpcOptions = rpcOptions;
        this._addEvent();
        this._bindStatus();
    }

    resetRpcOptions(rpcOptions) {
        this.rpcOptions = rpcOptions;
    }

    get mainWindow() {
        return this.rpcOptions.mainWindow;
    }

    get service() {
        return this.rpcOptions.mcpService;
    }

    /** 只接受当前主窗口发来的请求，标签页里的网页无法调用这些通道 */
    _fromMainWindow(event) {
        const win = this.mainWindow;
        return !!win && !win.isDestroyed() && event.sender === win.webContents;
    }

    _bindStatus() {
        this.service.onStatusChange((status) => {
            const win = this.mainWindow;
            if (win && !win.isDestroyed()) {
                win.webContents.send('mcp-status-changed', status);
            }
        });
    }

    _addEvent() {
        ipcMain.handle('mcp-get-status', (event) => {
            if (!this._fromMainWindow(event)) {
                throw new Error('forbidden');
            }
            return this.service.getStatus();
        });

        ipcMain.handle('mcp-set-enabled', (event, enabled) => {
            if (!this._fromMainWindow(event)) {
                throw new Error('forbidden');
            }
            if (typeof enabled !== 'boolean') {
                throw new Error('enabled must be a boolean');
            }
            return this.service.setEnabled(enabled);
        });

        // 配置文件位置不含凭据，设置页常驻显示
        ipcMain.handle('mcp-get-config-path', (event) => {
            if (!this._fromMainWindow(event)) {
                throw new Error('forbidden');
            }
            return this.service.config.file;
        });

        // 连接配置里需要令牌，只在用户打开“连接配置”时按需获取
        ipcMain.handle('mcp-get-connection', (event) => {
            if (!this._fromMainWindow(event)) {
                throw new Error('forbidden');
            }
            const status = this.service.getStatus();
            const configPath = this.service.config.file;
            const { portable, ...bridge } = bridgeCommand(configPath);
            return {
                url: status.url,
                token: this.service.getToken(),
                configPath,
                bridge,
                portable,
            };
        });

        // 在文件管理器里选中 mcp.json；还没生成时打开所在目录
        ipcMain.handle('mcp-show-config', async (event) => {
            if (!this._fromMainWindow(event)) {
                throw new Error('forbidden');
            }
            const file = this.service.config.file;
            if (fs.existsSync(file)) {
                shell.showItemInFolder(file);
                return true;
            }
            const dir = path.dirname(file);
            fs.mkdirSync(dir, { recursive: true });
            const error = await shell.openPath(dir);
            return !error;
        });
    }
}

exports.McpIPC = McpIPC;
