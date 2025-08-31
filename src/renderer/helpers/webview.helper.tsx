import { WebviewComponent } from '../components/content-area/webview';
import { TabComponent } from '../components/tabs-container/tab';
import { globalModel } from '../models/global.model';

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
    private homeUrl = 'https://cn.bing.com';
    private searchUrl = 'https://www.bing.com/search?q=';
    private tabsContainer = document.getElementById('tabs') as HTMLElement;
    private tabWrapperContainer = document.querySelector('.tabs-container') as HTMLElement;
    private addressBar = document.getElementById('address-bar') as HTMLInputElement;
    private webviewContainer = document.querySelector('.content-area') as HTMLElement;
    private bookmarkSvg = document.getElementById('bookmark-btn')?.querySelector('svg') as SVGElement;
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

    private init() {
        this.createNewTab(this.homeUrl);
        this.globalEvent();
    }
    private globalEvent() {
        window.electronAPI.on('open-new-window', (
            handlerDetails: Electron.HandlerDetails,
        ) => {
            this.createNewTab(
                handlerDetails.url, handlerDetails.referrer?.url
            );
        });
        document.addEventListener('keydown', (e) => {
            this.keyboardEvent(e);
        });
    }
    private preventDefaultMayBe(e: KeyboardEvent) {
        if (e && e.preventDefault) {
            e.preventDefault();
        }
    }
    keyboardEvent(e: KeyboardEvent) {
        // F12 - 打开/关闭开发者工具
        if (e.key === 'F12') {
            this.preventDefaultMayBe(e); // 阻止浏览器默认行为
            this.openDevTools();
        }
        
        // Ctrl+R 或 F5 - 刷新页面
        if ((e.ctrlKey && e.key === 'r') || e.key === 'F5') {
            this.preventDefaultMayBe(e);
            this.refresh();
        }
        
        // Ctrl+Shift+R 或 Ctrl+F5 - 强制刷新
        if ((e.ctrlKey && e.shiftKey && e.key === 'R') || (e.ctrlKey && e.key === 'F5')) {
            this.preventDefaultMayBe(e);
            this.hardReload();
        }
        
        // Ctrl+T - 新建标签页
        if (e.ctrlKey && e.key === 't') {
            this.preventDefaultMayBe(e);
            this.createNewTab();
        }
        
        // Ctrl+W - 关闭当前标签页
        if (e.ctrlKey && e.key === 'w') {
            this.preventDefaultMayBe(e);
            this.closeTab();
        }
        
        // Ctrl+D - 添加书签
        if (e.ctrlKey && e.key === 'd') {
            this.preventDefaultMayBe(e);
            this.addBookmark();
        }
        
        // Alt+Left - 后退
        if (e.altKey && e.key === 'ArrowLeft') {
            this.preventDefaultMayBe(e);
            this.goBack();
        }
        
        // Alt+Right - 前进
        if (e.altKey && e.key === 'ArrowRight') {
            this.preventDefaultMayBe(e);
            this.goForward();
        }
        
        // Ctrl+L - 聚焦地址栏
        if (e.ctrlKey && e.key === 'l') {
            this.preventDefaultMayBe(e);
            this.focusAddressBar();
        }
      }

    createNewTab(url: string = this.homeUrl, referer?: string) {
        const tabId = this.tabCounter++;
        const tab = {
            id: tabId,
            url: url,
            title: '新建标签页',
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
        this.switchToTab(tabId);
        this.adjustTabWidths();
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
            this.updateAddressBar(tabProps.url);
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
    toggleBookmarkUrl(url: string) {
        if (globalModel.bookmarkHelper?.isBookmarked(url)) {
            this.bookmarkSvg.setAttribute('fill', 'currentColor');
        } else {
            this.bookmarkSvg.setAttribute('fill', 'none');
        }
    }
    toggleBookmark() {
        const activeWebview = this.activeWebviewElement;
        if (activeWebview) {
            if (globalModel.bookmarkHelper?.isBookmarked(activeWebview.src)) {
                globalModel.bookmarkHelper?.remove(
                    globalModel.bookmarkHelper?.getBookmarkId(activeWebview.src) as number,
                    activeWebview.src,
                );
                this.bookmarkSvg.setAttribute('fill', 'none');
            } else {
                globalModel.bookmarkHelper?.add({
                    url: activeWebview.src,
                    title: activeWebview.getTitle()
                });
                this.bookmarkSvg.setAttribute('fill', 'currentColor');
            }
        }
    }
    updateAddressBar(url: string) {
        this.addressBar.value = url;
        this.toggleBookmarkUrl(url);
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

    goto() {
        this.navigate(this.addressBar.value);
    }
    addBookmark() {
        const activeWebview = this.activeWebviewElement;
        if (activeWebview) {
            globalModel.bookmarkHelper?.add({
                url: activeWebview.src,
                title: activeWebview.getTitle()
            });
            this.bookmarkSvg.setAttribute('fill', 'currentColor');
        }
    }

    openDevTools() {
        const activeWebview = this.activeWebviewElement;
        if (activeWebview) {
            try {
                // 检查 webview 是否已经加载完成
                if (activeWebview.isLoading && activeWebview.isLoading()) {
                    console.log('网页正在加载中，请稍后再试');
                    return;
                }
                
                // 检查开发者工具是否已经打开
                if (activeWebview.isDevToolsOpened && activeWebview.isDevToolsOpened()) {
                    activeWebview.closeDevTools();
                    console.log('开发者工具已关闭');
                } else {
                    activeWebview.openDevTools();
                    console.log('开发者工具已打开');
                }
            } catch (error) {
                console.error('开发者工具操作失败:', error);
                // 如果上述方法失败，尝试简单的打开方式
                try {
                    activeWebview.openDevTools();
                } catch (fallbackError) {
                    console.error('开发者工具打开失败:', fallbackError);
                }
            }
        } else {
            console.log('没有找到活动的网页标签');
        }
    }
    focusAddressBar() {
        this.addressBar.focus();
        this.addressBar.select();
    }

    closeTab(tabId?: number) {
        if (this.tabs.size <= 1) {
            return; // 至少保留一个标签页
        }

        if (!tabId) {
            tabId = this.activeTabId;
        }
        const tabIds = this.tabs.keys();
       
        // 移除DOM元素
        this.tabElement(tabId as number)?.remove();
        this.webviewElement(tabId as number)?.remove();
        
        
        // 如果关闭的是当前活动标签页，切换到其他标签页
        if (this.activeTabId === tabId) {
            let previousTabId = -1;
            for (const tabIdCurrent of tabIds) {
                if (tabIdCurrent === tabId) {
                    break;
                }
                previousTabId = tabIdCurrent;
            }
            if (previousTabId !== -1) {
                this.switchToTab(previousTabId);
            }
        }
        // 移除标签页数据
        this.tabs.delete(tabId as number);
        
        // 重新计算标签页宽度
        this.adjustTabWidths();
    }
    updateTabTitle(tabId: number, title: string) {
        const tabElement = this.tabElement(tabId)?.querySelector(`.tab-title`) as HTMLElement;
        if (tabElement) {
            // 根据标签页数量动态调整标题长度
            const maxLength = this.getMaxTitleLength();
            tabElement.textContent = title.length > maxLength ? title.substring(0, maxLength) : title;
        }

        // 更新标签页数据
        const tab = this.tabs.get(tabId);
        if (tab) {
            tab.title = title;
        }
    }

    // 根据标签页数量计算最大标题长度
    getMaxTitleLength() {
        const tabCount = this.tabs.size;
        if (tabCount <= 2) return 25;
        if (tabCount <= 4) return 20;
        if (tabCount <= 6) return 15;
        if (tabCount <= 8) return 12;
        return 8; // 8个以上标签页时，标题最短
    }
    // 动态调整标签页宽度
    adjustTabWidths() {
        const tabsContainer = this.tabsContainer;
        const tabs = tabsContainer.querySelectorAll('.tab') as NodeListOf<HTMLElement>;
        
        if (tabs.length === 0) return;
        
        // 获取容器宽度
        const containerWidth = this.tabWrapperContainer.offsetWidth;
        const newTabBtnWidth = 40; // 新建按钮固定宽度
        const tabCount = tabs.length;
        
        // 计算每个标签页的理想宽度
        let tabWidth = Math.floor((containerWidth - newTabBtnWidth) / tabCount);
        
        // 设置最小宽度和最大宽度限制
        const minWidth = 100;
        const maxWidth = 250;
        
        if (tabWidth < minWidth) {
            tabWidth = minWidth;
        } else if (tabWidth > maxWidth) {
            tabWidth = maxWidth;
        }
        
        // 应用宽度到所有标签页
        tabs.forEach((tab: HTMLElement) => {
            tab.style.flexBasis = `${tabWidth}px`;
            tab.style.minWidth = `${Math.min(tabWidth, minWidth)}px`;
            tab.style.maxWidth = `${tabWidth}px`;
        });
        
        // 计算实际需要的总宽度
        const totalNeededWidth = (tabWidth * tabCount) + newTabBtnWidth;
        
        // 设置tabs容器的宽度
        if (totalNeededWidth > containerWidth) {
            // 需要滚动
            tabsContainer.style.width = `${totalNeededWidth}px`;
        } else {
            // 占满可用空间
            tabsContainer.style.width = '100%';
        }
        
        // 更新所有标签页的标题显示
        this.tabs.forEach(tab => {
            this.updateTabTitle(tab.id, tab.title);
        });
    }
    
}
