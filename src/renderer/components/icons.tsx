// 界面用到的线条图标，统一 24×24 画布，颜色跟随文字（currentColor）
interface IconProps {
    class?: string;
    children?: any;
}

function Svg(props: IconProps) {
    return (
        <svg class={props.class ? `ic ${props.class}` : 'ic'} viewBox="0 0 24 24" aria-hidden="true">
            {props.children}
        </svg>
    );
}

export const IconBack = (props: IconProps) => <Svg class={props.class}><path d="M15 18l-6-6 6-6" /></Svg>;
export const IconForward = (props: IconProps) => <Svg class={props.class}><path d="M9 18l6-6-6-6" /></Svg>;
export const IconReload = (props: IconProps) => (
    <Svg class={props.class}><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></Svg>
);
export const IconHome = (props: IconProps) => (
    <Svg class={props.class}><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" /></Svg>
);
export const IconStar = (props: IconProps) => (
    <Svg class={props.class}><path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.2-4.1 5.8-.8z" /></Svg>
);
export const IconPlus = (props: IconProps) => <Svg class={props.class}><path d="M12 5v14M5 12h14" /></Svg>;
export const IconClose = (props: IconProps) => <Svg class={props.class}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const IconMore = (props: IconProps) => (
    <Svg class={props.class}>
        <circle cx="5" cy="12" r="1.3" fill="currentColor" />
        <circle cx="12" cy="12" r="1.3" fill="currentColor" />
        <circle cx="19" cy="12" r="1.3" fill="currentColor" />
    </Svg>
);
/** 两个方向相反的箭头：跨域已放行 */
export const IconSwap = (props: IconProps) => (
    <Svg class={props.class}><path d="M4 8h13M14 5l3 3-3 3M20 16H7M10 13l-3 3 3 3" /></Svg>
);
export const IconLock = (props: IconProps) => (
    <Svg class={props.class}><rect x="5.5" y="10.5" width="13" height="9" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></Svg>
);
export const IconSidebar = (props: IconProps) => (
    <Svg class={props.class}><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9 4v16" /></Svg>
);
export const IconCode = (props: IconProps) => (
    <Svg class={props.class}><path d="M8 9l-3 3 3 3M16 9l3 3-3 3M13.5 6.5l-3 11" /></Svg>
);
export const IconInfo = (props: IconProps) => (
    <Svg class={props.class}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></Svg>
);
export const IconBook = (props: IconProps) => <Svg class={props.class}><path d="M6 4h12v16l-6-4-6 4z" /></Svg>;
export const IconSliders = (props: IconProps) => (
    <Svg class={props.class}>
        <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="8" cy="17" r="2" />
    </Svg>
);
