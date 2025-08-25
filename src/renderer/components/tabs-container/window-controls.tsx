import { AbstractComponent } from "@/jsx-runtime";
import { ToMaxBtnBg } from "./to-max-btn-bg";
import { ToRecoveryBtnBg } from "./to-recovery-btn-bg";

export class WindowControls extends AbstractComponent {
    constructor(props: any) {
        super(props);
        this.listen();
    }
    listen() {
        if (!window.electronAPI) {
            return;
        }
        window.electronAPI.on('window-maximized', () => {
            this.updateMaximizeButton(true);
        });
        window.electronAPI.on('window-unmaximized', () => {
            this.updateMaximizeButton(false);
        });
    }
    updateMaximizeButton(isMaximized: boolean) {
        const maximizeBtn = document.getElementById('maximize-btn');
        if (!maximizeBtn) {
            return;
        }
        const svg = maximizeBtn?.querySelector('svg');
        if (!svg) {
            return;
        }
        if (isMaximized) {
            maximizeBtn.replaceChild(<ToRecoveryBtnBg />, svg);
        } else {
            maximizeBtn.replaceChild(<ToMaxBtnBg />, svg);
        }
    }
    render() {
        return (
            <div class="window-controls">
                <button id="minimize-btn" class="window-control-btn minimize"
                onClick={() => window.electronAPI?.send('window-minimize')}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                    </svg>
                </button>
                <button id="maximize-btn" class="window-control-btn maximize"
                onClick={() => window.electronAPI?.send('window-maximize')}>
                    <ToMaxBtnBg />
                </button>
                <button id="close-btn" class="window-control-btn close"
                onClick={() => window.electronAPI?.send('window-close')}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                    </svg>
                </button>
            </div>
        )
    }
}
