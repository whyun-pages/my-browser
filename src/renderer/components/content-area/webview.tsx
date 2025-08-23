import { AbstractComponent } from "@/jsx-runtime";
interface WebviewProps {
    src?: string;
    preload?: string;
    allowpopups?: boolean;
    disablewebsecurity?: boolean;
    webpreferences?: string;
  }
export class Webview extends AbstractComponent<WebviewProps> {
    render() {
        // return (
        //     <webview 
        //     src={this.props.src} 
        //     preload={this.props.preload}
        //     allowpopups={this.props.allowpopups}
        //     disablewebsecurity={this.props.disablewebsecurity}
        //     webpreferences={this.props.webpreferences}
        //     onDid-attach={() => {console.log("webview 已附加");}}
        //     ></webview>
        // )
        const {
            src,
            preload,
            allowpopups,
            disablewebsecurity,
            webpreferences,
          } = this.props;
      
          const el = document.createElement("webview") as any;
      
          if (src) el.setAttribute("src", src);
          if (preload) el.setAttribute("preload", preload);
          if (allowpopups != null) el.setAttribute("allowpopups", String(allowpopups));
          if (disablewebsecurity != null)
            el.setAttribute("disablewebsecurity", String(disablewebsecurity));
          if (webpreferences) el.setAttribute("webpreferences", webpreferences);
      
          // 事件：Electron 的 webview 用 'did-attach'
          el.addEventListener("did-attach", () => {
            console.log("webview 已附加");
          });
      
          return el as Node;
    }
}