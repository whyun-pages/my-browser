import { AbstractComponent } from "@/jsx-runtime";
import { globalModel } from "../../models/global.model";

export class NewTabBtn extends AbstractComponent {
    debug(msg: string) {
        console.log(msg);
    }
    render() {
        return (
            <div id="tabs" class="tabs">
                <button id="new-tab-btn" class="new-tab-btn" title="新建标签页" onclick={() => {
                    this.debug("新建标签页");
                    globalModel.webviewHelper?.createNewTab();
                }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"/>
                        <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                </button>
            </div>
        )
    }
}