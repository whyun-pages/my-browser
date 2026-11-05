// 七种颜色取自 logo 的彩虹漩涡。同一个站点永远是同一种颜色。
const HUES = ['#E8382D', '#F58A1F', '#EDBE12', '#63B446', '#2FA4DC', '#5E55A6', '#EE5C9A'];
// 黄色底上用深色字，其余用白字
const DARK_TEXT_INDEX = 2;

function hostOf(url: string) {
    try {
        return new URL(url).host;
    } catch {
        return '';
    }
}

function hueIndex(url: string) {
    let hash = 0;
    for (const char of hostOf(url)) {
        hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }
    return hash % HUES.length;
}

/** 站点对应的颜色 */
export function siteColor(url: string) {
    return HUES[hueIndex(url)];
}

export function isSameSite(urlA: string, urlB: string) {
    return hostOf(urlA) === hostOf(urlB);
}

/** 去掉协议和末尾斜杠，用于展示 */
export function shortUrl(url: string) {
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export interface FaviconOptions {
    url: string;
    title: string;
    /** 网页提供的图标地址；没有或加载失败时显示彩色圆点 */
    favicon?: string;
    loading?: boolean;
}

/** 把站点图标画到一个 .fav 元素里：加载中是转圈，其次是真实图标，最后是带首字的彩色圆点 */
export function paintFavicon(el: HTMLElement, options: FaviconOptions) {
    const index = hueIndex(options.url);
    el.style.setProperty('--hue', HUES[index]);
    el.style.setProperty('--fg', index === DARK_TEXT_INDEX ? '#1D2433' : '#fff');
    el.classList.toggle('spin', !!options.loading);
    el.classList.remove('has-img');
    el.textContent = '';
    if (options.loading) {
        return;
    }
    const paintDot = () => {
        el.classList.remove('has-img');
        el.textContent = options.title.trim().charAt(0) || '?';
    };
    if (!options.favicon) {
        paintDot();
        return;
    }
    const img = document.createElement('img');
    img.alt = '';
    img.addEventListener('error', paintDot);
    img.src = options.favicon;
    el.classList.add('has-img');
    el.append(img);
}
