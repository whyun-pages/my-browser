const { ipcRenderer } = require('electron');
const { Slogger } = require('node-slogger');
const logger = new Slogger();
class BrowserApp {
    constructor() {
        this.tabs = [];
        this.activeTabId = null;
        this.tabCounter = 0;
        this.bookmarks = [];
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadBookmarks();
        this.initTheme();
        this.createNewTab('https://www.bing.com');
        
        // 初始化时调整标签页宽度
        setTimeout(() => {
            this.adjustTabWidths();
        }, 100);
    }

    setupEventListeners() {
        const newTabBtn = document.getElementById('new-tab-btn');
        
        // 新建标签页事件
        newTabBtn.addEventListener('click', () => this.createNewTab());
        // 导航按钮
        document.getElementById('back-btn').addEventListener('click', () => this.goBack());
        document.getElementById('forward-btn').addEventListener('click', () => this.goForward());
        document.getElementById('refresh-btn').addEventListener('click', () => this.refresh());
        document.getElementById('home-btn').addEventListener('click', () => this.goHome());
        
        // 地址栏
        const addressBar = document.getElementById('address-bar');
        const goBtn = document.getElementById('go-btn');
        
        addressBar.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.navigate(addressBar.value);
            }
        });
        
        goBtn.addEventListener('click', () => {
            this.navigate(addressBar.value);
        });

        // 收藏功能
        document.getElementById('bookmark-btn').addEventListener('click', () => this.addBookmark());
        document.getElementById('bookmarks-list-btn').addEventListener('click', () => this.toggleBookmarksSidebar());
        
        // 窗口控制按钮
        document.getElementById('minimize-btn').addEventListener('click', () => this.minimizeWindow());
        document.getElementById('maximize-btn').addEventListener('click', () => this.maximizeWindow());
        document.getElementById('close-btn').addEventListener('click', () => this.closeWindow());
        
        // 监听窗口状态变化
        ipcRenderer.on('window-maximized', () => this.updateMaximizeButton(true));
        ipcRenderer.on('window-unmaximized', () => this.updateMaximizeButton(false));
        document.getElementById('close-sidebar').addEventListener('click', () => this.toggleBookmarksSidebar());

        // 设置菜单
        this.setupSettingsMenu();

        // 键盘快捷键
        this.setupKeyboardShortcuts();
        ipcRenderer.on('open-new-window', (event, handlerDetails) => {
            this.createNewTab(handlerDetails.url, handlerDetails.referrer?.url);
        });

        // 监听窗口大小变化，重新调整标签页宽度
        window.addEventListener('resize', () => {
            setTimeout(() => {
                this.adjustTabWidths();
            }, 100);
        });
        // 监听从 webview 发送的键盘事件
        ipcRenderer.on('webview-keyboard-event', (event, data) => {
            console.log('接收到 webview 键盘事件:', data);            
            this.shortcutsListener(data);
        });
    }

    createNewTab(url = 'https://www.bing.com', referer = '') {
        const tabId = ++this.tabCounter;
        
        // 创建标签页
        const tab = {
            id: tabId,
            title: '新标签页',
            url: url,
            canGoBack: false,
            canGoForward: false,
            referer: referer
        };
        
        this.tabs.push(tab);
        
        // 创建标签页元素
        this.createTabElement(tab);
        
        // 创建 webview
        this.createWebView(tab);
        
        // 切换到新标签页
        this.switchToTab(tabId);
        
        return tab;
    }

    createTabElement(tab) {
        const tabsContainer = document.getElementById('tabs');
        
        const tabElement = document.createElement('div');
        tabElement.className = 'tab';
        tabElement.dataset.tabId = tab.id;
        
        tabElement.innerHTML = `
            <span class="tab-title">${tab.title}</span>
            <button class="tab-close" data-tab-id="${tab.id}">×</button>
        `;
        
        // 点击切换标签页
        tabElement.addEventListener('click', (e) => {
            if (!e.target.classList.contains('tab-close')) {
                this.switchToTab(tab.id);
            }
        });
        
        // 关闭标签页
        tabElement.querySelector('.tab-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTab(tab.id);
        });
        
        tabsContainer.appendChild(tabElement);
        
        // 重新计算标签页宽度
        this.adjustTabWidths();
    }

    createWebView(tab) {
        const contentArea = document.getElementById('content-area');
        
        const webview = document.createElement('webview');
        webview.id = `webview-${tab.id}`;
        webview.src = tab.url;
        webview.className = 'webview';
        webview.preload = './preload.js';
        
        // 启用跨域和其他功能
        webview.setAttribute('allowpopups', 'true');
        // webview.setAttribute('disablewebsecurity', 'true');
        webview.setAttribute('webpreferences', 'allowRunningInsecureContent');

        webview.addEventListener('did-attach', (event) => {
            console.log('webview 已附加');
        });
        
        // webview 事件监听
        webview.addEventListener('dom-ready', () => {
            // DOM 准备就绪，但不立即更新导航按钮，等待导航事件
            console.log('dom-ready');
            const wcId = webview.getWebContentsId();
            ipcRenderer.send('register-webview-handler', wcId);
        });
        
        webview.addEventListener('did-navigate', (e) => {
            tab.url = e.url;
            this.updateAddressBar(e.url);
            this.updateNavigationButtons();
        });
        
        webview.addEventListener('did-navigate-in-page', (e) => {
            // this.updateTabTitle(tab.id, '加载中...');
            console.log('did-navigate-in-page');
            tab.url = e.url;
            this.updateAddressBar(e.url);
            this.updateNavigationButtons();
        });
        
        webview.addEventListener('page-title-updated', (e) => {
            tab.title = e.title;
            console.log('page-title-updated', e.title);
            this.updateTabTitle(tab.id, e.title);
        });
        
        webview.addEventListener('did-start-loading', () => {
            // 
        });
        
        webview.addEventListener('did-stop-loading', () => {
            this.updateNavigationButtons();
        });
        webview.addEventListener('did-finish-load', async (e) => {
            console.log('did-finish-load');
        });
        
        contentArea.appendChild(webview);
    }

    switchToTab(tabId) {
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

    closeTab(tabId) {
        if (this.tabs.length <= 1) {
            return; // 至少保留一个标签页
        }
        let tabIndex = 0;
        // 移除标签页数据
        this.tabs = this.tabs.filter((tab, index) => {
            const isNotTabId = tab.id !== tabId;
            if (isNotTabId) {
                return true;
            }
            tabIndex = index;
            return false;
        });
        
        // 移除DOM元素
        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        const webview = document.getElementById(`webview-${tabId}`);
        
        if (tabElement) tabElement.remove();
        if (webview) webview.remove();
        
        // 如果关闭的是当前活动标签页，切换到其他标签页
        if (this.activeTabId === tabId) {
            const switched2Index = tabIndex > 0 ? tabIndex - 1 : 0;
            const remainingTab = this.tabs[switched2Index];
            if (remainingTab) {
                this.switchToTab(remainingTab.id);
            }
        }
        
        // 重新计算标签页宽度
        this.adjustTabWidths();
    }

    updateTabTitle(tabId, title) {
        const tabElement = document.querySelector(`[data-tab-id="${tabId}"] .tab-title`);
        if (tabElement) {
            // 根据标签页数量动态调整标题长度
            const maxLength = this.getMaxTitleLength();
            tabElement.textContent = title.length > maxLength ? title.substring(0, maxLength) + '...' : title;
        }
        
        // 更新标签页数据
        const tab = this.tabs.find(t => t.id === tabId);
        if (tab) {
            tab.title = title;
        }
    }

    // 根据标签页数量计算最大标题长度
    getMaxTitleLength() {
        const tabCount = this.tabs.length;
        if (tabCount <= 2) return 25;
        if (tabCount <= 4) return 20;
        if (tabCount <= 6) return 15;
        if (tabCount <= 8) return 12;
        return 8; // 8个以上标签页时，标题最短
    }

    // 动态调整标签页宽度
    adjustTabWidths() {
        const tabsContainer = document.getElementById('tabs');
        const tabs = tabsContainer.querySelectorAll('.tab');
        
        if (tabs.length === 0) return;
        
        // 获取容器宽度
        const containerWidth = document.querySelector('.tabs-container').offsetWidth;
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
        tabs.forEach(tab => {
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

    updateAddressBar(url) {
        document.getElementById('address-bar').value = url;
    }

    updateNavigationButtons() {
        const activeWebview = document.querySelector('webview.active');
        if (activeWebview && typeof activeWebview.canGoBack === 'function' && typeof activeWebview.canGoForward === 'function') {
            document.getElementById('back-btn').disabled = !activeWebview.canGoBack();
            document.getElementById('forward-btn').disabled = !activeWebview.canGoForward();
        } else {
            // 如果 webview 还没有完全初始化，禁用导航按钮
            document.getElementById('back-btn').disabled = true;
            document.getElementById('forward-btn').disabled = true;
        }
    }

    navigate(input) {
        if (!input.trim()) return;
        
        let url = input.trim();
        
        // 检查是否是完整的URL
        if (!url.match(/^https?:\/\//)) {
            // 检查是否看起来像域名
            if (url.includes('.') && !url.includes(' ')) {
                url = 'https://' + url;
            } else {
                // 否则作为搜索查询
                url = `https://www.bing.com/search?q=${encodeURIComponent(url)}`;
            }
        }
        /**
         * @type {import('electron').WebviewTag}
         */
        const activeWebview = document.querySelector('webview.active');
        if (activeWebview) {
            activeWebview.src = url;
        }
    }

    goBack() {
        const activeWebview = document.querySelector('webview.active');
        if (activeWebview && activeWebview.canGoBack()) {
            activeWebview.goBack();
        }
    }

    goForward() {
        const activeWebview = document.querySelector('webview.active');
        if (activeWebview && activeWebview.canGoForward()) {
            activeWebview.goForward();
        }
    }

    refresh() {
        const activeWebview = document.querySelector('webview.active');
        if (activeWebview) {
            activeWebview.reload();
        }
    }

    goHome() {
        this.navigate('https://www.bing.com');
    }

    async addBookmark() {
        const activeWebview = document.querySelector('webview.active');
        if (!activeWebview) return;
        
        const activeTab = this.tabs.find(tab => tab.id === this.activeTabId);
        if (!activeTab) return;
        
        const bookmark = {
            title: activeTab.title || '未命名页面',
            url: activeTab.url
        };
        
        try {
            this.bookmarks = await ipcRenderer.invoke('add-bookmark', bookmark);
            this.renderBookmarks();
            
            // 显示添加成功的反馈
            const btn = document.getElementById('bookmark-btn');
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '✓';
            setTimeout(() => {
                btn.innerHTML = originalHTML;
            }, 1000);
        } catch (error) {
            console.error('添加书签失败:', error);
        }
    }

    async loadBookmarks() {
        try {
            this.bookmarks = await ipcRenderer.invoke('get-bookmarks');
            this.renderBookmarks();
        } catch (error) {
            console.error('加载书签失败:', error);
        }
    }

    renderBookmarks() {
        const bookmarksList = document.getElementById('bookmarks-list');
        
        if (this.bookmarks.length === 0) {
            bookmarksList.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">暂无收藏</div>';
            return;
        }
        
        bookmarksList.innerHTML = this.bookmarks.map(bookmark => `
            <div class="bookmark-item">
                <div class="bookmark-info" data-url="${bookmark.url}">
                    <div class="bookmark-title">${bookmark.title}</div>
                    <div class="bookmark-url">${bookmark.url}</div>
                </div>
                <button class="bookmark-remove" data-id="${bookmark.id}">删除</button>
            </div>
        `).join('');
        
        // 添加点击事件
        bookmarksList.querySelectorAll('.bookmark-info').forEach(item => {
            item.addEventListener('click', () => {
                this.navigate(item.dataset.url);
                this.toggleBookmarksSidebar(); // 关闭侧边栏
            });
        });
        
        // 添加删除事件
        bookmarksList.querySelectorAll('.bookmark-remove').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    const id = parseInt(btn.dataset.id);
                    this.bookmarks = await ipcRenderer.invoke('remove-bookmark', id);
                    this.renderBookmarks();
                } catch (error) {
                    console.error('删除书签失败:', error);
                }
            });
        });
    }

    toggleBookmarksSidebar() {
        const sidebar = document.getElementById('bookmarks-sidebar');
        sidebar.classList.toggle('hidden');
    }

    setupSettingsMenu() {
        const settingsBtn = document.getElementById('settings-btn');
        const settingsMenu = document.getElementById('settings-menu');
        const debugMenu = document.getElementById('debug-menu');
        const debugSubmenu = debugMenu.querySelector('.submenu');

        // 设置按钮点击事件
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            settingsMenu.classList.toggle('hidden');
        });

        // 调试菜单悬停事件
        debugMenu.addEventListener('mouseenter', () => {
            debugSubmenu.classList.remove('hidden');
        });

        debugMenu.addEventListener('mouseleave', () => {
            debugSubmenu.classList.add('hidden');
        });

        // 调试子菜单项点击事件
        document.getElementById('debug-menu').addEventListener('click', () => {
            this.openDevTools();
            this.hideAllMenus();
        });

        document.getElementById('reload-page').addEventListener('click', () => {
            this.refresh();
            this.hideAllMenus();
        });

        document.getElementById('hard-reload').addEventListener('click', () => {
            this.hardReload();
            this.hideAllMenus();
        });

        // 主题菜单点击事件
        document.getElementById('theme-menu').addEventListener('click', () => {
            this.toggleTheme();
            this.hideAllMenus();
        });

        // 关于菜单点击事件
        document.getElementById('about-menu').addEventListener('click', () => {
            this.showAbout();
            this.hideAllMenus();
        });

        // 点击其他地方关闭菜单
        document.addEventListener('click', (e) => {
            if (!settingsBtn.contains(e.target) && !settingsMenu.contains(e.target)) {
                this.hideAllMenus();
            }
        });
    }
    preventDefaultMayBe(e) {
        if (e && e.preventDefault) {
            e.preventDefault();
        }
    }
    shortcutsListener(e) {
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
            if (this.tabs.length > 1) {
                this.closeTab(this.activeTabId);
            }
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
            document.getElementById('address-bar').focus();
            document.getElementById('address-bar').select();
        }
    }

    setupKeyboardShortcuts() {
        // 全局键盘事件监听
        window.addEventListener('keydown', (e) => {
            this.shortcutsListener(e);
        }, true);
    }

    hideAllMenus() {
        document.getElementById('settings-menu').classList.add('hidden');
        document.querySelector('#debug-menu .submenu').classList.add('hidden');
    }

    openDevTools() {
        const activeWebview = document.querySelector('webview.active');
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

    hardReload() {
        const activeWebview = document.querySelector('webview.active');
        if (activeWebview) {
            activeWebview.reloadIgnoringCache();
        }
    }

    toggleTheme() {
        const body = document.body;
        const isDark = body.classList.contains('dark-theme');
        
        if (isDark) {
            body.classList.remove('dark-theme');
            localStorage.setItem('theme', 'light');
            logger.info('切换到浅色主题');
        } else {
            body.classList.add('dark-theme');
            localStorage.setItem('theme', 'dark');
            logger.info('切换到暗黑主题');
        }
        
        // 更新主题菜单显示
        this.updateThemeMenuText();
    }

    initTheme() {
        // 从localStorage加载保存的主题设置
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        // 如果没有保存的主题设置，则使用系统偏好
        const shouldUseDark = savedTheme === 'dark' || (savedTheme === null && prefersDark);
        
        if (shouldUseDark) {
            document.body.classList.add('dark-theme');
        }
        
        this.updateThemeMenuText();
        logger.info('主题初始化完成:', shouldUseDark ? '暗黑主题' : '浅色主题');
    }

    updateThemeMenuText() {
        const themeMenu = document.querySelector('#theme-menu span');
        const isDark = document.body.classList.contains('dark-theme');
        if (themeMenu) {
            themeMenu.textContent = isDark ? '浅色主题' : '暗黑主题';
        }
    }

    showAbout() {
        // 显示关于对话框
        const activeWebview = document.querySelector('webview.active');
        if (activeWebview) {
            activeWebview.executeJavaScript(`
                alert('My Browser v1.0.0\\n基于 Electron 开发的现代浏览器\\n\\n功能特性：\\n• 多标签页浏览\\n• 智能地址栏\\n• 书签管理\\n• 自动跨域支持\\n• 开发者工具');
            `);
        }
    }

    // 窗口控制功能
    minimizeWindow() {
        ipcRenderer.send('window-minimize');
    }

    maximizeWindow() {
        ipcRenderer.send('window-maximize');
    }

    closeWindow() {
        ipcRenderer.send('window-close');
    }

    updateMaximizeButton(isMaximized) {
        const maximizeBtn = document.getElementById('maximize-btn');
        const svg = maximizeBtn.querySelector('svg');
        
        if (isMaximized) {
            // 显示恢复窗口图标 (两个重叠的方框)
            svg.innerHTML = `
                <rect x="2" y="2" width="6" height="6" stroke="currentColor" stroke-width="1.5" fill="none"/>
                <rect x="4" y="4" width="6" height="6" stroke="currentColor" stroke-width="1.5" fill="none"/>
            `;
            // maximizeBtn.title = '还原';
        } else {
            // 显示最大化图标 (单个方框)
            svg.innerHTML = `
                <rect x="2" y="2" width="8" height="8" stroke="currentColor" stroke-width="1.5" fill="none"/>
            `;
            // maximizeBtn.title = '最大化';
        }
    }
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    new BrowserApp();
}); 