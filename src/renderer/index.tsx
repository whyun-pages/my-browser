import { Toolbar } from "./components/toolbar";
import { TabsContainer } from "./components/tabs-container";
import { ContentArea } from "./components/content-area";
import { SettingsContainer } from "./components/settings/settings-panel";
import { WebviewHelper } from "./helpers/webview.helper";
import { globalModel } from "./models/global.model";
import { settings } from "./models/settings.model";
import { BookmarkHelper } from "./helpers/bookmark.helper";
import { McpHelper } from "./helpers/mcp.helper";

// 先把布局和主题写到 <html> 上，再渲染界面，避免启动时闪一下默认样式
settings.apply();

document.addEventListener('DOMContentLoaded', () => {
    const app = document.getElementById("app");

    // 两种布局共用这一套 DOM，位置完全由 CSS 决定，切换布局时不重建任何元素
    app?.append(<TabsContainer />);
    app?.append(<Toolbar />);
    app?.append(<SettingsContainer />);
    app?.append(<ContentArea />);
    // 侧栏布局下的加载进度线
    app?.append(<div class="load-progress"></div>);
    globalModel.webviewHelper = new WebviewHelper();
    globalModel.bookmarkHelper = new BookmarkHelper();
    // AI 接口（MCP）的标签页请求由这里应答
    new McpHelper(globalModel.webviewHelper);
});
