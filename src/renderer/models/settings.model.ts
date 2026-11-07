export type Layout = 'classic' | 'rail';
export type Theme = 'light' | 'dark';

const LAYOUT_KEY = 'layout';
const THEME_KEY = 'theme';
const CROSS_ORIGIN_KEY = 'allowCrossOrigin';
const RAIL_COLLAPSED_KEY = 'railCollapsed';

/**
 * 界面设置，保存在 localStorage，并负责把结果写到 <html> 上：
 * data-layout（布局）、data-rail（侧栏展开/收起）、dark-theme 类（主题）。
 */
class SettingsModel {
    public get layout(): Layout {
        return localStorage.getItem(LAYOUT_KEY) === 'rail' ? 'rail' : 'classic';
    }
    public set layout(layout: Layout) {
        localStorage.setItem(LAYOUT_KEY, layout);
        // 换布局的这一帧不要过渡动画，否则抽屉和面板会“飞”到另一个角
        const root = document.documentElement;
        root.classList.add('no-transition');
        this.apply();
        requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('no-transition')));
    }

    /** 没有保存过主题时跟随系统偏好 */
    public get theme(): Theme {
        const saved = localStorage.getItem(THEME_KEY);
        if (saved === 'dark' || saved === 'light') {
            return saved;
        }
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    public set theme(theme: Theme) {
        localStorage.setItem(THEME_KEY, theme);
        this.apply();
    }

    /** 是否允许跨域：默认允许。只在创建标签页时读取，所以修改后只影响之后新开的标签页 */
    public get allowCrossOrigin(): boolean {
        return localStorage.getItem(CROSS_ORIGIN_KEY) !== '0';
    }
    public set allowCrossOrigin(allow: boolean) {
        localStorage.setItem(CROSS_ORIGIN_KEY, allow ? '1' : '0');
    }

    public get railCollapsed(): boolean {
        return localStorage.getItem(RAIL_COLLAPSED_KEY) === '1';
    }
    public set railCollapsed(collapsed: boolean) {
        localStorage.setItem(RAIL_COLLAPSED_KEY, collapsed ? '1' : '0');
        this.apply();
    }

    public apply() {
        const root = document.documentElement;
        root.dataset.layout = this.layout;
        root.dataset.rail = this.railCollapsed ? 'slim' : 'open';
        root.classList.toggle('dark-theme', this.theme === 'dark');
    }
}

export const settings = new SettingsModel();
