import { AbstractComponent } from "@/jsx-runtime";
import { NavButtons } from "./nav-buttons";
import { ActionButtons } from "./action-buttons";
import { AddressBarContainer } from "./address-bar-container";

export class Toolbar extends AbstractComponent {
    render() {
        return (
            <div class="toolbar">
                <NavButtons />
                <AddressBarContainer />
                <ActionButtons />
            </div>
        )
    }
}