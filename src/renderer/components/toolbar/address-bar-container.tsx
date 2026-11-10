import { AbstractComponent } from "@/jsx-runtime";
import { globalModel } from "../../models/global.model";
import { IconGear, IconLock, IconStar, IconSwap } from "../icons";

export class AddressBarContainer extends AbstractComponent {
    render() {
        return (
            <div class="address-bar-container">
                {/* 普通浏览器放小锁的位置：显示当前标签页是否放行跨域；设置页显示“MyBrowser”。文字和样式由 WebviewHelper 更新 */}
                <span id="cors-chip" class="cors-chip">
                    <IconSwap class="cors-on-icon" />
                    <IconLock class="cors-off-icon" />
                    <IconGear class="cors-internal-icon" />
                    <span id="cors-chip-text"></span>
                </span>
                <input type="text" id="address-bar" spellcheck="false" autocomplete="off"
                    placeholder="输入网址或搜索内容" aria-label="地址栏" onkeydown={
                    (e: KeyboardEvent) => {
                        // 输入法组合过程中的回车是在选字，不是要前往
                        if (e.key === 'Enter' && !e.isComposing) {
                            const input = e.target as HTMLInputElement;
                            globalModel.webviewHelper?.navigate(input.value);
                            input.blur();
                        }
                    }
                } />
                <button id="bookmark-btn" class="icon-btn star-btn" title="收藏这个页面" aria-label="收藏这个页面"
                    onclick={() => globalModel.webviewHelper?.toggleBookmark()}>
                    <IconStar />
                </button>
            </div>
        )
    }
}
