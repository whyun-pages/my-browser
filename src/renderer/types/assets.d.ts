// 由 Vite 处理的静态资源：导入得到的是构建后的地址
declare module '*.png' {
    const src: string;
    export default src;
}
