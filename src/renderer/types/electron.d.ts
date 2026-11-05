// 引入 electron 自带的类型定义（提供全局 Electron 命名空间，如 Electron.WebviewTag）
/// <reference types="electron" />
declare global {
    interface Window {
        electronAPI: {
            send: (channel: string, data?: any) => void;
            on: (channel: string, func: Function) => void;
            invoke: <T>(channel: string, ...args: any[]) => Promise<T>;
        };
    }
}

export {};
