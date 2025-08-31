import { BookmarkItem, type BookmarkItemBaseProps, type BookmarkItemProps } from "../components/bookmarks/bookmark-item";
import { BookmarksSidebar } from "../components/bookmarks/bookmarks-sidebar";

export class BookmarkHelper {
    private bookmarkUrl2IdMap: Map<string, number> = new Map();
    public constructor() {
        this.init();
    }
    private get bookmarksSidebar(): HTMLElement | undefined {
        return document.getElementById('bookmarks-sidebar') as HTMLElement | undefined;
    }
    private init() {
        window.electronAPI.invoke<BookmarkItemProps[]>('get-bookmarks').then((bookmarks: BookmarkItemProps[]) => {
            document.body.append(<BookmarksSidebar bookmarks={bookmarks} />);
            bookmarks.forEach(bookmark => {
                this.bookmarkUrl2IdMap.set(bookmark.url, bookmark.id);
            });
        }).catch(error => {
            console.error('加载书签失败', error);
        });
    }
    public show() {
        if (this.bookmarksSidebar) {
            this.bookmarksSidebar.classList.remove('hidden');
        }
    }
    public hide() {
        this.bookmarksSidebar?.classList.add('hidden');
    }
    public add(bookmark: BookmarkItemBaseProps) {
        window.electronAPI.invoke<BookmarkItemProps>('add-bookmark', bookmark)
        .then((bookmark: BookmarkItemProps) => {
            this.bookmarksSidebar?.append(
                <BookmarkItem url={bookmark.url} title={bookmark.title} id={bookmark.id} />
            );
            this.bookmarkUrl2IdMap.set(bookmark.url, bookmark.id);
        })
        .catch(error => {
            console.error('添加书签失败', error);
        });
    }
    public remove(id: number, url: string) {
        window.electronAPI.invoke('remove-bookmark', id).catch(error => {
            console.error('删除书签失败', error);
        });
        const bookmarkItem = this.bookmarksSidebar?.querySelector(`[data-id="${id}"]`);
        if (bookmarkItem) {
            bookmarkItem.remove();
        }
        this.bookmarkUrl2IdMap.delete(url);
    }
    public isBookmarked(url: string) {
        return this.bookmarkUrl2IdMap.has(url);
    }
    public getBookmarkId(url: string) {
        return this.bookmarkUrl2IdMap.get(url);
    }
}