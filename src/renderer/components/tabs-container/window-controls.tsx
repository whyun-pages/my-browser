import { AbstractComponent } from "@/jsx-runtime";

export class WindowControls extends AbstractComponent {
    render() {
        return (
            <div class="window-controls">
                <button id="minimize-btn" class="window-control-btn minimize">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                    </svg>
                </button>
                <button id="maximize-btn" class="window-control-btn maximize">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <rect x="2" y="2" width="8" height="8" stroke="currentColor" stroke-width="1.5" fill="none" />
                    </svg>
                </button>
                <button id="close-btn" class="window-control-btn close">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                    </svg>
                </button>
            </div>
        )
    }
}
