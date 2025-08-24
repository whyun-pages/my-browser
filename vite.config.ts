import { defineConfig } from "vite";
import { viteStaticCopy } from 'vite-plugin-static-copy'


export default defineConfig({
  root: "src",
  base: './',  // 👈 使用相对路径
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  optimizeDeps: {
    exclude: ["electron"], // 不要依赖预构建 electron
  },
  build: {
    minify: false,  // 不压缩
    target: 'esnext', // 可选，设置更高的语法支持
    rollupOptions: {
      external: ["electron"], // 不要打包 electron
    },
  },
  esbuild: {
    jsx: "transform",
    jsxDev: false,
    jsxImportSource: "@",
    jsxInject: `import { jsx } from '@/jsx-runtime'`,
    jsxFactory: "jsx.component",
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'preload.js',   // 项目里的 preload.js 文件
          dest: ''    // 拷贝到 dist/preload.js
        }
      ]
    })
  ],
});