import { AbstractComponent } from "@/jsx-runtime";
import { Brand } from "../brand";
import { BookmarksSidebar } from "../bookmarks/bookmarks-sidebar";
import { NewTabBtn } from "./new-tab-btn";

/**
 * 标签页、新建按钮和收藏夹。
 * 经典布局下这个容器不产生盒子（display: contents），子元素直接排进窗口网格；
 * 侧栏布局下它就是左侧的整列。
 */
export class TabsContainer extends AbstractComponent {
    render() {
        return (
            <nav class="rail" aria-label="标签页和收藏夹">
                <Brand />
                <div class="rail-label only-rail">标签页</div>
                <div id="tabs" class="tabs" role="tablist" aria-label="标签页"></div>
                <NewTabBtn />
                <BookmarksSidebar />
            </nav>
        )
    }
}
