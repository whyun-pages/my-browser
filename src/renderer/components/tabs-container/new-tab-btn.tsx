import { AbstractComponent } from "@/jsx-runtime";
import { globalModel } from "../../models/global.model";
import { IconPlus } from "../icons";

export class NewTabBtn extends AbstractComponent {
    render() {
        return (
            <button id="new-tab-btn" class="new-tab-btn" title="新建标签页" aria-label="新建标签页"
                onclick={() => globalModel.webviewHelper?.createNewTab()}>
                <IconPlus />
                <span class="new-tab-label">新建标签页</span>
            </button>
        )
    }
}
