const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

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