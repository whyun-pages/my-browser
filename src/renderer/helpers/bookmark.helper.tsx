import { BookmarkItem, type BookmarkItemBaseProps, type BookmarkItemProps } from "../components/bookmarks/bookmark-item";
import { BookmarksEmpty } from "../components/bookmarks/bookmarks-sidebar";
import { globalModel } from "../models/global.model";

export class BookmarkHelper {
    private bookmarkUrl2IdMap: Map<string, number> = new Map();
    public constructor() {
        this.init();
    }
    private get bookmarksSidebar(): HTMLElement | null {
        return document.getElementById('bookmarks-sidebar');
    }
    private get bookmarksList(): HTMLElement | null {
        return document.getElementById('bookmarks-list');
    }
    private init() {
        window.electronAPI.invoke<BookmarkItemProps[]>('get-bookmarks').then((bookmarks: BookmarkItemProps[]) => {
            bookmarks.forEach(bookmark => {
                this.bookmarksList?.append(
                    <BookmarkItem url={bookmark.url} title={bookmark.title} id={bookmark.id} />
                );
                this.bookmarkUrl2IdMap.set(bookmark.url, bookmark.id);
            });
            this.syncEmpty();
            // 书签是异步加载的，加载完再把当前页面的星标状态补上
            globalModel.webviewHelper?.refreshBookmarkState();
        }).catch(error => {
            console.error('加载书签失败', error);
        });
    }
    // 列表为空时显示占位提示
    private syncEmpty() {
        const list = this.bookmarksList;
        if (!list) {
            return;
        }
        const empty = list.querySelector('.bookmarks-empty');
        if (list.querySelector('.bookmark-item')) {
            empty?.remove();
        } else if (!empty) {
            list.append(<BookmarksEmpty />);
        }
    }
    // 收藏夹抽屉只在经典布局下需要开合；侧栏布局里收藏夹常驻，open 类不起作用
    public show() {
        this.bookmarksSidebar?.classList.add('open');
    }
    public hide() {
        this.bookmarksSidebar?.classList.remove('open');
    }
    public toggle() {
        this.bookmarksSidebar?.classList.toggle('open');
    }
    public add(bookmark: BookmarkItemBaseProps) {
        window.electronAPI.invoke<BookmarkItemProps>('add-bookmark', bookmark)
        .then((bookmark: BookmarkItemProps) => {
            this.bookmarksList?.append(
                <BookmarkItem url={bookmark.url} title={bookmark.title} id={bookmark.id} />
            );
            this.bookmarkUrl2IdMap.set(bookmark.url, bookmark.id);
            this.syncEmpty();
        })
        .catch(error => {
            console.error('添加书签失败', error);
        });
    }
    public remove(id: number, url: string) {
        window.electronAPI.invoke('remove-bookmark', id).catch(error => {
            console.error('删除书签失败', error);
        });
        this.bookmarksSidebar?.querySelector(`[data-id="${id}"]`)?.remove();
        this.bookmarkUrl2IdMap.delete(url);
        this.syncEmpty();
        // 从列表里删除的可能正是当前页面，星标要跟着更新
        globalModel.webviewHelper?.refreshBookmarkState();
    }
    public isBookmarked(url: string) {
        return this.bookmarkUrl2IdMap.has(url);
    }
    public getBookmarkId(url: string) {
        return this.bookmarkUrl2IdMap.get(url);
    }
}
