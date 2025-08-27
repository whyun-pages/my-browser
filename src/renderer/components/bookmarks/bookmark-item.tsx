import { AbstractComponent } from "@/jsx-runtime";

export interface BookmarkItemProps {
    url: string;
    title: string;
    id: number;
}
export class BookmarkItem<T extends BookmarkItemProps> extends AbstractComponent<T> {
    render() {
        return (
            <div class="bookmark-item">
                <div class="bookmark-info" data-url="{this.props.url}">
                    <div class="bookmark-title">{this.props.title}</div>
                    <div class="bookmark-url">{this.props.url}</div>
                </div>
                <button class="bookmark-remove" data-id="{this.props.id}">删除</button>
            </div>
        );
    }
}