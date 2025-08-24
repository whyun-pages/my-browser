import { Toolbar } from "./components/toolbar";
import { TabsContainer } from "./components/tabs-container";
import { ContentArea } from "./components/content-area";
import { Bookmarks } from "./components/bookmarks";
import { WebviewHelper } from "./helpers/webview.helper";
import { globalModel } from "./models/global.model";

const app = document.getElementById("app");

app?.append(<TabsContainer />);
app?.append(<Toolbar />);
app?.append(<ContentArea />);
app?.append(<Bookmarks />);
globalModel.webviewHelper = new WebviewHelper();
