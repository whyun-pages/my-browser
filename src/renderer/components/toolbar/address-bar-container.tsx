import { AbstractComponent } from "@/jsx-runtime";

export class AddressBarContainer extends AbstractComponent {
    render() {
        return (
            <div class="address-bar-container">
                <input type="url" id="address-bar" placeholder="输入网址或搜索内容..." />
            </div>
        )
    }
} 