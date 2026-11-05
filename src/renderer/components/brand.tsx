import { AbstractComponent } from "@/jsx-runtime";
import logoUrl from "@/renderer/assets/logo.png";

/** 侧栏顶部的 logo 和名称，只在侧栏布局显示；同时也是窗口的拖动区 */
export class Brand extends AbstractComponent {
    render() {
        return (
            <div class="brand only-rail">
                <img class="brand-logo" src={logoUrl} alt="" />
                <span class="brand-name">MyBrowser</span>
            </div>
        );
    }
}
