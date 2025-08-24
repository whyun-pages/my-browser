import { WebviewComponent } from '../components/content-area/webview';
import { TabComponent } from '../components/tabs-container/tab';

export interface Tab {
    id: number;
    url: string;
    title: string;
    canGoBack?: boolean;
    canGoForward?: boolean;
    referer?: string;
}
export class WebviewHelper {
    tabs: Map<number, Tab> = new Map();
    activeTabId: number | undefined;
    tabCounter: number = 0;
    private homeUrl = 'https://www.bing.com';
    private searchUrl = 'https://www.bing.com/search?q=';
    private tabsContainer = document.getElementById('tabs') as HTMLElement;
    private addressBar = document.getElementById('address-bar') as HTMLInputElement;
    private webviewContainer = document.querySelector('.content-area') as HTMLElement;
    private get tabElements() {
        return document.querySelectorAll('.tab');
    }
    private get webviewElements() {
        return document.querySelectorAll('webview');
    }
    private tabElement(tabId: number) {
        return document.querySelector(`[data-tab-id="${tabId}"]`);
    }
    private webviewElement(tabId: number) {
        return document.getElementById(`webview-${tabId}`) as Electron.WebviewTag | undefined;
    }
    private backButton = document.getElementById('back-btn') as HTMLButtonElement;
    private forwardButton = document.getElementById('forward-btn') as HTMLButtonElement;
    private get activeTabElement() {
        return this.tabElement(this.activeTabId as number);
    }
    private get activeWebviewElement(): Electron.WebviewTag | undefined {
        return this.webviewElement(this.activeTabId as number);
    }

    constructor() {
        this.init();
    }

    init() {
        this.createNewTab(this.homeUrl);
    }

    createNewTab(url: string = this.homeUrl, referer?: string) {
        const tabId = this.tabCounter++;
        const tab = {
            id: tabId,
            url: url,
            title: 'New Tab',
            canGoBack: false,
            canGoForward: false,
            referer: referer
        }
        this.tabs.set(tabId, tab);
        const webviewComponent = new WebviewComponent({
            tabId: tabId,
            src: url,
            preload: "preload.js",
            allowpopups: true,
            disablewebsecurity: true,
            webpreferences: "allowRunningInsecureContent"
        });
        const webviewElement = webviewComponent.render();
        this.webviewContainer.appendChild(webviewElement);
        this.tabsContainer.appendChild(<TabComponent id={tabId} title={tab.title} />);
    }
    updateTab(tabId: number, tabProps: Partial<Tab>) {
        const tab = this.tabs.get(tabId);
        if (!tab) {
            console.warn(`Tab ${tabId} not found`);
            return;
        }
        this.tabs.set(tabId, {
            ...tab,
            ...tabProps
        });
        const tabElement = this.tabElement(tabId);
        if (!tabElement) {
            console.warn(`Tab element ${tabId} not found`);
            return;
        }
        const webviewElement = this.webviewElement(tabId);
        if (!webviewElement) {
            console.warn(`Webview element ${tabId} not found`);
            return;
        }
        if (tabProps.title) {
            const titleElement = tabElement.querySelector('.tab-title');
            if (titleElement) {
                titleElement.textContent = tabProps.title;
            }
        } else if (tabProps.url) {
            webviewElement.src = tabProps.url;
        }
    }

    switchToTab(tabId: number) {
        // 移除所有活动状态
        this.tabElements.forEach(tab => tab.classList.remove('active'));
        this.webviewElements.forEach(webview => webview.classList.remove('active'));
        
        // 添加活动状态
        const tabElement = this.tabElement(tabId);
        const webview = this.webviewElement(tabId);
        
        if (tabElement && webview) {
            tabElement.classList.add('active');
            webview.classList.add('active');
            
            this.activeTabId = tabId;
            
            // 更新地址栏
            const tab = this.tabs.get(tabId);
            if (tab) {
                this.updateAddressBar(tab.url);
            }
            
            // 延迟更新导航按钮，确保 webview 已经准备就绪
            setTimeout(() => {
                this.updateNavigationButtons();
            }, 100);
        }
    }
    updateAddressBar(url: string) {
        this.addressBar.value = url;
    }

    updateNavigationButtons() {
        const activeWebview = this.activeWebviewElement;
        if (activeWebview
            && typeof activeWebview.canGoBack === 'function'
            && typeof activeWebview.canGoForward === 'function'
        ) {
            this.backButton.disabled = !activeWebview.canGoBack();
            this.forwardButton.disabled = !activeWebview.canGoForward();
        } else {
            // 如果 webview 还没有完全初始化，禁用导航按钮
            this.backButton.disabled = true;
            this.forwardButton.disabled = true;
        }
    }
    navigate(input: string) {
        if (!input.trim()) return;
        
        let url = input.trim();
        
        // 检查是否是完整的URL
        if (!url.match(/^https?:\/\//)) {
            // 检查是否看起来像域名
            if (url.includes('.') && !url.includes(' ')) {
                url = 'https://' + url;
            } else {
                // 否则作为搜索查询
                url = `${this.searchUrl}${encodeURIComponent(url)}`;
            }
        }
        const activeWebview = this.activeWebviewElement;
        if (activeWebview) {
            activeWebview.src = url;
        }
    }
    goBack() {
        const activeWebview = this.activeWebviewElement;
        if (activeWebview && activeWebview.canGoBack()) {
            activeWebview.goBack();
        }
    }

    goForward() {
        const activeWebview = this.activeWebviewElement;
        if (activeWebview && activeWebview.canGoForward()) {
            activeWebview.goForward();
        }
    }

    refresh() {
        const activeWebview = this.activeWebviewElement;
        if (activeWebview) {
            activeWebview.reload();
        }
    }
    hardReload() {
        const activeWebview = this.activeWebviewElement;
        if (activeWebview) {
            activeWebview.reloadIgnoringCache();
        }
    }

    goHome() {
        this.navigate(this.homeUrl);
    }
    
}
