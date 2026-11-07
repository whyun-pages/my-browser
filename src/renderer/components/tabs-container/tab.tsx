import { AbstractComponent } from "@/jsx-runtime";
import { globalModel } from "@/renderer/models/global.model";
import { IconClose, IconGear } from "../icons";

interface TabComponentProps {
    id: number;
    title: string;
    /** 由 AI 接口打开的标签页显示“AI”标记 */
    aiOpened?: boolean;
    /** 设置页：用齿轮图标，不画站点圆点 */
    settings?: boolean;
}

export class TabComponent extends AbstractComponent<TabComponentProps> {
    render(): JSX.Element {
        const tab = this.renderTab() as HTMLElement;
        if (this.props.settings) {
            tab.classList.add('settings-tab');
            tab.querySelector('.fav')?.replaceWith(<span class="fav-ic"><IconGear /></span>);
        }
        if (this.props.aiOpened) {
            // 这里的 JSX 运行时会把 null 子节点渲染成文字，所以标记单独插入
            const badge = <span class="tab-ai-badge" title="由 AI 通过 MCP 接口打开">AI</span>;
            tab.insertBefore(badge, tab.querySelector('.tab-close'));
        }
        return tab;
    }

    private renderTab(): JSX.Element {
        return (
            <div class={this.props.aiOpened ? "tab ai-tab" : "tab"} data-tab-id={this.props.id} role="tab" title={this.props.title} onClick={
                (event: MouseEvent) => {
                    // 关闭按钮里是图标，点击目标可能是 svg，所以要向上找
                    if ((event.target as Element | null)?.closest?.('.tab-close')) {
                        return;
                    }
                    globalModel.webviewHelper?.switchToTab(this.props.id)
                }
            }>
                <span class="fav tab-favicon"></span>
                <span class="tab-title">{this.props.title}</span>
                <button class="tab-close" title="关闭标签页" aria-label="关闭标签页" onClick={
                    () => globalModel.webviewHelper?.closeTab(this.props.id)
                }><IconClose /></button>
            </div>
        )
    }
}

export function TabComponentFactory(props: TabComponentProps): JSX.Element {
    return <TabComponent {...props} />;
}
