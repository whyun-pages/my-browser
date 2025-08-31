import { AbstractComponent } from "@/jsx-runtime";
import { globalModel } from "../../models/global.model";

export class AddressBarContainer extends AbstractComponent {
    render() {
        return (
            <div class="address-bar-container">
                <input type="url" id="address-bar" placeholder="输入网址或搜索内容..." onkeypress={
                    (e: KeyboardEvent) => {
                        if (e.key === 'Enter') {
                            globalModel.webviewHelper?.navigate(
                                (document.getElementById('address-bar') as HTMLInputElement).value
                            );
                        }
                    }
                } />
            </div>
        )
    }
} 