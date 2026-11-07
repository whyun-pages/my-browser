import { AbstractComponent } from "@/jsx-runtime";
import { globalModel } from "@/renderer/models/global.model";
import { IconBack, IconForward, IconHome, IconReload } from "../icons";

export class NavButtons extends AbstractComponent {
    render() {
        return (
            <div class="nav-buttons">
                <button id="back-btn" class="icon-btn" title="后退" aria-label="后退"
                    onclick={() => globalModel.webviewHelper?.goBack()}><IconBack /></button>
                <button id="forward-btn" class="icon-btn" title="前进" aria-label="前进"
                    onclick={() => globalModel.webviewHelper?.goForward()}><IconForward /></button>
                <button id="refresh-btn" class="icon-btn" title="刷新" aria-label="刷新"
                    onclick={() => globalModel.webviewHelper?.refresh()}><IconReload /></button>
                <button id="home-btn" class="icon-btn" title="主页" aria-label="主页"
                    onclick={() => globalModel.webviewHelper?.goHome()}><IconHome /></button>
            </div>
        )
    }
}
