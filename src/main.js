const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const { Slogger } = require('node-slogger');
const logger = new Slogger();

let mainWindow;
let bookmarks = [];
const bookmarksPath = path.join(__dirname, 'bookmarks.json');

// 加载书签
function loadBookmarks() {
  try {
    if (fs.existsSync(bookmarksPath)) {
      const data = fs.readFileSync(bookmarksPath, 'utf8');
      bookmarks = JSON.parse(data);
    }
  } catch (error) {
    console.error('加载书签失败:', error);
    bookmarks = [];
  }
}

// 保存书签
function saveBookmarks() {
  try {
    fs.writeFileSync(bookmarksPath, JSON.stringify(bookmarks, null, 2));
  } catch (error) {
    console.error('保存书签失败:', error);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      webviewTag: true, // ⬅️ 必须启用
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false // 允许跨域
    },
    icon: path.join(__dirname, 'assets/icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

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
  loadBookmarks();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭时退出应用程序（除了 macOS）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC 处理程序
ipcMain.handle('get-bookmarks', () => {
  return bookmarks;
});

ipcMain.handle('add-bookmark', (event, bookmark) => {
  bookmarks.push({
    id: Date.now(),
    title: bookmark.title,
    url: bookmark.url,
    createdAt: new Date().toISOString()
  });
  saveBookmarks();
  return bookmarks;
});

ipcMain.handle('remove-bookmark', (event, id) => {
  bookmarks = bookmarks.filter(bookmark => bookmark.id !== id);
  saveBookmarks();
  return bookmarks;
});

// 禁用默认菜单
Menu.setApplicationMenu(null); 