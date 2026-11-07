// 复制按钮：点击后图标短暂变成对勾
import { IconCheck, IconCopy } from "../icons";

/** 写入剪贴板。外壳页面在应用获得焦点时可以直接写；失败时退回到旧接口 */
export async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.append(area);
        area.select();
        const ok = document.execCommand('copy');
        area.remove();
        return ok;
    }
}

/** 复制按钮：点击后图标短暂变成对勾 */
export function CopyButton(props: { text: () => string; label: string; key?: string; class?: string; disabled?: boolean }) {
    const button = (
        <button class={`icon-btn sp-icon-btn ${props.class || ''}`} title={props.label} aria-label={props.label}
            data-key={props.key || ''} onclick={async () => {
                const ok = await copyText(props.text());
                button.replaceChildren(ok ? <IconCheck /> : <IconCopy />);
                button.title = ok ? '已复制' : '复制失败';
                setTimeout(() => {
                    button.replaceChildren(<IconCopy />);
                    button.title = props.label;
                }, 1500);
            }}>
            <IconCopy />
        </button>
    ) as HTMLButtonElement;
    button.disabled = !!props.disabled;
    return button;
}
