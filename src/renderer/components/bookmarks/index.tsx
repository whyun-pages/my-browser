import { AbstractComponent } from "@/jsx-runtime";

export class Bookmarks extends AbstractComponent {
    render() {
        return (
            <div id="bookmarks-sidebar" class="bookmarks-sidebar hidden">
            <div class="sidebar-header">
                <h3>收藏夹</h3>
                <button id="close-sidebar" class="close-btn">×</button>
            </div>
            <div id="bookmarks-list" class="bookmarks-list">
                {/* <!-- 书签列表将在这里动态加载 --> */}
            </div>
        </div>
        )
    }
}