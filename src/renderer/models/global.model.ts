import type { BookmarkHelper } from "../helpers/bookmark.helper";
import type { WebviewHelper } from "../helpers/webview.helper";

class GlobalModel {
    private _webviewHelper: WebviewHelper | undefined;
    public get webviewHelper(): WebviewHelper | undefined {
        return this._webviewHelper;
    }
    public set webviewHelper(webviewHelper: WebviewHelper) {
        this._webviewHelper = webviewHelper;
    }
    private _bookmarkHelper: BookmarkHelper | undefined;
    public get bookmarkHelper(): BookmarkHelper | undefined {
        return this._bookmarkHelper;
    }
    public set bookmarkHelper(bookmarkHelper: BookmarkHelper) {
        this._bookmarkHelper = bookmarkHelper;
    }
}

export const globalModel = new GlobalModel();