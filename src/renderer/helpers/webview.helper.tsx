import { WebviewComponent } from '../components/content-area/webview';
import { TabComponent } from '../components/tabs-container/tab';
import { globalModel } from '../models/global.model';
import { settings } from '../models/settings.model';
import { isSameSite, paintFavicon, siteColor } from './site-color';

export interface Tab {
    id: number;
    url: string;
    title: string;
    canGoBack?: boolean;
    canGoForward?: boolean;
    referer?: string;
    /** 创建时是否放行跨域。网页视图创建后无法更改，所以这个值不会再变 */
    crossOrigin: boolean;
    /** 网页提供的图标地址 */
    favicon?: string;
    loading?: boolean;
}
export class WebviewHelper {
    tabs: Map<number, Tab> = new Map();
    activeTabId: number | undefined;
    tabCounter: number = 0;
    private homeUrl = 'https://cn.bing.com';
    private searchUrl = 'https://www.bing.com/search?q=';
    private tabsContainer = document.getElementById('tabs') as HTMLElement;
    private addressBar = document.getElementById('address-bar') as HTMLInputElement;
    private webviewContainer = document.querySelector('.content-area') as HTMLElement;
    private bookmarkButton = document.getElementById('bookmark-btn') as HTMLButtonElement;
    private corsChip = document.getElementById('cors-chip') as HTMLElement;
    private corsChipText = document.getElementById('cors-chip-text') as HTMLElement;
    private app = document.getElementById('app') as HTMLElement;
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
        const tab: Tab = {
            id: tabId,
            url: url,
            title: '新建标签页',
            canGoBack: false,
            canGoForward: false,
            referer: referer,
            // “允许跨域”只在创建标签页时读取一次：改开关不影响已打开的标签页
            crossOrigin: settings.allowCrossOrigin,
        }
        this.tabs.set(tabId, tab);
        const webviewComponent = new WebviewComponent({
            tabId: tabId,
            src: url,
            preload: "preload.js",
            allowCrossOrigin: tab.crossOrigin,
        });
        const webviewElement = webviewComponent.render();
        this.webviewContainer.appendChild(webviewElement);
        this.tabsContainer.appendChild(<TabComponent id={tabId} title={tab.title} />);
        this.paintTabFavicon(tabId);
        this.switchToTab(tabId);
    }
    updateTab(tabId: number, tabProps: Partial<Tab>) {
        const tab = this.tabs.get(tabId);
        if (!tab) {
            console.warn(`Tab ${tabId} not found`);
            return;
        }
        // 跳到另一个站点后，旧站点的图标作废，等新页面上报自己的图标
        if (tabProps.url && !isSameSite(tabProps.url, tab.url)) {
            tab.favicon = undefined;
        }
        Object.assign(tab, tabProps);
        const tabElement = this.tabElement(tabId);
        if (!tabElement) {
            console.warn(`Tab element ${tabId} not found`);
            return;
        }
        if (tabProps.title) {
            const titleElement = tabElement.querySelector('.tab-title');
            if (titleElement) {
                titleElement.textContent = tabProps.title;
            }
            // 标题过长或侧栏收起时，靠悬停提示看全名
            tabElement.setAttribute('title', tabProps.title);
        }
        if (tabProps.url && tabId === this.activeTabId) {
            // 后台标签页的跳转不能改写当前地址栏
            this.updateAddressBar(tabProps.url);
        }
        this.paintTabFavicon(tabId);
    }
    setTabLoading(tabId: number, loading: boolean) {
        const tab = this.tabs.get(tabId);
        if (!tab) {
            return;
        }
        tab.loading = loading;
        this.paintTabFavicon(tabId);
        if (tabId === this.activeTabId) {
            this.app.classList.toggle('loading', loading);
        }
    }
    // 标签上的站点图标：加载中转圈，其次是网页自己的图标，最后是彩色圆点
    private paintTabFavicon(tabId: number) {
        const tab = this.tabs.get(tabId);
        const favicon = this.tabElement(tabId)?.querySelector('.fav') as HTMLElement | null;
        if (tab && favicon) {
            paintFavicon(favicon, tab);
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
            this.app.classList.toggle('loading', !!tab?.loading);
            
            // 延迟更新导航按钮，确保 webview 已经准备就绪
            setTimeout(() => {
                this.updateNavigationButtons();
            }, 100);
        }
    }
    // 星标的选中状态用类名表示（按钮里的图标是固定的，不能替换）
    private setBookmarked(bookmarked: boolean) {
        const label = bookmarked ? '取消收藏' : '收藏这个页面';
        this.bookmarkButton.classList.toggle('on', bookmarked);
        this.bookmarkButton.title = label;
        this.bookmarkButton.setAttribute('aria-label', label);
    }
    // 按当前标签页的地址重新判断星标状态
    refreshBookmarkState() {
        const tab = this.tabs.get(this.activeTabId as number);
        this.setBookmarked(!!tab && !!globalModel.bookmarkHelper?.isBookmarked(tab.url));
    }
    // 地址栏里的标记：显示当前标签页创建时是否放行了跨域
    private updateCorsChip() {
        const allowed = !!this.tabs.get(this.activeTabId as number)?.crossOrigin;
        this.corsChip.classList.toggle('off', !allowed);
        this.corsChipText.textContent = allowed ? '跨域已放行' : '未放行跨域';
        this.corsChip.title = allowed
            ? '同源策略已关闭：这个页面可以读取其他源的响应'
            : '这个标签页遵守同源策略。在设置里打开“允许跨域”后，新开的标签页才会放行';
    }
    toggleBookmark() {
        const activeWebview = this.activeWebviewElement;
        if (activeWebview) {
            if (globalModel.bookmarkHelper?.isBookmarked(activeWebview.src)) {
                globalModel.bookmarkHelper?.remove(
                    globalModel.bookmarkHelper?.getBookmarkId(activeWebview.src) as number,
                    activeWebview.src,
                );
                this.setBookmarked(false);
            } else {
                globalModel.bookmarkHelper?.add({
                    url: activeWebview.src,
                    title: activeWebview.getTitle()
                });
                this.setBookmarked(true);
            }
        }
    }
    updateAddressBar(url: string) {
        this.addressBar.value = url;
        this.setBookmarked(!!globalModel.bookmarkHelper?.isBookmarked(url));
        this.updateCorsChip();
        // 界面的强调色跟着当前站点走
        document.documentElement.style.setProperty('--hue', siteColor(url));
    }

    updateNavigationButtons() {
        const activeWebview = this.activeWebviewElement;
        let canGoBack = false;
        let canGoForward = false;
        try {
            if (activeWebview) {
                canGoBack = activeWebview.canGoBack();
                canGoForward = activeWebview.canGoForward();
            }
        } catch {
            // 网页视图还没准备好（dom-ready 之前）时这两个方法会抛异常，此时两个按钮都禁用
        }
        this.backButton.disabled = !canGoBack;
        this.forwardButton.disabled = !canGoForward;
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
            this.setBookmarked(true);
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
    }
}
