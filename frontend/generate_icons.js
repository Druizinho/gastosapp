import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const svgPath = path.resolve('public/favicon.svg');
const svgBuffer = fs.readFileSync(svgPath);

async function generateIcons() {
  await sharp(svgBuffer)
    .resize(192, 192)
    .toFile('public/pwa-192x192.png');
    
  await sharp(svgBuffer)
    .resize(512, 512)
    .toFile('public/pwa-512x512.png');

  await sharp(svgBuffer)
    .resize(180, 180)
    .toFile('public/apple-touch-icon-180x180.png');
    
  console.log('Icons generated successfully.');
}

generateIcons().catch(console.error);
