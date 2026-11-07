export type Layout = 'classic' | 'rail';
export type Theme = 'light' | 'dark';
/** 用户选择的主题；system 表示跟随系统，不保存具体值 */
export type ThemePreference = Theme | 'system';

const LAYOUT_KEY = 'layout';
const THEME_KEY = 'theme';
const CROSS_ORIGIN_KEY = 'allowCrossOrigin';
const RAIL_COLLAPSED_KEY = 'railCollapsed';

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

/**
 * 界面设置，保存在 localStorage，并负责把结果写到 <html> 上：
 * data-layout（布局）、data-rail（侧栏展开/收起）、dark-theme 类（主题）。
 * 菜单和设置页都能改设置，修改后通过 onChange 通知对方刷新显示。
 */
class SettingsModel {
    private listeners = new Set<() => void>();

    constructor() {
        // 跟随系统时，系统切换深浅色要立即生效
        darkQuery.addEventListener('change', () => {
            if (this.themePreference === 'system') {
                this.apply();
                this.emit();
            }
        });
    }

    /** 订阅设置变化，返回取消订阅的函数 */
    public onChange(listener: () => void) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    private emit() {
        this.listeners.forEach((listener) => listener());
    }

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
        this.emit();
    }

    /** 用户选择的主题。没有保存过时跟随系统 */
    public get themePreference(): ThemePreference {
        const saved = localStorage.getItem(THEME_KEY);
        return saved === 'dark' || saved === 'light' ? saved : 'system';
    }
    public set themePreference(preference: ThemePreference) {
        if (preference === 'system') {
            localStorage.removeItem(THEME_KEY);
        } else {
            localStorage.setItem(THEME_KEY, preference);
        }
        this.apply();
        this.emit();
    }
    /** 实际生效的主题 */
    public get theme(): Theme {
        const preference = this.themePreference;
        if (preference !== 'system') {
            return preference;
        }
        return darkQuery.matches ? 'dark' : 'light';
    }

    /** 是否允许跨域：默认允许。只在创建标签页时读取，所以修改后只影响之后新开的标签页 */
    public get allowCrossOrigin(): boolean {
        return localStorage.getItem(CROSS_ORIGIN_KEY) !== '0';
    }
    public set allowCrossOrigin(allow: boolean) {
        localStorage.setItem(CROSS_ORIGIN_KEY, allow ? '1' : '0');
        this.emit();
    }

    public get railCollapsed(): boolean {
        return localStorage.getItem(RAIL_COLLAPSED_KEY) === '1';
    }
    public set railCollapsed(collapsed: boolean) {
        localStorage.setItem(RAIL_COLLAPSED_KEY, collapsed ? '1' : '0');
        this.apply();
        this.emit();
    }

    public apply() {
        const root = document.documentElement;
        root.dataset.layout = this.layout;
        root.dataset.rail = this.railCollapsed ? 'slim' : 'open';
        root.classList.toggle('dark-theme', this.theme === 'dark');
    }
}

export const settings = new SettingsModel();
