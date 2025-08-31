import { AbstractComponent } from "@/jsx-runtime";
import { globalModel } from "@/renderer/models/global.model";

export class ActionButtons extends AbstractComponent {
    private get settingsMenu() {
        return document.getElementById('settings-menu') as HTMLElement;
    }
    private get debugMenu() {
        return document.getElementById('debug-menu') as HTMLElement;
    }
    private get aboutMenu() {
        return document.getElementById('about-menu') as HTMLElement;
    }
    showSettings() {
        this.settingsMenu.classList.remove('hidden');
    }
    hideSettings() {
        this.settingsMenu.classList.add('hidden');
    }
    toggleSettings() {
        this.settingsMenu.classList.toggle('hidden');
    }

    showBookmarksList() {
        globalModel.bookmarkHelper?.show();
        this.hideSettings();
    }

    showDebug() {
        this.debugMenu.querySelector('.submenu')?.classList.remove('hidden');
    }
    showAbout() {
        this.aboutMenu.classList.remove('hidden');
        this.hideSettings();
    }
    hideDebug() {
        this.debugMenu.querySelector('.submenu')?.classList.add('hidden');
    }
    toggleDebug() {
        this.debugMenu.querySelector('.submenu')?.classList.toggle('hidden');
    }
    openDevTools() {
        globalModel.webviewHelper?.openDevTools();
        this.hideSettings();
    }
    reloadPage() {
        globalModel.webviewHelper?.refresh();
        this.hideSettings();
    }
    hardReload() {
        globalModel.webviewHelper?.hardReload();
        this.hideSettings();
    }

    render() {
        return (
            <div class="action-buttons">
                <button id="go-btn" class="go-btn" onclick={() => globalModel.webviewHelper?.goto()}>前往</button>
                <button id="bookmark-btn" class="action-btn" title="添加到收藏夹"
                onclick={() => globalModel.webviewHelper?.toggleBookmark()}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                </button>


                <div class="settings-container">
                    <button id="settings-btn" class="action-btn" title="设置" onclick={() => this.toggleSettings()}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                    </button>
                    <div id="settings-menu" class="settings-menu hidden">
                        <div class="menu-item" id="theme-menu">
                            <span>主题</span>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M9 18l6-6-6-6" />
                            </svg>
                        </div>
                        <div id="bookmarks-list-btn" class="menu-item" title="查看收藏夹" onclick={() => this.showBookmarksList()}>
                            <span>收藏夹</span>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M3 12h18M3 18h18" />
                            </svg>
                        </div>
                        <div class="menu-item" id="debug-menu"
                        onclick={() => this.toggleDebug()}>
                            <span>调试</span>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M9 18l6-6-6-6" />
                            </svg>
                            <div class="submenu hidden">
                                <div class="submenu-item" id="open-devtools" onClick={() => this.openDevTools()}>打开开发者工具</div>
                                <div class="submenu-item" id="reload-page" onClick={() => this.reloadPage()}>重新加载页面</div>
                                <div class="submenu-item" id="hard-reload" onClick={() => this.hardReload()}>强制刷新</div>
                            </div>
                        </div>
                        <div class="menu-item" id="about-menu">
                            <span>关于</span>
                        </div>
                    </div>
                </div>
            </div>
        )
    }
}