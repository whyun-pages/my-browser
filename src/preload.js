// preload.js
window.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = `
    /* 滚动条样式 - 简约细致设计 */
    ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
    }

    ::-webkit-scrollbar-track {
        background: transparent;
    }

    ::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.2);
        border-radius: 10px;
        transition: all 0.2s ease;
    }

    ::-webkit-scrollbar-thumb:hover {
        background: rgba(0, 0, 0, 0.4);
    }

    ::-webkit-scrollbar-thumb:active {
        background: rgba(0, 0, 0, 0.6);
    }

    ::-webkit-scrollbar-corner {
        background: transparent;
    }
    `;
    document.head.appendChild(style);
});
  