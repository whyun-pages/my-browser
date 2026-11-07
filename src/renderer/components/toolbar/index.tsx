import { AbstractComponent } from "@/jsx-runtime";
import { globalModel } from "@/renderer/models/global.model";
import { IconBook } from "../icons";
import { WindowControls } from "../tabs-container/window-controls";
import { NavButtons } from "./nav-buttons";
import { AddressBarContainer } from "./address-bar-container";

/**
 * 工具栏、窗口拖动区和窗口控制按钮。
 * 经典布局下这个容器不产生盒子（display: contents）：工具栏在第二行，拖动区和窗口按钮在标签栏右侧；
 * 侧栏布局下它是页面上方的一整行。
 */
export class Toolbar extends AbstractComponent {
    render() {
        return (
            <header class="top">
                <div class="toolbar">
                    <NavButtons />
                    <AddressBarContainer />
                    <button id="bookmarks-toggle-btn" class="icon-btn only-classic" title="收藏夹" aria-label="收藏夹"
                        onclick={() => globalModel.bookmarkHelper?.toggle()}>
                        <IconBook />
                    </button>
                </div>
                <div class="drag"></div>
                <WindowControls />
            </header>
        )
    }
}
