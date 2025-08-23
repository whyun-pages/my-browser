import { AbstractComponent } from "@/jsx-runtime";
import { NewTabBtn } from "./new-tab-btn";
import { WindowControls } from "./window-controls";

export class TabsContainer extends AbstractComponent {
    render() {
        return (
            <div class="tabs-container">
                <NewTabBtn />
                <WindowControls />
            </div>
        )
    }
}