import { AbstractComponent } from "@/jsx-runtime";
import { globalModel } from "@/renderer/models/global.model";
// 在渲染进程中，我们通过 window.electronAPI 或预加载脚本来访问 ipcRenderer
interface WebviewProps {
  tabId: number;
  src: string;
  preload?: string;
  /**
   * 是否关闭同源策略。这类设置在网页视图创建时就确定了，之后改属性不会生效，
   * 所以一个标签页的跨域状态从创建起就固定不变。
   */
  allowCrossOrigin: boolean;
}
export class WebviewComponent extends AbstractComponent<WebviewProps> {
  private version: string;
  private userAgent: string;
  public constructor(props: WebviewProps) {
    super(props);
    const urlParams = new URLSearchParams(window.location.search)
    this.version = urlParams.get('version') || '';
    this.userAgent = navigator.userAgent + ' mybrowser/' + this.version;
  }

  render() {
    const { tabId, src, preload, allowCrossOrigin } = this.props;

    const webview = document.createElement("webview") as Electron.WebviewTag;

    webview.setAttribute("src", src);
    webview.setAttribute('id', `webview-${tabId}`);
    webview.setAttribute('useragent', this.userAgent);
    // 设置预加载脚本路径（使用相对路径）
    if (preload) {
      webview.setAttribute("preload", preload);
    }
    // 下面这些都是“有这个属性就生效”的开关：写成 ="false" 也算开启，不需要时必须整个不写
    webview.setAttribute("allowpopups", "");
    if (allowCrossOrigin) {
      webview.setAttribute("disablewebsecurity", "");
      webview.setAttribute("webpreferences", "allowRunningInsecureContent");
    }

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
        window.electronAPI.send('register-webview-handler', { wcId, allowCrossOrigin });
      }
    });

    webview.addEventListener('did-navigate', (e) => {
      globalModel.webviewHelper?.updateTab(this.props.tabId, {
        url: e.url,
      });
      globalModel.webviewHelper?.updateNavigationButtons();
    });

    webview.addEventListener('did-navigate-in-page', (e) => {
      // iframe 内的页内跳转不影响标签页地址
      if (!e.isMainFrame) {
        return;
      }
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

    webview.addEventListener('page-favicon-updated', (e) => {
      globalModel.webviewHelper?.updateTab(this.props.tabId, {
        favicon: e.favicons[0],
      });
    });

    webview.addEventListener('did-start-loading', () => {
      globalModel.webviewHelper?.setTabLoading(this.props.tabId, true);
    });

    webview.addEventListener('did-stop-loading', () => {
      globalModel.webviewHelper?.setTabLoading(this.props.tabId, false);
      globalModel.webviewHelper?.updateNavigationButtons();
    });
    webview.addEventListener('did-finish-load', () => {
      console.log('did-finish-load');
    });
    webview.addEventListener('did-fail-load', (event) => {
      console.error('did-fail-load', event.errorCode, event.errorDescription, event.validatedURL);
      // 可以在这里添加重试逻辑或显示错误信息
    });

    webview.addEventListener('crashed', () => {
      console.error('webview 崩溃');
      // 可以在这里添加重启逻辑
    });

    webview.addEventListener('gpu-crashed', () => {
      console.error('webview GPU 崩溃');
    });

    webview.addEventListener('ipc-message', (e) => {
      if (e.channel === 'webview-to-renderer') {
        const [ type, keyEvent ] = e.args;
        if (type === 'keyboard-event') {
          console.log('keyboard-event', keyEvent);
          globalModel.webviewHelper?.keyboardEvent(keyEvent);
        }
      }
    });


    return webview;
  }
}
