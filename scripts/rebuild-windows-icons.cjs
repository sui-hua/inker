const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

function createIco(pngBuffers) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(count, 4);

  let offset = 6 + count * 16;
  const entries = [];
  for (const { width, height, buffer } of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(width >= 256 ? 0 : width, 0);
    entry.writeUInt8(height >= 256 ? 0 : height, 1);
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += buffer.length;
  }

  return Buffer.concat([header, ...entries, ...pngBuffers.map((p) => p.buffer)]);
}

async function renderIcon(trimmedSource, size, fillRatio = 0.96) {
  const innerSize = Math.max(1, Math.round(size * fillRatio));
  const innerBuffer = await sharp(trimmedSource)
    .resize(innerSize, innerSize, {
      fit: "contain",
      kernel: sharp.kernel.lanczos3,
    })
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: innerBuffer, gravity: "center" }])
    .png()
    .toBuffer();
}

async function main() {
  const sourcePath = path.resolve("design/InkerIcon-source.png");
  console.log("Reading source image:", sourcePath);

  // 获取裁切掉外部多余留白后的主体图像
  const trimmed = await sharp(sourcePath).trim().toBuffer();
  const trimmedMeta = await sharp(trimmed).metadata();
  console.log("Trimmed dimensions:", trimmedMeta.width, trimmedMeta.height);

  const iconsDir = path.resolve("src-tauri/icons");

  const windowsPngTargets = [
    { file: "Square30x30Logo.png", size: 30 },
    { file: "Square44x44Logo.png", size: 44 },
    { file: "StoreLogo.png", size: 50 },
    { file: "Square71x71Logo.png", size: 71 },
    { file: "Square89x89Logo.png", size: 89 },
    { file: "Square107x107Logo.png", size: 107 },
    { file: "Square142x142Logo.png", size: 142 },
    { file: "Square150x150Logo.png", size: 150 },
    { file: "Square284x284Logo.png", size: 284 },
    { file: "Square310x310Logo.png", size: 310 },
    { file: "32x32.png", size: 32 },
    { file: "64x64.png", size: 64 },
    { file: "128x128.png", size: 128 },
    { file: "128x128@2x.png", size: 256 },
    { file: "icon.png", size: 512 },
  ];

  console.log("Generating full-scale PNG icons for Windows & Desktop...");
  for (const { file, size } of windowsPngTargets) {
    const targetPath = path.join(iconsDir, file);
    const buf = await renderIcon(trimmed, size, 0.96);
    fs.writeFileSync(targetPath, buf);
    console.log(`  Updated: ${file} (${size}x${size})`);
  }

  // 网页端图标
  const favBuf = await renderIcon(trimmed, 32, 0.96);
  fs.writeFileSync(path.resolve("public/favicon.png"), favBuf);
  console.log("  Updated: public/favicon.png");

  const webIconBuf = await renderIcon(trimmed, 512, 0.96);
  fs.writeFileSync(path.resolve("public/icon.png"), webIconBuf);
  console.log("  Updated: public/icon.png");

  // 生成 Windows .ico 多分辨率容器
  console.log("Generating full-scale icon.ico with all required Windows resolutions...");
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoBuffers = [];
  for (const s of icoSizes) {
    const buf = await renderIcon(trimmed, s, 0.96);
    icoBuffers.push({ width: s, height: s, buffer: buf });
  }

  const icoPath = path.join(iconsDir, "icon.ico");
  const icoFileBuffer = createIco(icoBuffers);
  fs.writeFileSync(icoPath, icoFileBuffer);
  console.log(`  Updated: ${icoPath} (Total size: ${icoFileBuffer.length} bytes, 7 resolutions)`);

  console.log("Icon regeneration completed successfully!");
}

main().catch((err) => {
  console.error("Failed to generate icons:", err);
  process.exit(1);
});
