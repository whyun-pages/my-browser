import { AbstractComponent } from "@/jsx-runtime";

export class Tab extends AbstractComponent {
    render() {
        return (
            <div class="tab" data-tab-id={this.props.id}>
                <span class="tab-title">{this.props.title}</span>
                <button class="tab-close" data-tab-id={this.props.id}>×</button>
            </div>
        )
    }
}