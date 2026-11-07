import { AbstractComponent } from "@/jsx-runtime";
import { globalModel } from "@/renderer/models/global.model";
import { IconClose } from "../icons";

// 收藏夹为空时的占位提示
export function BookmarksEmpty() {
    return <li class="bookmarks-empty">还没有收藏。打开一个页面，点地址栏里的星标就能收藏。</li>;
}

/**
 * 收藏夹。经典布局下是右侧抽屉（加上 open 类才滑出来），侧栏布局下是侧栏里常驻的一段。
 * 列表内容由 BookmarkHelper 填充。
 */
export class BookmarksSidebar extends AbstractComponent {
    render() {
        return (
            <aside id="bookmarks-sidebar" class="bookmarks-sidebar" aria-label="收藏夹">
                <div class="sidebar-header">
                    <h3>收藏夹</h3>
                    <button id="close-sidebar" class="icon-btn only-classic" title="关闭收藏夹" aria-label="关闭收藏夹"
                        onClick={() => globalModel.bookmarkHelper?.hide()}><IconClose /></button>
                </div>
                <ul id="bookmarks-list" class="bookmarks-list"></ul>
            </aside>
        );
    }
}
