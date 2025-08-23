import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  base: './',  // 👈 使用相对路径
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  build: {
    minify: false,  // 不压缩
    target: 'esnext', // 可选，设置更高的语法支持
  },
  esbuild: {
    jsx: "transform",
    jsxDev: false,
    jsxImportSource: "@",
    jsxInject: `import { jsx } from '@/jsx-runtime'`,
    jsxFactory: "jsx.component",
  },
});