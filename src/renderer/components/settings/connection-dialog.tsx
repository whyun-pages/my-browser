// “连接 AI 客户端”弹窗：按客户端分页，每页只给这个客户端自己的配置结构。
// 令牌只在打开弹窗时向主进程获取，默认打码显示，复制时复制完整内容。
import { mcpModel, type McpConnection } from "@/renderer/models/mcp.model";
import { IconAlert, IconClose, IconEye, IconEyeOff, IconInfo } from "../icons";
import { CopyButton } from "./copy-button";

type Client = 'claude-code' | 'cursor' | 'vscode' | 'claude-desktop' | 'other';
const CLIENTS: [Client, string][] = [
    ['claude-code', 'Claude Code'],
    ['cursor', 'Cursor'],
    ['vscode', 'VS Code'],
    ['claude-desktop', 'Claude 桌面版'],
    ['other', '其他程序'],
];
const SERVER_NAME = 'mybrowser';
/** 占位符：渲染时替换成打码或明文的令牌 */
const TOKEN_MARK = '\u0000TOKEN\u0000';

function json(value: unknown) {
    return JSON.stringify(value, null, 2);
}

/** 各客户端的配置文本。token 传 TOKEN_MARK 时用于显示，传真实令牌时用于复制 */
function snippet(client: Client, conn: McpConnection, token: string): string {
    const headers = { Authorization: `Bearer ${token}` };
    switch (client) {
        case 'claude-code':
            return `claude mcp add --transport http ${SERVER_NAME} ${conn.url} --header "Authorization: Bearer ${token}"`;
        case 'cursor':
            return json({ mcpServers: { [SERVER_NAME]: { url: conn.url, headers } } });
        case 'vscode':
            return json({ servers: { [SERVER_NAME]: { type: 'http', url: conn.url, headers } } });
        case 'claude-desktop':
            // 令牌由转接脚本从配置文件读取，不写进 Claude 的配置
            return json({ mcpServers: { [SERVER_NAME]: conn.bridge } });
        case 'other':
            return token;
    }
}

export class ConnectionDialog {
    private mask: HTMLElement | undefined;
    private conn: McpConnection | undefined;
    private client: Client = 'claude-code';
    private reveal = false;
    private opener: HTMLElement | null = null;
    private onKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            this.close();
        }
    };

    async open(opener?: HTMLElement) {
        if (this.mask) {
            return;
        }
        this.opener = opener || (document.activeElement as HTMLElement | null);
        try {
            this.conn = await mcpModel.getConnection();
        } catch (e) {
            console.error('获取连接配置失败', e);
            return;
        }
        if (!this.conn.token) {
            return;
        }
        this.reveal = false;
        // 点在网页视图上的事件传不到外壳；遮罩盖住整个窗口，并且不能是窗口拖动区，否则点不到
        this.mask = (
            <div class="mcp-dlg-mask" onclick={(e: MouseEvent) => {
                if (e.target === this.mask) {
                    this.close();
                }
            }}></div>
        ) as HTMLElement;
        this.mask.addEventListener('keydown', this.onKeydown);
        document.body.append(this.mask);
        this.render();
        (this.mask.querySelector('[role="tab"][aria-selected="true"]') as HTMLElement | null)?.focus();
    }

    close() {
        if (!this.mask) {
            return;
        }
        this.mask.remove();
        this.mask = undefined;
        this.conn = undefined;
        this.opener?.focus();
        this.opener = null;
    }

    private render() {
        const mask = this.mask;
        const conn = this.conn;
        if (!mask || !conn) {
            return;
        }
        const focusedTab = (document.activeElement as HTMLElement | null)?.dataset?.client;
        const tabs = CLIENTS.map(([id, label]) => {
            const tab = (
                <button role="tab" id={`mcp-client-${id}`} data-client={id} aria-selected={String(this.client === id)}
                    tabindex={this.client === id ? '0' : '-1'}
                    onclick={() => this.setClient(id)}
                    onkeydown={(e: KeyboardEvent) => this.tabKeydown(e)}>{label}</button>
            );
            return tab;
        });
        const hasToken = this.client !== 'claude-desktop';
        const footer = (
            <div class="mcp-dlg-foot">
                <span>{hasToken ? '配置里包含访问令牌，拿到令牌就能控制这个浏览器。' : '这份配置不含令牌，可以放心保存。'}</span>
            </div>
        ) as HTMLElement;
        if (hasToken) {
            footer.append(
                <button class="sp-btn" id="mcp-reveal-token" onclick={() => {
                    this.reveal = !this.reveal;
                    this.render();
                    (this.mask?.querySelector('#mcp-reveal-token') as HTMLElement | null)?.focus();
                }}>{this.reveal ? <IconEyeOff /> : <IconEye />}{this.reveal ? '隐藏令牌' : '显示令牌'}</button>
            );
        }
        mask.replaceChildren(
            <div class="mcp-dlg" role="dialog" aria-modal="true" aria-labelledby="mcp-dlg-title">
                <header>
                    <h2 id="mcp-dlg-title">连接 AI 客户端</h2>
                    <button class="icon-btn" title="关闭" aria-label="关闭" onclick={() => this.close()}><IconClose /></button>
                </header>
                <div class="mcp-dlg-sub">选择你用的客户端，按步骤把 MyBrowser 加进去。</div>
                <div class="mcp-dlg-tabs" role="tablist" aria-label="客户端">{tabs}</div>
                <div class="mcp-dlg-body" role="tabpanel" aria-labelledby={`mcp-client-${this.client}`}>{this.body(conn)}</div>
                {footer}
            </div>
        );
        if (focusedTab) {
            (mask.querySelector(`[data-client="${focusedTab}"]`) as HTMLElement | null)?.focus();
        }
    }

    private setClient(client: Client) {
        this.client = client;
        this.render();
    }

    /** 左右方向键在客户端之间切换 */
    private tabKeydown(e: KeyboardEvent) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
            return;
        }
        e.preventDefault();
        const index = CLIENTS.findIndex(([id]) => id === this.client);
        const next = (index + (e.key === 'ArrowRight' ? 1 : CLIENTS.length - 1)) % CLIENTS.length;
        this.client = CLIENTS[next][0];
        this.render();
        (this.mask?.querySelector(`[data-client="${this.client}"]`) as HTMLElement | null)?.focus();
    }

    /** 显示用的令牌：默认只露出前 4 位 */
    private shownToken(token: string) {
        return this.reveal ? token : `${token.slice(0, 4)}${'•'.repeat(12)}`;
    }

    private code(client: Client, conn: McpConnection, caption: string) {
        const text = snippet(client, conn, TOKEN_MARK);
        const parts = text.split(TOKEN_MARK);
        const pre = <pre></pre> as HTMLElement;
        parts.forEach((part, i) => {
            if (i > 0) {
                pre.append(<span class="tok">{this.shownToken(conn.token)}</span>);
            }
            pre.append(part);
        });
        return (
            <div class="mcp-code">
                <div class="mcp-code-cap">{caption}</div>
                {pre}
                {CopyButton({ text: () => snippet(client, conn, conn.token), label: '复制', class: 'mcp-copy', key: `copy-${client}` })}
            </div>
        );
    }

    private step(n: number, ...content: (string | Node)[]) {
        return <div class="mcp-step"><span class="mcp-step-n">{String(n)}</span><div>{content}</div></div>;
    }

    private note(icon: Node, ...content: (string | Node)[]) {
        return <div class="mcp-note">{icon}<span>{content}</span></div>;
    }

    private body(conn: McpConnection): Node[] {
        const c = (text: string) => <code>{text}</code>;
        switch (this.client) {
            case 'claude-code':
                return [
                    this.step(1, '在项目目录的终端里运行下面的命令。默认只对当前项目生效，加上 ', c('--scope user'), ' 对所有项目生效。'),
                    this.code('claude-code', conn, '终端'),
                    this.step(2, '在 Claude Code 里输入 ', c('/mcp'), '，看到 mybrowser 显示已连接即可。'),
                ];
            case 'cursor':
                return [
                    this.step(1, '打开 Cursor 的 MCP 配置文件：全局是 ', c('~/.cursor/mcp.json'), '，只给某个项目用就放在项目的 ', c('.cursor/mcp.json'), '。'),
                    this.step(2, '把下面的 ', c('mybrowser'), ' 合并进 ', c('mcpServers'), '，保存后在 Cursor 设置的 MCP 页面确认它已启用。'),
                    this.code('cursor', conn, 'mcp.json'),
                ];
            case 'vscode':
                return [
                    this.step(1, '在项目里新建或打开 ', c('.vscode/mcp.json'), '；想对所有项目生效，就在命令面板运行 ', c('MCP: Open User Configuration'), '。'),
                    this.step(2, '把下面的 ', c('mybrowser'), ' 合并进 ', c('servers'), '，保存后点文件里出现的“启动”按钮。'),
                    this.code('vscode', conn, 'mcp.json'),
                    this.note(<IconAlert />, '写在项目里的配置会跟着仓库走，令牌不要提交上去。可以改用 VS Code 的 ', c('inputs'), ' 在启动时输入令牌。'),
                ];
            case 'claude-desktop':
                return [
                    <p>Claude 桌面版只能启动本机程序（stdio），不能直接连网址。下面的配置让它通过 MyBrowser 自带的转接脚本连接服务；令牌由脚本从配置文件读取，不写在这里。</p>,
                    this.step(1, '在 Claude 桌面版里打开 设置 → 开发者 → 编辑配置，找到 ', c('claude_desktop_config.json'), '。'),
                    this.step(2, '把下面的 ', c('mybrowser'), ' 合并进 ', c('mcpServers'), '，保存后完全退出并重新打开 Claude。'),
                    this.code('claude-desktop', conn, 'claude_desktop_config.json'),
                    conn.portable
                        ? this.note(<IconAlert />, '你用的是便携版：它每次运行时解压到临时目录，Claude 没法用它启动转接脚本。这份配置改用本机的 Node.js（18 或更高版本）运行，脚本已复制到用户数据目录。没装 Node.js 的话，请改用安装版。')
                        : this.note(<IconInfo />, '路径按这台电脑上 MyBrowser 的实际位置填写。使用时 MyBrowser 要开着并开启 AI 接口；转接脚本不会替你启动浏览器。'),
                ];
            case 'other':
                return [
                    <p>自己写的程序或其他 MCP 客户端，按 Streamable HTTP 方式连接：</p>,
                    <dl class="mcp-kv">
                        <dt>地址</dt><dd>{c(conn.url)}</dd>
                        <dt>请求头</dt><dd><code>Authorization: Bearer <span class="tok">{this.shownToken(conn.token)}</span></code></dd>
                        <dt>会话</dt><dd>无会话模式，普通请求返回 JSON；订阅类请求返回 SSE。</dd>
                        <dt>限制</dt><dd>只接受本机连接；带 {c('Origin')} 头的请求一律拒绝，所以浏览器网页里不能直接调用。</dd>
                    </dl>,
                    this.code('other', conn, '令牌'),
                ];
        }
    }
}
