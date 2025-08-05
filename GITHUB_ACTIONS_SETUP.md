# GitHub Actions 设置指南

## 🎯 快速开始

### 1. 基本设置
在使用GitHub Actions进行自动构建前，需要完成以下设置：

#### 更新仓库信息
编辑 `package.json` 文件中的发布配置：
```json
{
  "build": {
    "publish": {
      "provider": "github",
      "owner": "your-github-username",  // 替换为您的GitHub用户名
      "repo": "my-browser"             // 替换为您的仓库名
    }
  }
}
```

#### 准备图标文件
在 `build/` 目录下放置以下图标文件：
- `icon.ico` - Windows图标 (256x256像素)
- `icon.icns` - macOS图标 (512x512像素)  
- `icon.png` - Linux图标 (512x512像素)

### 2. 权限设置
确保GitHub Actions有足够的权限：

1. 进入仓库 **Settings** → **Actions** → **General**
2. 在 **Workflow permissions** 部分选择：
   - ✅ **Read and write permissions**
   - ✅ **Allow GitHub Actions to create and approve pull requests**

### 3. 触发构建

#### 测试构建
```bash
# 推送到main分支会触发测试构建
git push origin main
```

#### 发布版本
```bash
# 创建版本标签会触发完整构建和发布
git tag v1.0.0
git push origin v1.0.0
```

## 🔧 工作流程详解

### 触发条件
- ✅ **推送到main分支** - 运行测试构建
- ✅ **创建Tag（v*）** - 运行完整构建并发布
- ✅ **手动触发** - 在Actions页面手动运行

### 构建阶段

#### 1. 测试阶段 (test)
- 代码检出和环境设置
- 安装pnpm和依赖
- 运行代码检查（如果配置了lint）

#### 2. 构建阶段 (build)
并行在三个平台上构建：
- **Ubuntu** (Linux包)
- **Windows** (Windows包)
- **macOS** (macOS包)

#### 3. 发布阶段 (release)
仅在创建Tag时运行：
- 下载所有构建产物
- 创建GitHub Release
- 上传各平台安装包

### 构建产物

#### Windows
- `*.exe` - NSIS安装程序（推荐）
- `*.exe` - 便携版（免安装）

#### macOS
- `*.dmg` - 磁盘映像（推荐）
- `*.zip` - 压缩包

#### Linux
- `*.AppImage` - 便携应用（推荐）
- `*.deb` - Debian包
- `*.rpm` - Red Hat包
- `*.tar.gz` - 通用压缩包

## ⚡ 性能优化

### 缓存策略
- ✅ **pnpm store缓存** - 加速依赖安装
- ✅ **Node.js模块缓存** - 减少重复下载
- ✅ **Electron二进制缓存** - 避免重复下载

### 并行构建
三个平台同时构建，总时间约15-20分钟：
- Windows: ~5-8分钟
- macOS: ~6-10分钟
- Linux: ~4-6分钟

## 🛠️ 自定义配置

### 修改构建脚本
在 `.github/workflows/build.yml` 中可以自定义：
- Node.js版本
- pnpm版本
- 构建步骤
- 发布设置

### 添加环境变量
```yaml
env:
  CUSTOM_VAR: "value"
  NODE_ENV: "production"
```

### 排除文件
在 `package.json` 的 `build.files` 中配置：
```json
{
  "files": [
    "src/**/*",
    "!**/*.test.js",
    "!**/*.spec.js"
  ]
}
```

## 🔍 监控和调试

### 查看构建状态
1. 进入GitHub仓库
2. 点击 **Actions** 标签
3. 查看工作流运行状态

### 下载构建产物
即使不是正式发布，也可以下载构建产物：
1. 点击具体的工作流运行
2. 在 **Artifacts** 部分下载

### 调试失败
查看失败的步骤日志：
1. 点击失败的工作流
2. 点击失败的步骤
3. 查看详细错误信息

## 📋 检查清单

发布前确保：
- [ ] 更新了 `package.json` 中的仓库信息
- [ ] 准备了各平台的图标文件
- [ ] 设置了正确的GitHub权限
- [ ] 测试了本地构建是否正常
- [ ] 更新了版本号
- [ ] 创建了正确的Git标签

## 🆘 常见问题

### Q: 构建失败显示权限不足
**A:** 检查仓库Settings → Actions → General中的权限设置

### Q: macOS构建失败提示代码签名
**A:** 已配置跳过代码签名，如果仍有问题，检查环境变量设置

### Q: 发布的Release没有安装包
**A:** 检查是否正确创建了Tag，只有Tag触发的构建才会发布

### Q: Linux构建失败缺少依赖
**A:** 已在workflow中安装常用依赖，特殊依赖需要额外配置

## 🔗 相关文档

- [GitHub Actions文档](https://docs.github.com/en/actions)
- [electron-builder文档](https://www.electron.build/)
- [pnpm文档](https://pnpm.io/)

---

💡 **提示**: 首次设置建议先推送代码到main分支测试构建，确认无误后再创建Tag进行正式发布。