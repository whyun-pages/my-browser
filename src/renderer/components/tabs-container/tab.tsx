import { AbstractComponent } from "@/jsx-runtime";
import { globalModel } from "@/renderer/models/global.model";

interface TabComponentProps {
    id: number;
    title: string;
}

export class TabComponent extends AbstractComponent<TabComponentProps> {
    render(): JSX.Element {
        return (
            <div class="tab" data-tab-id={this.props.id} onClick={
                (event: MouseEvent) => {
                    const target = event.target as HTMLElement;
                    if (target?.classList?.contains('tab-close')) {
                        return;
                    }
                    globalModel.webviewHelper?.switchToTab(this.props.id)
                }
            }>
                <span class="tab-title">{this.props.title}</span>
                <button class="tab-close" onClick={
                    () => globalModel.webviewHelper?.closeTab(this.props.id)
                }>×</button>
            </div>
        )
    }
}

export function TabComponentFactory(props: TabComponentProps): JSX.Element {
    return <TabComponent {...props} />;
}