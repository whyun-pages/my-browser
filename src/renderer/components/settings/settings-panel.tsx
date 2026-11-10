import { AbstractComponent, type BaseProps } from "@/jsx-runtime";
import { globalModel } from "@/renderer/models/global.model";
import { settings, type ThemePreference } from "@/renderer/models/settings.model";
import { mcpModel } from "@/renderer/models/mcp.model";
import { IconBook, IconChevron, IconCode, IconInfo, IconMore, IconPlus, IconReload, IconSidebar, IconSliders } from "../icons";

const MOD_KEY = /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl+';

/**
 * 菜单按钮、收起侧栏按钮和菜单，两种布局共用一份。
 * 经典布局下位于工具栏右端，菜单向下弹出；侧栏布局下位于侧栏底部，菜单向上弹出。
 * 菜单只放常用操作，完整的设置在设置页（WebviewHelper.openSettings）。
 */
export class SettingsContainer extends AbstractComponent {
    constructor(props: BaseProps) {
        super(props);
        document.addEventListener('keydown', (e) => {
            // 只在外壳里处理 Esc，不从网页转发，避免抢走网页自己的 Esc
            if (e.key === 'Escape') {
                this.close();
                globalModel.bookmarkHelper?.hide();
            }
        });
        settings.onChange(() => {
            this.sync();
            this.syncFoldButton();
        });
        mcpModel.onChange(() => this.syncMcp());
        mcpModel.init();
    }
    private get panel() {
        return document.getElementById('settings-panel') as HTMLElement;
    }
    private get backdrop() {
        return document.getElementById('settings-backdrop') as HTMLElement;
    }
    private get isOpen() {
        return !this.panel.classList.contains('hidden');
    }
    open() {
        this.sync();
        this.syncMcp();
        this.panel.classList.remove('hidden');
        this.backdrop.classList.remove('hidden');
        document.getElementById('settings-btn')?.setAttribute('aria-expanded', 'true');
    }
    close() {
        this.panel.classList.add('hidden');
        this.backdrop.classList.add('hidden');
        document.getElementById('settings-btn')?.setAttribute('aria-expanded', 'false');
    }
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }
    /** 让菜单里的选中状态和当前设置保持一致 */
    private sync() {
        const panel = this.panel;
        if (!panel) {
            return;
        }
        for (const value of ['light', 'dark', 'system']) {
            panel.querySelector(`[data-theme-value="${value}"]`)
                ?.setAttribute('aria-checked', String(settings.themePreference === value));
        }
    }
    /** AI 接口开启时，菜单顶部显示一行状态，点了跳到设置页的 AI 接口分区 */
    private syncMcp() {
        const row = document.getElementById('menu-mcp-status');
        if (!row) {
            return;
        }
        const view = mcpModel.viewState;
        const visible = view === 'on' || view === 'error';
        row.classList.toggle('hidden', !visible);
        document.getElementById('menu-mcp-sep')?.classList.toggle('hidden', !visible);
        if (!visible) {
            return;
        }
        const port = mcpModel.status?.port;
        (row.querySelector('.menu-dot') as HTMLElement).className = `menu-dot ${view}`;
        (row.querySelector('.menu-status-title') as HTMLElement).textContent = view === 'on' ? 'AI 接口运行中' : 'AI 接口启动失败';
        (row.querySelector('.menu-status-sub') as HTMLElement).textContent = view === 'on'
            ? `127.0.0.1:${port}`
            : (mcpModel.status?.error?.code === 'port_in_use' ? `端口 ${port} 被占用` : '点击查看原因');
    }
    private syncFoldButton() {
        const label = settings.railCollapsed ? '展开侧栏' : '收起侧栏';
        const button = document.getElementById('rail-fold-btn');
        button?.setAttribute('title', label);
        button?.setAttribute('aria-label', label);
    }
    private setTheme(theme: ThemePreference) {
        settings.themePreference = theme;
    }
    private toggleRail() {
        settings.railCollapsed = !settings.railCollapsed;
    }
    private run(action: () => void) {
        this.close();
        action();
    }

    render() {
        const foldLabel = settings.railCollapsed ? '展开侧栏' : '收起侧栏';
        const theme = (value: ThemePreference, label: string) => (
            <button role="radio" aria-checked="false" data-theme-value={value}
                onclick={() => this.setTheme(value)}>{label}</button>
        );
        return (
            <div class="settings-container">
                <button id="settings-btn" class="icon-btn settings-btn" title="菜单" aria-label="菜单"
                    aria-haspopup="menu" aria-expanded="false" onclick={() => this.toggle()}>
                    <IconMore class="only-classic" />
                    <IconSliders class="only-rail" />
                    <span class="settings-label only-rail">菜单</span>
                </button>
                <button id="rail-fold-btn" class="icon-btn only-rail" title={foldLabel} aria-label={foldLabel}
                    onclick={() => this.toggleRail()}>
                    <IconSidebar />
                </button>

                {/* 点击网页内部的事件传不到外壳，所以菜单打开时铺一层透明遮罩来接住“点外面关闭” */}
                <div id="settings-backdrop" class="backdrop hidden" onclick={() => this.close()}></div>

                <div id="settings-panel" class="settings-panel hidden" role="menu" aria-label="菜单">
                    <button id="menu-mcp-status" class="menu-status hidden"
                        onclick={() => this.run(() => globalModel.webviewHelper?.openSettings('mcp'))}>
                        <span class="menu-dot"></span>
                        <span class="menu-status-text">
                            <span class="menu-status-title"></span>
                            <small class="menu-status-sub"></small>
                        </span>
                        <IconChevron />
                    </button>
                    <div id="menu-mcp-sep" class="menu-sep hidden"></div>
                    <div class="setting-row">
                        <span class="setting-name">主题</span>
                        <div class="segmented" role="radiogroup" aria-label="主题">
                            {theme('light', '浅色')}
                            {theme('dark', '暗黑')}
                            {theme('system', '跟随系统')}
                        </div>
                    </div>
                    <div class="menu-sep"></div>
                    <button class="menu-item" id="menu-new-tab"
                        onclick={() => this.run(() => globalModel.webviewHelper?.createNewTab())}>
                        <IconPlus />新建标签页<kbd>{MOD_KEY}T</kbd>
                    </button>
                    <button class="menu-item only-classic" id="menu-bookmarks"
                        onclick={() => this.run(() => globalModel.bookmarkHelper?.toggle())}>
                        <IconBook />收藏夹
                    </button>
                    <div class="menu-sep"></div>
                    <button class="menu-item" id="open-devtools"
                        onclick={() => this.run(() => globalModel.webviewHelper?.openDevTools())}>
                        <IconCode />开发者工具<kbd>F12</kbd>
                    </button>
                    <button class="menu-item" id="reload-page"
                        onclick={() => this.run(() => globalModel.webviewHelper?.refresh())}>
                        <IconReload />重新加载<kbd>{MOD_KEY}R</kbd>
                    </button>
                    <button class="menu-item" id="hard-reload"
                        onclick={() => this.run(() => globalModel.webviewHelper?.hardReload())}>
                        <IconReload />强制刷新<kbd>{MOD_KEY}Shift+R</kbd>
                    </button>
                    <div class="menu-sep"></div>
                    <button class="menu-item strong" id="menu-more-settings"
                        onclick={() => this.run(() => globalModel.webviewHelper?.openSettings())}>
                        <IconSliders />更多设置<kbd>{MOD_KEY},</kbd>
                    </button>
                    <button class="menu-item" id="about-menu"
                        onclick={() => this.run(() => globalModel.webviewHelper?.openSettings('about'))}>
                        <IconInfo />关于 MyBrowser
                    </button>
                </div>
            </div>
        )
    }
}
