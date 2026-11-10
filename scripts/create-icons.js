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
const fsPromise = require('fs').promises;
const png2ico = require('png-to-ico');
const { gen } = require('icns-gen')


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

// 图案占画布的比例。源图四周的透明边会先裁掉，再按这个比例留边：
// Windows / Linux 的图标基本铺满画布；macOS 按官方模板留一圈边（1024 里约 824）。
const FILL = 0.9;
const FILL_MAC = 0.8;

// 确保build目录存在
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

async function generateIcons() {
  try {
    console.log('🎨 开始生成图标...');
    
    // 读取原始图片，裁掉四周的透明边
    const metadata = await sharp(inputFile).metadata();
    const trimmed = await sharp(inputFile).ensureAlpha().trim({ threshold: 1 }).png().toBuffer();
    const trimmedMeta = await sharp(trimmed).metadata();
    console.log(`✂️  裁掉透明边后: ${trimmedMeta.width}x${trimmedMeta.height}`);
    /** 把图案缩到 size*fill 并居中放进 size × size 的透明画布 */
    const render = async (size, fill) => {
      const inner = Math.max(1, Math.round(size * fill));
      const art = await sharp(trimmed)
        .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer();
      const pad = size - inner;
      return sharp(art)
        .extend({
          top: Math.floor(pad / 2), bottom: Math.ceil(pad / 2),
          left: Math.floor(pad / 2), right: Math.ceil(pad / 2),
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
    };
    
    console.log(`📏 原始图片尺寸: ${metadata.width}x${metadata.height}`);
    
    if (metadata.width < 512 || metadata.height < 512) {
      console.warn('⚠️  警告: 原始图片分辨率较低，可能影响图标质量');
      console.warn('   建议使用至少 512x512 的高质量图片');
    }

    // 生成 Linux PNG (512x512)
    console.log('🐧 生成 Linux 图标...');
    await fsPromise.writeFile(path.join(buildDir, 'icon.png'), await render(512, FILL));
    console.log('   ℹ️  已生成 PNG 格式');


    // 生成各种尺寸的PNG（用于ICNS制作）
    console.log('🍎 生成 macOS 图标素材...');
    const sizes = [16, 32, 64, 128, 256, 512, 1024];
    
    const macBuffers = await Promise.all(sizes.map((size) => render(size, FILL_MAC)));

    await gen(macBuffers.map((buffer, index) => ({
      buffer,
      size: sizes[index],
    })), path.join(buildDir, 'icon.icns'));
    console.log('   ℹ️  已生成ICNS文件');

    // 生成 Windows ICO (256x256)
    console.log('🪟 生成 Windows 图标...');

    // 16 – 256；小尺寸也铺满，任务栏里才不显得小
    const icoBuffers = await Promise.all(sizes.slice(0, -2).map((size) => render(size, FILL)));
    const bufferIco = await png2ico(icoBuffers);
    await fsPromise.writeFile(
      path.join(buildDir, 'icon.ico'), bufferIco
    );
    console.log('   ℹ️  已生成ICO文件');

    console.log('\n✅ 图标生成完成！');
    console.log('📂 输出目录:', buildDir);
  } catch (error) {
    console.error('❌ 生成图标时出错:', error.message);
    process.exit(1);
  }
}

// 运行图标生成
generateIcons();