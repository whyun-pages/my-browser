import { AbstractComponent, type BaseProps } from "@/jsx-runtime";
import { globalModel } from "@/renderer/models/global.model";
import { settings, type Layout, type Theme } from "@/renderer/models/settings.model";
import { IconCode, IconInfo, IconMore, IconReload, IconSidebar, IconSliders } from "../icons";

const MOD_KEY = /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl+';

/**
 * 设置按钮、收起侧栏按钮和设置面板，两种布局共用一份。
 * 经典布局下位于工具栏右端，面板向下弹出；侧栏布局下位于侧栏底部，面板向上弹出。
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
    /** 让面板里的选中状态和当前设置保持一致 */
    private sync() {
        const mark = (selector: string, checked: boolean) => {
            this.panel.querySelector(selector)?.setAttribute('aria-checked', String(checked));
        };
        mark('[data-layout-value="classic"]', settings.layout === 'classic');
        mark('[data-layout-value="rail"]', settings.layout === 'rail');
        mark('[data-theme-value="light"]', settings.theme === 'light');
        mark('[data-theme-value="dark"]', settings.theme === 'dark');
        mark('#cors-switch', settings.allowCrossOrigin);
    }
    private setLayout(layout: Layout) {
        // 面板在两种布局里的位置不同，换布局前先收起
        this.close();
        settings.layout = layout;
    }
    private setTheme(theme: Theme) {
        settings.theme = theme;
        this.sync();
    }
    private toggleCrossOrigin() {
        settings.allowCrossOrigin = !settings.allowCrossOrigin;
        this.sync();
    }
    private toggleRail() {
        settings.railCollapsed = !settings.railCollapsed;
        const label = settings.railCollapsed ? '展开侧栏' : '收起侧栏';
        const button = document.getElementById('rail-fold-btn');
        button?.setAttribute('title', label);
        button?.setAttribute('aria-label', label);
    }
    private run(action: () => void) {
        this.close();
        action();
    }
    private showAbout() {
        const version = new URLSearchParams(window.location.search).get('version') || '';
        alert(`My Browser v${version}\n基于 Electron 开发的浏览器\n\n功能特性：\n• 多标签页浏览\n• 智能地址栏\n• 书签管理\n• 可开关的跨域支持\n• 开发者工具`);
    }

    render() {
        const foldLabel = settings.railCollapsed ? '展开侧栏' : '收起侧栏';
        return (
            <div class="settings-container">
                <button id="settings-btn" class="icon-btn settings-btn" title="设置" aria-label="设置"
                    aria-haspopup="dialog" aria-expanded="false" onclick={() => this.toggle()}>
                    <IconMore class="only-classic" />
                    <IconSliders class="only-rail" />
                    <span class="settings-label only-rail">设置</span>
                </button>
                <button id="rail-fold-btn" class="icon-btn only-rail" title={foldLabel} aria-label={foldLabel}
                    onclick={() => this.toggleRail()}>
                    <IconSidebar />
                </button>

                {/* 点击网页内部的事件传不到外壳，所以面板打开时铺一层透明遮罩来接住“点外面关闭” */}
                <div id="settings-backdrop" class="backdrop hidden" onclick={() => this.close()}></div>

                <div id="settings-panel" class="settings-panel hidden" role="dialog" aria-label="设置">
                    <div class="setting-row">
                        <span class="setting-name">布局</span>
                        <div class="segmented" role="radiogroup" aria-label="布局">
                            <button role="radio" aria-checked="false" data-layout-value="classic"
                                onclick={() => this.setLayout('classic')}>经典</button>
                            <button role="radio" aria-checked="false" data-layout-value="rail"
                                onclick={() => this.setLayout('rail')}>侧栏</button>
                        </div>
                    </div>
                    <div class="setting-row">
                        <span class="setting-name">主题</span>
                        <div class="segmented" role="radiogroup" aria-label="主题">
                            <button role="radio" aria-checked="false" data-theme-value="light"
                                onclick={() => this.setTheme('light')}>浅色</button>
                            <button role="radio" aria-checked="false" data-theme-value="dark"
                                onclick={() => this.setTheme('dark')}>暗黑</button>
                        </div>
                    </div>
                    <div class="setting-row">
                        <label class="setting-name" id="cors-switch-label">
                            允许跨域
                            <small>对之后新开的标签页生效</small>
                        </label>
                        <button id="cors-switch" class="switch" role="switch" aria-checked="false"
                            aria-labelledby="cors-switch-label" onclick={() => this.toggleCrossOrigin()}></button>
                    </div>
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
                    <button class="menu-item" id="about-menu" onclick={() => this.run(() => this.showAbout())}>
                        <IconInfo />关于 MyBrowser
                    </button>
                </div>
            </div>
        )
    }
}
