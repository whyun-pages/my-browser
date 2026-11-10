const { app, BrowserWindow, Menu,} = require('electron');
const path = require('path');
const { version } = require('../../package.json');
const { Rpcs } = require('./ipcs');

const { McpConfig } = require('./mcp/config');
const { McpHttpService } = require('./mcp/server');
const { createServerFactory } = require('./mcp/factory');
const { TabBridge } = require('./mcp/tabs');
const { registerTools } = require('./mcp/tools');

const { Slogger } = require('node-slogger');
const logger = new Slogger();

// Windows 上 Chromium 会根据桌面上的其他窗口推算本窗口是否被挡住，被判为遮挡时整个窗口停止渲染。
// 实测它会误判：窗口可见且有焦点时外壳页面仍是 hidden，AI 接口的按需渲染随之全部失败。
// AI 在后台操作时浏览器本来就常被其他程序挡住，所以关闭这项推算：只有最小化才算不可见。
// 代价是窗口被挡住时当前标签页继续渲染（后台标签页仍是 display: none，不受影响）。
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
}
/**
 * @type {BrowserWindow}
 */
let mainWindow;

// 窗口图标：打包后由 extraResources 拷贝到 resources 目录，
// 开发时使用 pnpm icons 生成的 build/icon.png
const iconPath = app.isPackaged
  ? path.join(process.resourcesPath, 'icon.png')
  : path.join(__dirname, '../../build/icon.png');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    // frame: false,
    titleBarStyle: 'hidden', // 隐藏标题栏但保留窗口控制按钮（macOS 适用）

    webPreferences: {
      preload: path.join(__dirname, 'main-preload.js'), // ⬅️ 关键
      webviewTag: true, // ⬅️ 必须启用
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false // 允许跨域
    },
    icon: iconPath
  });
  const indexFile = path.join(__dirname, '../dist/index.html');
  mainWindow.loadFile(indexFile, { query: { version } });

  // // 设置窗口状态监听器
  // setupWindowStateListener();

  // 开发环境下打开开发者工具
  logger.info('process.env.NODE_ENV', process.env.NODE_ENV);
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }


  // 窗口关闭时的处理
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 应用程序准备就绪时创建窗口
app.whenReady().then(() => {
  // AI 接口（MCP）服务：配置在用户数据目录的 mcp.json，默认关闭
  const tabBridge = new TabBridge({ logger });
  const mcpService = new McpHttpService({
    config: new McpConfig(app.getPath('userData')),
    buildServer: createServerFactory({ registerTools: (server) => registerTools(server, { tabs: tabBridge }) }),
    logger,
  });
  app.on('before-quit', () => mcpService.destroyNow());

  createWindow();
  tabBridge.attachWindow(mainWindow);
  const rpcs = new Rpcs({
    mainWindow: mainWindow,
    mcpService,
    tabBridge,
  });
  // 状态监听在 IPC 中注册，之后再启动，界面才能收到第一次状态变化
  mcpService.init().catch((e) => logger.error('mcp init failed', e));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      tabBridge.attachWindow(mainWindow);
      rpcs.resetRpcOptions({
        mainWindow: mainWindow,
        mcpService,
        tabBridge,
      });
    }
  });
});


// 所有窗口关闭时退出应用程序（除了 macOS）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 禁用默认菜单
Menu.setApplicationMenu(null); 
