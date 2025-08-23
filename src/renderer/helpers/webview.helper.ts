import { ipcRenderer } from 'electron';
import { Webview } from '../components/content-area/webview';

export interface Tab {
    id: number;
    url: string;
    title: string;
    canGoBack?: boolean;
    canGoForward?: boolean;
    referer?: string;
}
export class WebviewHelper {
    tabs: Tab[] = [];
    activeTabId: number | undefined;
    tabCounter: number = 0;
    private tabsContainer: HTMLElement = document.getElementById('tabs') as HTMLElement;

    constructor() {
        this.tabs = [];
        this.tabCounter = 0;
        
        this.init();
    }

    init() {
        this.createNewTab('https://www.bing.com');
    }

    createNewTab(url: string, referer?: string) {
        const tabId = this.tabCounter++;
        const tab = {
            id: tabId,
            url: url,
            title: 'New Tab',
            canGoBack: false,
            canGoForward: false,
            referer: referer
        }
        this.tabs.push(tab);
        const webviewComponent = new Webview({
            src: url,
            preload: "preload.js",
            allowpopups: false,
            disablewebsecurity: false,
            webpreferences: "allowRunningInsecureContent"
        });
        const webviewElement = webviewComponent.render();
        this.tabsContainer.appendChild(webviewElement);
    
    }

    switchToTab(tabId: number) {
        // 移除所有活动状态
        document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('webview').forEach(webview => webview.classList.remove('active'));
        
        // 添加活动状态
        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        const webview = document.getElementById(`webview-${tabId}`);
        
        if (tabElement && webview) {
            tabElement.classList.add('active');
            webview.classList.add('active');
            
            this.activeTabId = tabId;
            
            // 更新地址栏
            const tab = this.tabs.find(t => t.id === tabId);
            if (tab) {
                this.updateAddressBar(tab.url);
            }
            
            // 延迟更新导航按钮，确保 webview 已经准备就绪
            setTimeout(() => {
                this.updateNavigationButtons();
            }, 100);
        }
    }
    
}

export const webviewHelper = new WebviewHelper();