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

export const IconGear = (props: IconProps) => (
    <Svg class={props.class}>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2" />
        <circle cx="12" cy="12" r="7" />
    </Svg>
);
export const IconSearch = (props: IconProps) => (
    <Svg class={props.class}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></Svg>
);
export const IconPalette = (props: IconProps) => (
    <Svg class={props.class}>
        <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.9 1.4-1.9-.5-1.2.3-2.4 1.6-2.4H17a3.5 3.5 0 0 0 3.5-3.5C20.5 7.4 16.7 3.5 12 3.5z" />
        <circle cx="7.8" cy="11" r="1" fill="currentColor" />
        <circle cx="10.5" cy="7.6" r="1" fill="currentColor" />
        <circle cx="14.8" cy="7.8" r="1" fill="currentColor" />
    </Svg>
);
export const IconGlobe = (props: IconProps) => (
    <Svg class={props.class}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5S9.7 5.9 12 3.5z" />
    </Svg>
);
/** 插头：AI 接口 */
export const IconPlug = (props: IconProps) => (
    <Svg class={props.class}><path d="M9 3v4M15 3v4M7 7h10v4a5 5 0 0 1-10 0z" /><path d="M12 16v5" /></Svg>
);
export const IconCopy = (props: IconProps) => (
    <Svg class={props.class}>
        <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
        <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
    </Svg>
);
export const IconCheck = (props: IconProps) => <Svg class={props.class}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const IconFolder = (props: IconProps) => (
    <Svg class={props.class}><path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" /></Svg>
);
export const IconAlert = (props: IconProps) => (
    <Svg class={props.class}><path d="M12 4l9 16H3z" /><path d="M12 10v4.5M12 17.3h.01" /></Svg>
);
export const IconEye = (props: IconProps) => (
    <Svg class={props.class}>
        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
        <circle cx="12" cy="12" r="2.8" />
    </Svg>
);
export const IconEyeOff = (props: IconProps) => (
    <Svg class={props.class}>
        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
        <circle cx="12" cy="12" r="2.8" />
        <path d="M4 4l16 16" />
    </Svg>
);
export const IconChevron = (props: IconProps) => <Svg class={props.class}><path d="M9 6l6 6-6 6" /></Svg>;
export const IconExternal = (props: IconProps) => (
    <Svg class={props.class}>
        <path d="M14 4.5h5.5V10M19.5 4.5L11 13M17 14v4.5A1.5 1.5 0 0 1 15.5 20h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7H10" />
    </Svg>
);