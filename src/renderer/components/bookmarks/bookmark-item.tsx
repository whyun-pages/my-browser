import { AbstractComponent } from "@/jsx-runtime";
import { paintFavicon, shortUrl } from "@/renderer/helpers/site-color";
import { globalModel } from "@/renderer/models/global.model";
import { IconClose } from "../icons";

export interface BookmarkItemBaseProps {
    url: string;
    title: string;
}
export interface BookmarkItemProps extends BookmarkItemBaseProps {
    id: number;
}
export class BookmarkItem<T extends BookmarkItemProps> extends AbstractComponent<T> {
    render() {
        const { id, url, title } = this.props;
        const favicon = <span class="fav"></span> as HTMLElement;
        paintFavicon(favicon, { url, title });
        return (
            <li class="bookmark-item" data-id={id}>
                <button class="bookmark-info" title={url} onClick={
                    () => globalModel.webviewHelper?.createNewTab(url)
                }>
                    {favicon}
                    <span class="bookmark-title">{title}</span>
                    <span class="bookmark-url">{shortUrl(url)}</span>
                </button>
                <button class="bookmark-remove" title="取消收藏" aria-label="取消收藏" onClick={
                    () => globalModel.bookmarkHelper?.remove(id, url)
                }><IconClose /></button>
            </li>
        );
    }
}
