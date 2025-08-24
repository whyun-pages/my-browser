import type { WebviewHelper } from "../helpers/webview.helper";

class GlobalModel {
    private _webviewHelper: WebviewHelper | undefined;
    public get webviewHelper(): WebviewHelper | undefined {
        return this._webviewHelper;
    }
    public set webviewHelper(webviewHelper: WebviewHelper) {
        this._webviewHelper = webviewHelper;
    }
}

export const globalModel = new GlobalModel();