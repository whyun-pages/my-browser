# Electron 调试指南

## 🐛 调试配置说明

### 1. Debug Electron 主进程 ⭐ 推荐
- **用途**: 调试主进程代码 (`src/main.js`)
- **特点**: 直接启动 electron，调试器不会退出
- **使用场景**: 调试窗口创建、IPC通信、系统集成等

### 2. Debug Electron 渲染进程
- **用途**: 调试渲染进程代码 (`src/renderer.js`)
- **特点**: 需要先启动应用，然后附加调试器
- **使用步骤**:
  1. 先启动 "Debug Electron 完整模式"
  2. 等待应用窗口打开
  3. 再启动 "Debug Electron 渲染进程"

### 3. Debug Electron 完整模式
- **用途**: 同时支持主进程和渲染进程调试
- **特点**: 启用远程调试端口，支持 Chrome DevTools
- **端口**: 主进程调试端口 5858，渲染进程调试端口 9222

### 4. Debug Electron 全部进程 🚀 最佳体验
- **用途**: 同时启动主进程和渲染进程调试
- **特点**: 复合配置，一键启动完整调试环境

## 🛠️ 使用方法

### 方法一：单独调试主进程
1. 按 `F5` 或选择 "Debug Electron 主进程"
2. 在 `src/main.js` 中设置断点
3. 调试器会停在断点处

### 方法二：完整调试体验
1. 选择 "Debug Electron 全部进程"
2. 主进程和渲染进程都可以调试
3. 在任何 `.js` 文件中设置断点

### 方法三：只调试渲染进程
1. 先启动 "Debug Electron 完整模式"
2. 等应用启动后，选择 "Debug Electron 渲染进程"
3. 在 `src/renderer.js` 中设置断点

## 🔧 调试技巧

### 断点设置
- **主进程断点**: 在 `src/main.js` 中设置
- **渲染进程断点**: 在 `src/renderer.js` 中设置
- **IPC调试**: 在 `ipcMain.handle` 和 `ipcRenderer.invoke` 处设置断点

### 控制台输出
- **主进程**: 查看 VSCode 调试控制台
- **渲染进程**: 打开 Chrome DevTools (F12)

### 常见问题解决
1. **调试器立即退出**: 使用 "Debug Electron 主进程" 而不是通过 npm
2. **无法调试渲染进程**: 确保启用了远程调试端口 (9222)
3. **断点不生效**: 检查源码映射，确保文件路径正确

## 📝 快捷键

- `F5`: 启动调试
- `Ctrl+Shift+F5`: 重启调试
- `F10`: 单步跳过
- `F11`: 单步进入
- `Shift+F11`: 单步跳出
- `F9`: 切换断点

## 🎯 推荐工作流

1. **开发阶段**: 使用 "Debug Electron 主进程" 进行日常开发
2. **复杂调试**: 使用 "Debug Electron 全部进程" 进行深度调试
3. **UI调试**: 结合 Chrome DevTools 调试渲染进程