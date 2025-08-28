const { app, BrowserWindow, ipcMain, Menu, webContents  } = require('electron');
const path = require('path');
const fs = require('fs');

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

  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));

  // 设置窗口状态监听器
  setupWindowStateListener();

  if (process.platform === 'win32') {
    try {
      process.stdout.setDefaultEncoding('utf8'); // 强制 UTF-8 输出
    } catch (e) {
      console.warn('无法设置 stdout 编码为 UTF-8', e);
    }
  }

  // 开发环境下打开开发者工具
  logger.info('process.env.NODE_ENV', process.env.NODE_ENV);
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    if (details.requestHeaders['User-Agent']) {
      details.requestHeaders['User-Agent'] = details.requestHeaders['User-Agent']
        .replace(/Electron\/[^\s]+/g, ''); // 去掉 Electron 标识
        callback({cancel: false, requestHeaders: details.requestHeaders});
    } else {
      callback({cancel: false});
    }
  });

  // 窗口关闭时的处理
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 应用程序准备就绪时创建窗口
app.whenReady().then(() => {
  // loadBookmarks();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 监听来自渲染进程的 webview 注册请求
ipcMain.on('register-webview-handler', (event, wcId) => {
  const wc = webContents.fromId(wcId);
  if (wc) {
    logger.info('注册 webview 拦截新窗口:', wcId, wc);
    wc.setWindowOpenHandler((handlerDetails) => {
      if (handlerDetails.disposition === 'foreground-tab') {
        console.log('webview 拦截新窗口:', handlerDetails);
        mainWindow.webContents.send('open-new-window', handlerDetails);
        return { action: 'deny' };
      }
      return { action: 'allow' };
    });
  }
});

// 所有窗口关闭时退出应用程序（除了 macOS）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});



// 窗口控制 IPC 处理器
ipcMain.on('window-minimize', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

// 监听窗口状态变化
function setupWindowStateListener() {
  if (mainWindow) {
    mainWindow.on('maximize', () => {
      mainWindow.webContents.send('window-maximized');
    });
    
    mainWindow.on('unmaximize', () => {
      mainWindow.webContents.send('window-unmaximized');
    });
  }
}

ipcMain.on('window-close', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

// 禁用默认菜单
Menu.setApplicationMenu(null); 
require('./ipcs');