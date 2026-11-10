// 设置页：作为一种内置标签页显示在内容区里，由外壳直接绘制，不是网页视图。
// 因此它不会出现在 AI 接口的标签页列表里，AI 无法读取或修改这里的设置。
import { globalModel } from "@/renderer/models/global.model";
import { settings, type Layout, type ThemePreference } from "@/renderer/models/settings.model";
import { mcpModel } from "@/renderer/models/mcp.model";
import logoUrl from "@/renderer/assets/logo.png";
import {
    IconAlert, IconClose, IconExternal, IconFolder, IconGear, IconGlobe, IconInfo,
    IconPalette, IconPlug, IconSearch,
} from "../icons";
import { ConnectionDialog } from "./connection-dialog";
import { CopyButton } from "./copy-button";

export type SettingsSection = 'appearance' | 'web' | 'mcp' | 'about';

const SECTIONS: { id: SettingsSection; title: string; icon: (props: { class?: string }) => Node }[] = [
    { id: 'appearance', title: '外观', icon: IconPalette },
    { id: 'web', title: '网页', icon: IconGlobe },
    { id: 'mcp', title: 'AI 接口（MCP）', icon: IconPlug },
    { id: 'about', title: '关于 MyBrowser', icon: IconInfo },
];

export const SETTINGS_URL_PREFIX = 'mybrowser://settings';
const DEFAULT_MCP_URL = 'http://127.0.0.1:17345/mcp';
const PROJECT_URL = 'https://github.com/whyun-pages/my-browser';

export function isSettingsSection(value: unknown): value is SettingsSection {
    return SECTIONS.some((s) => s.id === value);
}

/** 从 mybrowser://settings/<分区> 里取出分区；不是设置页地址时返回 undefined，分区无效时返回 null */
export function parseSettingsUrl(url: string): SettingsSection | null | undefined {
    const match = /^mybrowser:\/\/settings\/?([^?#]*)/i.exec(url.trim());
    if (!match) {
        return undefined;
    }
    const section = match[1].replace(/\/$/, '');
    return isSettingsSection(section) ? section : null;
}

/** 一行设置。keys 是搜索用的额外关键词，标题和说明会自动并进去 */
interface RowSpec {
    keys: string;
    build: () => Node;
}

export class SettingsPage {
    readonly element: HTMLElement;
    private section: SettingsSection = 'appearance';
    private query = '';
    private nav: HTMLElement;
    private main: HTMLElement;
    private head: HTMLElement;
    private searchInput: HTMLInputElement;
    private clearButton: HTMLButtonElement;
    private dialog = new ConnectionDialog();
    private unsubscribe: (() => void)[] = [];
    /** 地址变化（切换分区、搜索）时通知标签页更新地址栏 */
    private onUrlChange: (url: string) => void;

    constructor(onUrlChange: (url: string) => void) {
        this.onUrlChange = onUrlChange;
        this.searchInput = (
            <input id="settings-search" type="search" placeholder="搜索设置" spellcheck="false" autocomplete="off"
                aria-label="搜索设置"
                oninput={() => this.setQuery(this.searchInput.value)}
                onkeydown={(e: KeyboardEvent) => {
                    if (e.key === 'Escape' && this.searchInput.value) {
                        e.stopPropagation();
                        this.setQuery('');
                    }
                }} />
        ) as HTMLInputElement;
        this.clearButton = (
            <button class="icon-btn sp-icon-btn hidden" title="清除搜索" aria-label="清除搜索"
                onclick={() => {
                    this.setQuery('');
                    this.searchInput.focus();
                }}>
                <IconClose />
            </button>
        ) as HTMLButtonElement;
        this.nav = <nav class="sp-nav" aria-label="设置分区"></nav> as HTMLElement;
        this.main = <div class="sp-main"></div> as HTMLElement;
        this.head = (
            <div class="sp-head">
                <div class="sp-title"><IconGear />设置</div>
                <label class="sp-search"><IconSearch />{this.searchInput}{this.clearButton}</label>
            </div>
        ) as HTMLElement;
        this.element = (
            <div id="settings-page" class="settings-page" role="region" aria-label="设置">
                {this.head}
                <div class="sp-body">{this.nav}{this.main}</div>
            </div>
        ) as HTMLElement;
        this.element.addEventListener('scroll', () => {
            this.head.classList.toggle('scrolled', this.element.scrollTop > 4);
        });

        mcpModel.init();
        this.unsubscribe.push(settings.onChange(() => this.render()));
        this.unsubscribe.push(mcpModel.onChange(() => this.render()));
        this.render();
    }

    get url() {
        return this.query
            ? `${SETTINGS_URL_PREFIX}?search=${encodeURIComponent(this.query)}`
            : `${SETTINGS_URL_PREFIX}/${this.section}`;
    }

    /** 切到某个分区；不传时保留当前分区。每次显示都重新绘制，让“已打开的标签页”等信息保持最新 */
    show(section?: SettingsSection) {
        if (section) {
            this.section = section;
            this.query = '';
            this.searchInput.value = '';
            this.element.scrollTop = 0;
        }
        this.render();
        this.onUrlChange(this.url);
    }

    destroy() {
        this.unsubscribe.forEach((off) => off());
        this.unsubscribe = [];
        this.dialog.close();
    }

    private setQuery(query: string) {
        this.query = query;
        if (this.searchInput.value !== query) {
            this.searchInput.value = query;
        }
        this.element.scrollTop = 0;
        this.render();
        this.onUrlChange(this.url);
    }

    private render() {
        // 重绘会替换按钮，记下键盘焦点在哪个控件上，绘制完放回去
        const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.key;
        const scroll = this.element.scrollTop;
        this.clearButton.classList.toggle('hidden', !this.query);
        this.renderNav();
        this.renderMain();
        this.element.scrollTop = scroll;
        if (focusKey) {
            (this.element.querySelector(`[data-key="${focusKey}"]`) as HTMLElement | null)?.focus();
        }
    }

    private renderNav() {
        const searching = !!this.query.trim();
        this.nav.classList.toggle('searching', searching);
        this.nav.replaceChildren(...SECTIONS.map((s) => {
            const Icon = s.icon;
            const button = (
                <button data-key={`nav-${s.id}`} data-section={s.id} onclick={() => this.show(s.id)}>
                    <Icon /><span>{s.title}</span>
                </button>
            ) as HTMLElement;
            if (s.id === this.section) {
                button.setAttribute('aria-current', 'page');
            }
            if (s.id === 'mcp' && mcpModel.viewState !== 'off') {
                button.append(<span class={`sp-dot ${mcpModel.viewState}`}></span>);
            }
            return button;
        }));
    }

    private renderMain() {
        const query = this.query.trim().toLowerCase();
        const list = query ? SECTIONS : SECTIONS.filter((s) => s.id === this.section);
        const sections: Node[] = [];
        for (const s of list) {
            const rows = this.rows(s.id).filter((r) => !query || r.keys.includes(query) || s.title.toLowerCase().includes(query));
            if (!rows.length) {
                continue;
            }
            sections.push(
                <section class="sp-sec" data-section={s.id}>
                    <h2>{this.hl(s.title)}</h2>
                    <div class="sp-card">{rows.map((r) => r.build())}</div>
                </section>
            );
        }
        if (!sections.length) {
            sections.push(
                <div class="sp-empty"><IconSearch />没有找到和“{this.query.trim()}”有关的设置</div>
            );
        }
        this.main.replaceChildren(...sections);
    }

    /** 把搜索词高亮成 <mark>，返回文字和元素混排的子节点 */
    private hl(text: string): (string | Node)[] {
        const query = this.query.trim();
        if (!query) {
            return [text];
        }
        const out: (string | Node)[] = [];
        const lower = text.toLowerCase();
        const q = query.toLowerCase();
        let from = 0;
        for (let at = lower.indexOf(q); at >= 0; at = lower.indexOf(q, from)) {
            out.push(text.slice(from, at), <mark>{text.slice(at, at + q.length)}</mark>);
            from = at + q.length;
        }
        out.push(text.slice(from));
        return out;
    }

    private row(spec: {
        title: string;
        desc?: string;
        control?: () => Node | Node[];
        stack?: boolean;
        keys?: string;
        extra?: () => Node[];
        bad?: boolean;
        dim?: boolean;
        after?: () => Node;
    }): RowSpec {
        return {
            keys: `${spec.title} ${spec.desc || ''} ${spec.keys || ''}`.toLowerCase(),
            build: () => {
                const cls = ['sp-row', spec.stack ? 'stack' : '', spec.dim ? 'dim' : ''].filter(Boolean).join(' ');
                const text = (
                    <div class="sp-row-text">
                        <div class="sp-row-title">{this.hl(spec.title)}</div>
                    </div>
                ) as HTMLElement;
                if (spec.desc) {
                    text.append(<div class={spec.bad ? 'sp-row-desc bad' : 'sp-row-desc'}>{this.hl(spec.desc)}</div>);
                }
                if (spec.extra) {
                    text.append(...spec.extra());
                }
                const row = <div class={cls}>{text}</div> as HTMLElement;
                if (spec.control) {
                    const control = spec.control();
                    const nodes = Array.isArray(control) ? control : [control];
                    row.append(spec.stack ? nodes[0] : <div class="sp-row-ctl">{nodes}</div>);
                }
                if (!spec.after) {
                    return row;
                }
                const group = document.createDocumentFragment();
                group.append(row, spec.after());
                return group;
            },
        };
    }

    private switch(key: string, checked: boolean, label: string, onToggle: () => void, disabled = false) {
        const button = (
            <button class="switch" role="switch" aria-checked={String(checked)} aria-label={label}
                data-key={key} onclick={onToggle}></button>
        ) as HTMLButtonElement;
        button.disabled = disabled;
        return button;
    }

    private choice(key: string, checked: boolean, label: string, thumb: string, onPick: () => void) {
        return (
            <button class="sp-choice" role="radio" aria-checked={String(checked)} data-key={key} onclick={onPick}>
                <span class={`sp-thumb ${thumb}`}><b class="t1"></b><b class="t2"></b><b class="t3"></b></span>
                <span class="sp-choice-label"><span class="sp-radio"></span>{label}</span>
            </button>
        );
    }

    private rows(section: SettingsSection): RowSpec[] {
        switch (section) {
            case 'appearance':
                return this.appearanceRows();
            case 'web':
                return this.webRows();
            case 'mcp':
                return this.mcpRows();
            case 'about':
                return this.aboutRows();
        }
    }

    private appearanceRows(): RowSpec[] {
        const layout = (value: Layout, label: string) => this.choice(`layout-${value}`, settings.layout === value, label,
            `th-${value}`, () => { settings.layout = value; });
        const theme = (value: ThemePreference, label: string) => this.choice(`theme-${value}`, settings.themePreference === value,
            label, `th-${value}`, () => { settings.themePreference = value; });
        const rows = [
            this.row({
                title: '布局',
                desc: '经典布局的标签栏在上方；侧栏布局把标签页和收藏竖排在左侧，标题能完整显示。切换时已打开的页面不会重新加载。',
                keys: 'layout 经典 侧栏 标签栏',
                stack: true,
                control: () => <div class="sp-choices" role="radiogroup" aria-label="布局">{layout('classic', '经典')}{layout('rail', '侧栏')}</div>,
            }),
            this.row({
                title: '主题',
                desc: '“跟随系统”会随系统的深浅色设置自动切换。也可以在菜单里快速切换。',
                keys: 'theme 浅色 暗黑 深色 dark light 跟随系统',
                stack: true,
                control: () => (
                    <div class="sp-choices" role="radiogroup" aria-label="主题">
                        {theme('light', '浅色')}{theme('dark', '暗黑')}{theme('system', '跟随系统')}
                    </div>
                ),
            }),
        ];
        if (settings.layout === 'rail') {
            rows.push(this.row({
                title: '收起侧栏',
                desc: '侧栏只显示站点图标，网页区域更宽。也可以点侧栏底部的按钮切换。',
                keys: '窄条 图标',
                control: () => this.switch('rail-slim', settings.railCollapsed, '收起侧栏',
                    () => { settings.railCollapsed = !settings.railCollapsed; }),
            }));
        }
        return rows;
    }

    private webRows(): RowSpec[] {
        const tabs = [...(globalModel.webviewHelper?.tabs.values() || [])].filter((t) => t.kind !== 'settings');
        const allowed = tabs.filter((t) => t.crossOrigin).length;
        return [
            this.row({
                title: '允许跨域',
                desc: '关闭网页的同源策略，页面可以直接读取其他源的响应，方便调试接口。只对之后新开的标签页生效。',
                keys: 'cors 同源 跨源 接口',
                extra: () => [<div class="sp-row-desc">已打开的 {String(tabs.length)} 个标签页里，{String(allowed)} 个放行了跨域。地址栏左侧的标记显示每个标签页的实际状态。</div>],
                control: () => this.switch('cors', settings.allowCrossOrigin, '允许跨域',
                    () => { settings.allowCrossOrigin = !settings.allowCrossOrigin; }),
            }),
        ];
    }

    private mcpRows(): RowSpec[] {
        const view = mcpModel.viewState;
        const status = mcpModel.status;
        const url = status?.url || DEFAULT_MCP_URL;
        const running = view === 'on';
        const busy = view === 'starting' || view === 'stopping';
        const statusLabel = {
            on: '运行中', starting: '正在启动…', stopping: '正在关闭…', error: '启动失败', off: '未开启',
        }[view];
        const statusNode = () => <span class="sp-status" id="mcp-status-label"><span class={`sp-dot ${view}`}></span>{statusLabel}</span>;

        const rows = [
            this.row({
                title: '允许 AI 客户端连接',
                desc: '在本机启动 MCP 服务，让 Claude Code、Cursor 等 AI 工具通过 MyBrowser 打开、读取和操作网页。',
                keys: 'mcp ai claude cursor 开关 服务 权限 登录 安全 令牌',
                control: () => this.switch('mcp-switch', mcpModel.switchOn, '允许 AI 客户端连接',
                    () => mcpModel.setEnabled(!mcpModel.switchOn), busy),
                after: () => (
                    <div class="sp-warn">
                        <IconAlert />
                        <div><b>开启后，连接的 AI 可以读取和操作所有已打开的标签页</b>，包括你自己打开、已经登录的页面，并能在页面里执行 JavaScript。只连接你信任的客户端，不要把访问令牌发给别人。</div>
                    </div>
                ),
            }),
        ];
        if (view === 'error') {
            rows.push(this.row({
                title: '服务状态',
                desc: status?.error?.message || '启动失败',
                bad: true,
                keys: '状态 错误 端口 占用',
                control: () => [statusNode(), (
                    <button class="sp-btn" data-key="mcp-retry" onclick={() => mcpModel.setEnabled(true)}>重试</button>
                )],
            }));
        } else {
            rows.push(this.row({
                title: '服务状态',
                desc: running ? 'AI 打开的标签页会在标题旁显示 AI 标记，并默认在后台打开。' : '',
                keys: '状态 运行',
                control: statusNode,
            }));
        }
        rows.push(
            this.row({
                title: '监听地址',
                desc: '只接受本机连接，每个请求都要带访问令牌，网页无法直接调用。',
                keys: '地址 端口 127.0.0.1 endpoint url',
                dim: !running,
                control: () => [
                    <span class="sp-mono" id="mcp-endpoint">{url}</span>,
                    CopyButton({ text: () => url, label: '复制地址', key: 'mcp-copy-url', disabled: !running }),
                ],
            }),
            this.row({
                title: '连接 AI 客户端',
                desc: '查看 Claude Code、Cursor、VS Code 和 Claude 桌面版的配置方法，配置里已经填好地址和令牌。',
                keys: 'claude code cursor vscode vs code 桌面版 配置 stdio json 令牌 token',
                control: () => {
                    const button = (
                        <button class="sp-btn primary" id="mcp-connect-btn" data-key="mcp-connect"
                            onclick={(e: MouseEvent) => this.dialog.open(e.currentTarget as HTMLElement)}>连接配置</button>
                    ) as HTMLButtonElement;
                    button.disabled = !mcpModel.canConnect;
                    if (!mcpModel.canConnect) {
                        button.title = '先开启 AI 接口';
                    }
                    return button;
                },
            }),
            this.row({
                title: '配置文件',
                desc: '端口和访问令牌保存在这个文件里。',
                keys: 'mcp.json 端口 令牌 文件 路径',
                extra: () => [<div class="sp-path" id="mcp-config-path">{mcpModel.configPath}</div>],
                control: () => (
                    <button class="sp-btn" data-key="mcp-show-config" onclick={() => mcpModel.showConfigFile()}>
                        <IconFolder />打开所在文件夹
                    </button>
                ),
            }),
        );
        return rows;
    }

    private aboutRows(): RowSpec[] {
        const version = new URLSearchParams(window.location.search).get('version') || '';
        const electron = /Electron\/([\d.]+)/.exec(navigator.userAgent)?.[1];
        const chrome = /Chrome\/([\d.]+)/.exec(navigator.userAgent)?.[1];
        const runtime = [electron && `Electron ${electron}`, chrome && `Chromium ${chrome}`].filter(Boolean).join(' · ');
        const open = (url: string) => () => globalModel.webviewHelper?.createNewTab(url);
        return [
            {
                keys: `mybrowser 版本 version ${version} electron chromium`,
                build: () => (
                    <div class="sp-about">
                        <img class="sp-logo" src={logoUrl} alt="" />
                        <div>
                            <div class="sp-about-name">MyBrowser</div>
                            <div class="sp-row-desc">版本 {version || '未知'}{runtime ? ` · ${runtime}` : ''}</div>
                        </div>
                    </div>
                ),
            },
            this.row({
                title: '项目主页',
                desc: 'github.com/whyun-pages/my-browser',
                keys: 'github 源码',
                control: () => <button class="sp-btn" data-key="about-home" onclick={open(PROJECT_URL)}><IconExternal />打开</button>,
            }),
            this.row({
                title: '问题反馈',
                desc: '在 GitHub Issues 里报告问题或提建议。',
                keys: 'issue bug 反馈',
                control: () => <button class="sp-btn" data-key="about-issues" onclick={open(`${PROJECT_URL}/issues`)}><IconExternal />打开</button>,
            }),
            this.row({ title: '许可证', desc: 'MIT · 作者 yunnysunny', keys: 'license mit 作者' }),
        ];
    }
}
