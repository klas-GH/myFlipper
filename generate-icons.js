const fs = require('fs');
const { createCanvas } = require('canvas');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

function drawIcon(ctx, size) {
  // Background
  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#10102b');
  bg.addColorStop(1, '#080817');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Glow border
  ctx.strokeStyle = '#35f6ff';
  ctx.lineWidth = size * 0.03;
  ctx.shadowColor = '#35f6ff';
  ctx.shadowBlur = size * 0.08;
  ctx.strokeRect(size * 0.05, size * 0.05, size * 0.9, size * 0.9);

  // Flipper shape (left)
  ctx.save();
  ctx.translate(size * 0.25, size * 0.75);
  ctx.rotate(-0.3);
  ctx.fillStyle = '#35f6ff';
  ctx.shadowColor = '#35f6ff';
  ctx.shadowBlur = size * 0.05;
  ctx.fillRect(-size * 0.15, -size * 0.02, size * 0.3, size * 0.04);
  ctx.restore();

  // Flipper shape (right)
  ctx.save();
  ctx.translate(size * 0.75, size * 0.75);
  ctx.rotate(0.3 + Math.PI);
  ctx.fillStyle = '#ff39d4';
  ctx.shadowColor = '#ff39d4';
  ctx.shadowBlur = size * 0.05;
  ctx.fillRect(-size * 0.15, -size * 0.02, size * 0.3, size * 0.04);
  ctx.restore();

  // Ball
  const gradient = ctx.createRadialGradient(
    size * 0.5 - size * 0.05, size * 0.4 - size * 0.05, size * 0.02,
    size * 0.5, size * 0.4, size * 0.12
  );
  gradient.addColorStop(0, '#fff');
  gradient.addColorStop(0.4, '#c7ffff');
  gradient.addColorStop(1, '#35f6ff');
  ctx.fillStyle = gradient;
  ctx.shadowColor = '#35f6ff';
  ctx.shadowBlur = size * 0.06;
  ctx.beginPath();
  ctx.arc(size * 0.5, size * 0.4, size * 0.12, 0, Math.PI * 2);
  ctx.fill();

  // Title text
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${size * 0.09}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MY', size * 0.5, size * 0.9);
  ctx.fillStyle = '#ff39d4';
  ctx.fillText('FLIPPER', size * 0.5, size * 0.9 + size * 0.08);
}

sizes.forEach(s => {
  const canvas = createCanvas(s, s);
  const ctx = canvas.getContext('2d');
  drawIcon(ctx, s);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(`D:/apps/myFlipperGame/icons/icon-${s}.png`, buffer);
  console.log(`Created icon-${s}.png`);
});

console.log('All icons generated!');