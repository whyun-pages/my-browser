const { app, BrowserWindow, Menu,} = require('electron');
const path = require('path');
const { version } = require('../../package.json');
const { Rpcs } = require('./ipcs');

const { Slogger } = require('node-slogger');
const logger = new Slogger();
/**
 * @type {BrowserWindow}
 */
let mainWindow;


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
    icon: path.join(__dirname, 'assets/icon.png')
  });
  const indexFile = path.join(__dirname, '../dist/index.html');
  mainWindow.loadURL(`file://${indexFile}?version=${version}`);

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
  createWindow();
  const rpcs = new Rpcs({
    mainWindow: mainWindow,
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      rpcs.resetRpcOptions({
        mainWindow: mainWindow,
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
