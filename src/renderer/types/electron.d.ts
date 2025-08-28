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
