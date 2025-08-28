import { AbstractComponent } from "@/jsx-runtime";
import { globalModel } from "@/renderer/models/global.model";
export interface BookmarkItemBaseProps {
    url: string;
    title: string;
}
export interface BookmarkItemProps extends BookmarkItemBaseProps {
    id: number;
}
export class BookmarkItem<T extends BookmarkItemProps> extends AbstractComponent<T> {
    render() {
        return (
            <div class="bookmark-item" data-id="{this.props.id}">
                <div class="bookmark-info" onClick={
                    () => globalModel.webviewHelper?.createNewTab(this.props.url)
                }>
                    <div class="bookmark-title">{this.props.title}</div>
                    <div class="bookmark-url">{this.props.url}</div>
                </div>
                <button class="bookmark-remove" onClick={
                    () => globalModel.bookmarkHelper?.remove(this.props.id, this.props.url)
                }>删除</button>
            </div>
        );
    }
}