// 界面一侧的 AI 接口（MCP）服务状态。开关状态只以主进程为准，这里不另存一份。

/** 主进程 McpHttpService.getStatus() 的结构 */
export interface McpServiceStatus {
    state: 'stopped' | 'running' | 'error';
    enabled: boolean;
    port: number;
    url: string;
    error?: { code: string; message: string };
}

export interface McpConnection {
    url: string;
    token: string;
    configPath: string;
    /** Claude 桌面版用的 stdio 转接命令 */
    bridge: { command: string; args: string[]; env?: Record<string, string> };
    /** 便携版：转接脚本由本机 Node.js 运行（见 mcp.ipc.js 的 bridgeCommand） */
    portable: boolean;
}

/** 界面显示用的状态：在主进程状态之上加上“正在启动 / 正在关闭” */
export type McpViewState = 'off' | 'starting' | 'stopping' | 'on' | 'error';

class McpModel {
    status: McpServiceStatus | undefined;
    configPath = '';
    /** 正在切换到的目标值；没有进行中的切换时为 undefined */
    private pending: boolean | undefined;
    private listeners = new Set<() => void>();
    private started = false;

    /** 第一次使用时向主进程取状态并订阅变化 */
    init() {
        if (this.started) {
            return;
        }
        this.started = true;
        window.electronAPI.on('mcp-status-changed', (status: McpServiceStatus) => {
            this.status = status;
            this.emit();
        });
        window.electronAPI.invoke<McpServiceStatus>('mcp-get-status').then((status) => {
            // 订阅之后才取，期间如果已经收到更新的推送，以推送为准
            if (!this.status) {
                this.status = status;
                this.emit();
            }
        }).catch((e) => console.error('读取 AI 接口状态失败', e));
        window.electronAPI.invoke<string>('mcp-get-config-path').then((file) => {
            this.configPath = file;
            this.emit();
        }).catch((e) => console.error('读取 AI 接口配置位置失败', e));
    }

    onChange(listener: () => void) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    private emit() {
        this.listeners.forEach((listener) => listener());
    }

    get viewState(): McpViewState {
        if (this.pending !== undefined) {
            return this.pending ? 'starting' : 'stopping';
        }
        switch (this.status?.state) {
            case 'running':
                return 'on';
            case 'error':
                return 'error';
            default:
                return 'off';
        }
    }

    /** 开关显示的值：用户想要的状态。启动失败时仍是开着的，和 mcp.json 里的 enabled 一致 */
    get switchOn(): boolean {
        if (this.pending !== undefined) {
            return this.pending;
        }
        return !!this.status?.enabled;
    }

    /** 令牌已经生成、可以给出连接配置 */
    get canConnect(): boolean {
        const status = this.status;
        return this.pending === undefined && !!status && status.enabled
            && (status.state === 'running' || status.state === 'error');
    }

    async setEnabled(enabled: boolean) {
        if (this.pending !== undefined) {
            return;
        }
        this.pending = enabled;
        this.emit();
        try {
            this.status = await window.electronAPI.invoke<McpServiceStatus>('mcp-set-enabled', enabled);
        } catch (e) {
            console.error('切换 AI 接口失败', e);
        } finally {
            this.pending = undefined;
            this.emit();
        }
    }

    getConnection() {
        return window.electronAPI.invoke<McpConnection>('mcp-get-connection');
    }

    showConfigFile() {
        return window.electronAPI.invoke<boolean>('mcp-show-config');
    }
}

export const mcpModel = new McpModel();
