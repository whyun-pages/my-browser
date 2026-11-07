import { AbstractComponent } from "@/jsx-runtime";
import { globalModel } from "@/renderer/models/global.model";
import { IconClose } from "../icons";

interface TabComponentProps {
    id: number;
    title: string;
}

export class TabComponent extends AbstractComponent<TabComponentProps> {
    render(): JSX.Element {
        return (
            <div class="tab" data-tab-id={this.props.id} role="tab" title={this.props.title} onClick={
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
