import { Toolbar } from "./components/toolbar";
import { TabsContainer } from "./components/tabs-container";
import { ContentArea } from "./components/content-area";
import { WebviewHelper } from "./helpers/webview.helper";
import { globalModel } from "./models/global.model";
import { BookmarkHelper } from "./helpers/bookmark.helper";

document.addEventListener('DOMContentLoaded', () => {    
    const app = document.getElementById("app");
    
    app?.append(<TabsContainer />);
    app?.append(<Toolbar />);
    app?.append(<ContentArea />);
    globalModel.webviewHelper = new WebviewHelper();
    globalModel.bookmarkHelper = new BookmarkHelper();
});
