import { AbstractComponent } from "@/jsx-runtime";
import { BookmarkItem } from "./bookmark-item";
import type { BookmarkItemProps } from "./bookmark-item";
import { globalModel } from "@/renderer/models/global.model";
export interface BookmarksSidebarProps {
    bookmarks: BookmarkItemProps[];
}
export class BookmarksSidebar<T extends BookmarksSidebarProps> extends AbstractComponent<T> {
    render() {
        return (
            <div id="bookmarks-sidebar" class="bookmarks-sidebar hidden">
            <div class="sidebar-header">
                <h3>收藏夹</h3>
                <button id="close-sidebar" class="close-btn" onClick={() => globalModel.bookmarkHelper?.hide()}>×</button>
            </div>
            <div id="bookmarks-list" class="bookmarks-list">
                {this.props.bookmarks.length > 0 ? this.props.bookmarks.map((bookmark) => (
                    <BookmarkItem url={bookmark.url} title={bookmark.title} id={bookmark.id} />
                )) : <div style="text-align: center; color: #666; padding: 20px;">暂无收藏</div>}
            </div>
        </div>
        );
    }
}
