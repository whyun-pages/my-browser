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
    private isMac = /Mac/i.test(navigator.platform);
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
        const action = this.shortcutAction(e);
        if (action) {
            this.preventDefaultMayBe(e); // 阻止浏览器默认行为
            action();
        }
    }
    // 把按键映射为浏览器操作，每个按键最多命中一个操作（macOS 下修饰键为 Cmd）。
    // 需与 renderer/preload.js 中的 isAppShortcut 保持一致
    private shortcutAction(e: KeyboardEvent): (() => void) | undefined {
        const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        const mod = (this.isMac ? e.metaKey : e.ctrlKey) && !e.altKey;

        // F12 - 打开/关闭开发者工具
        if (key === 'F12') {
            return () => this.openDevTools();
        }
        // F5 - 刷新页面，Ctrl+F5 - 强制刷新
        if (key === 'F5') {
            return mod ? () => this.hardReload() : () => this.refresh();
        }
        // Ctrl+R - 刷新页面，Ctrl+Shift+R - 强制刷新
        if (mod && key === 'r') {
            return e.shiftKey ? () => this.hardReload() : () => this.refresh();
        }
        if (mod && !e.shiftKey) {
            switch (key) {
                case 't': // 新建标签页
                    return () => this.createNewTab();
                case 'w': // 关闭当前标签页
                    return () => this.closeTab();
                case 'd': // 添加书签
                    return () => this.addBookmark();
                case 'l': // 聚焦地址栏
                    return () => this.focusAddressBar();
            }
        }
        // 后退/前进：macOS 为 Cmd+[ / Cmd+]，其他平台为 Alt+← / Alt+→
        if (this.isMac) {
            if (mod && key === '[') {
                return () => this.goBack();
            }
            if (mod && key === ']') {
                return () => this.goForward();
            }
        } else if (e.altKey && !e.ctrlKey) {
            if (key === 'ArrowLeft') {
                return () => this.goBack();
            }
            if (key === 'ArrowRight') {
                return () => this.goForward();
            }
        }
        return undefined;
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
        } else if (tabProps.url && tabId === this.activeTabId) {
            // 后台标签页的跳转不能改写当前地址栏
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
    // 把地址栏输入转换为可访问的 URL
    private resolveInput(input: string) {
        // 已带协议（http、https、file 等）或 about: 页面，原样访问
        if (/^[a-z][a-z\d+.-]*:\/\//i.test(input) || /^about:/i.test(input)) {
            return input;
        }
        if (!/\s/.test(input)) {
            const hostname = input.split(/[/?#]/)[0].replace(/:\d+$/, '');
            // 本机和 IP 地址默认走 http（本地开发服务一般没有证书）
            if (hostname === 'localhost'
                || hostname === '[::1]'
                || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)
            ) {
                return 'http://' + input;
            }
            // 看起来像域名
            if (hostname.includes('.')) {
                return 'https://' + input;
            }
        }
        // 否则作为搜索查询
        return `${this.searchUrl}${encodeURIComponent(input)}`;
    }
    navigate(input: string) {
        if (!input.trim()) return;

        const url = this.resolveInput(input.trim());
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
        // 已收藏的页面不重复添加
        if (activeWebview && !globalModel.bookmarkHelper?.isBookmarked(activeWebview.src)) {
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

    // 不传 tabId 时关闭当前活动标签页（注意第一个标签页的 id 是 0）
    closeTab(tabId: number | undefined = this.activeTabId) {
        if (tabId === undefined || !this.tabs.has(tabId)) {
            return;
        }
        if (this.tabs.size <= 1) {
            return; // 至少保留一个标签页
        }
        const tabIds = [...this.tabs.keys()];
        const index = tabIds.indexOf(tabId);

        // 移除DOM元素和标签页数据
        this.tabElement(tabId)?.remove();
        this.webviewElement(tabId)?.remove();
        this.tabs.delete(tabId);

        // 如果关闭的是当前活动标签页，优先切换到左侧标签页，最左侧被关闭时切换到右侧
        if (this.activeTabId === tabId) {
            const nextTabId = index > 0 ? tabIds[index - 1] : tabIds[index + 1];
            if (nextTabId !== undefined) {
                this.switchToTab(nextTabId);
            }
        }

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
