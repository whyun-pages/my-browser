import { AbstractComponent } from "@/jsx-runtime";

interface TabComponentProps {
    id: number;
    title: string;
}

export class TabComponent extends AbstractComponent<TabComponentProps> {
    render(): JSX.Element {
        return (
            <div class="tab" data-tab-id={this.props.id}>
                <span class="tab-title">{this.props.title}</span>
                <button class="tab-close" data-tab-id={this.props.id}>×</button>
            </div>
        )
    }
}

export function TabComponentFactory(props: TabComponentProps): JSX.Element {
    return <TabComponent {...props} />;
}