import { AbstractComponent } from "@/jsx-runtime";
import { globalModel } from "@/renderer/models/global.model";
// 在渲染进程中，我们通过 window.electronAPI 或预加载脚本来访问 ipcRenderer
interface WebviewProps {
    tabId: number;
    src: string;
    preload?: string;
    allowpopups?: boolean;
    disablewebsecurity?: boolean;
    webpreferences?: string;
  }
export class WebviewComponent extends AbstractComponent<WebviewProps> {
    render() {
        const {
            tabId,
            src,
            preload,
            allowpopups,
            disablewebsecurity,
            webpreferences,
          } = this.props;
      
          const webview = document.createElement("webview") as Electron.WebviewTag;
      
          webview.setAttribute("src", src);
          webview.setAttribute('id', `webview-${tabId}`);
          if (preload) webview.setAttribute("preload", preload);
          if (allowpopups != null) webview.setAttribute("allowpopups", String(allowpopups));
          if (disablewebsecurity != null)
            webview.setAttribute("disablewebsecurity", String(disablewebsecurity));
          if (webpreferences) webview.setAttribute("webpreferences", webpreferences);
      
          // 事件：Electron 的 webview 用 'did-attach'
          webview.addEventListener("did-attach", () => {
            console.log("webview 已附加");
          });

           // webview 事件监听
      webview.addEventListener('dom-ready', () => {
          // DOM 准备就绪，但不立即更新导航按钮，等待导航事件
          console.log('dom-ready');
          const wcId = webview.getWebContentsId();
          // 使用预加载脚本暴露的安全 API
          if (window.electronAPI) {
            window.electronAPI.send('register-webview-handler', wcId);
          }
      });
      
      webview.addEventListener('did-navigate', (e) => {
          globalModel.webviewHelper?.updateTab(this.props.tabId, {
              url: e.url,
          });
          globalModel.webviewHelper?.updateNavigationButtons();
      });
      
      webview.addEventListener('did-navigate-in-page', (e) => {
          // this.updateTabTitle(tab.id, '加载中...');
          console.log('did-navigate-in-page');
          globalModel.webviewHelper?.updateTab(this.props.tabId, {
            url: e.url,
          });
          globalModel.webviewHelper?.updateNavigationButtons();
      });
      
      webview.addEventListener('page-title-updated', (e) => {
          console.log('page-title-updated', e.title);
          globalModel.webviewHelper?.updateTab(this.props.tabId, {
            title: e.title,
          });
      });
      
      webview.addEventListener('did-start-loading', () => {
          // 
      });
      
      webview.addEventListener('did-stop-loading', () => {
        globalModel.webviewHelper?.updateNavigationButtons();
      });
      webview.addEventListener('did-finish-load', async (e) => {
          console.log('did-finish-load');
      });
      webview.addEventListener('did-fail-load', (event) => {
        console.error('did-fail-load', event.errorCode, event.errorDescription, event.validatedURL);
      });
      
      
      return webview;
    }
}