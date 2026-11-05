const { app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let bookmarks = [];
// 打包后 __dirname 位于只读的 app.asar 内，书签必须保存到用户数据目录
const bookmarksPath = path.join(app.getPath('userData'), 'bookmarks.json');

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
    fs.mkdirSync(path.dirname(bookmarksPath), { recursive: true });
    fs.writeFileSync(bookmarksPath, JSON.stringify(bookmarks, null, 2));
  } catch (error) {
    console.error('保存书签失败:', error);
  }
}



class BookmarksIPC {
  constructor(rpcOptions) {
    this.rpcOptions = rpcOptions;
    this._addEvent();
  }
  resetRpcOptions(rpcOptions) {
    this.rpcOptions = rpcOptions;
  }
  _addEvent() {
    // IPC 处理程序
    ipcMain.handle('get-bookmarks', () => {
      loadBookmarks();
      return bookmarks;
    });

    ipcMain.handle('add-bookmark', (event, bookmark) => {
      const saved = {
        id: Date.now(),
        title: bookmark.title,
        url: bookmark.url,
        createdAt: new Date().toISOString()
      }
      bookmarks.push(saved);
      saveBookmarks();
      return saved;
    });

    ipcMain.handle('remove-bookmark', (event, id) => {
      bookmarks = bookmarks.filter(bookmark => bookmark.id !== id);
      saveBookmarks();
      return bookmarks;
    });
  }
}

exports.BookmarksIPC = BookmarksIPC;