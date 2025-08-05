#!/usr/bin/env node

/**
 * 图标生成脚本
 * 
 * 这个脚本可以从一个高质量的PNG图片生成各平台所需的图标文件
 * 需要安装 sharp 库：npm install sharp --save-dev
 * 
 * 使用方法：
 * node scripts/create-icons.js path/to/your/icon.png
 */

const fs = require('fs');
const path = require('path');

// 检查是否有sharp库，如果没有提供安装指导
try {
  var sharp = require('sharp');
} catch (error) {
  console.error('❌ 缺少 sharp 库，请先安装：');
  console.error('   npm install sharp --save-dev');
  console.error('   或者');  
  console.error('   pnpm add sharp --save-dev');
  process.exit(1);
}

const inputFile = process.argv[2];

if (!inputFile) {
  console.error('❌ 请提供输入图片路径：');
  console.error('   node scripts/create-icons.js path/to/your/icon.png');
  process.exit(1);
}

if (!fs.existsSync(inputFile)) {
  console.error(`❌ 文件不存在: ${inputFile}`);
  process.exit(1);
}

const buildDir = path.join(__dirname, '../build');

// 确保build目录存在
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

async function generateIcons() {
  try {
    console.log('🎨 开始生成图标...');
    
    // 读取原始图片
    const image = sharp(inputFile);
    const metadata = await image.metadata();
    
    console.log(`📏 原始图片尺寸: ${metadata.width}x${metadata.height}`);
    
    if (metadata.width < 512 || metadata.height < 512) {
      console.warn('⚠️  警告: 原始图片分辨率较低，可能影响图标质量');
      console.warn('   建议使用至少 512x512 的高质量图片');
    }

    // 生成 Windows ICO (256x256)
    console.log('🪟 生成 Windows 图标...');
    await image
      .resize(256, 256)
      .png()
      .toFile(path.join(buildDir, 'icon.png'));
    
    // 注意：生成真正的ICO文件需要额外的库，这里先生成PNG
    // 可以使用在线工具或其他软件转换为ICO格式
    console.log('   ℹ️  已生成 PNG 格式，建议转换为 ICO 格式');

    // 生成 Linux PNG (512x512)
    console.log('🐧 生成 Linux 图标...');
    await image
      .resize(512, 512)
      .png()
      .toFile(path.join(buildDir, 'icon-512.png'));

    // 复制一份作为默认Linux图标
    fs.copyFileSync(
      path.join(buildDir, 'icon-512.png'),
      path.join(buildDir, 'icon.png')
    );

    // 生成各种尺寸的PNG（用于ICNS制作）
    console.log('🍎 生成 macOS 图标素材...');
    const sizes = [16, 32, 64, 128, 256, 512, 1024];
    
    for (const size of sizes) {
      await image
        .resize(size, size)
        .png()
        .toFile(path.join(buildDir, `icon-${size}.png`));
    }

    console.log('   ℹ️  已生成各尺寸PNG，建议使用工具制作ICNS文件');
    
    // 提供制作ICNS的命令（需要在macOS上运行）
    console.log('\n📝 制作 ICNS 文件的命令（需要在 macOS 上运行）：');
    console.log('   mkdir icon.iconset');
    console.log('   cp build/icon-16.png icon.iconset/icon_16x16.png');
    console.log('   cp build/icon-32.png icon.iconset/icon_32x32.png');
    console.log('   cp build/icon-64.png icon.iconset/icon_32x32@2x.png');
    console.log('   cp build/icon-128.png icon.iconset/icon_128x128.png');
    console.log('   cp build/icon-256.png icon.iconset/icon_128x128@2x.png');
    console.log('   cp build/icon-512.png icon.iconset/icon_256x256@2x.png');
    console.log('   cp build/icon-1024.png icon.iconset/icon_512x512@2x.png');
    console.log('   iconutil -c icns icon.iconset');
    console.log('   mv icon.icns build/');

    console.log('\n✅ 图标生成完成！');
    console.log('📂 输出目录:', buildDir);
    console.log('\n📋 后续步骤：');
    console.log('1. Windows: 将 icon.png 转换为 icon.ico');
    console.log('2. macOS: 使用上述命令制作 icon.icns');
    console.log('3. Linux: icon.png 已可直接使用');

  } catch (error) {
    console.error('❌ 生成图标时出错:', error.message);
    process.exit(1);
  }
}

// 运行图标生成
generateIcons();