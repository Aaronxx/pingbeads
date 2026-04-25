function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

function drawExportGuideLines(ctx, offsetX, offsetY, cols, rows, gridSize) {
  const lineColor = 'rgba(70, 130, 180, 0.8)';
  const lineWidth = 3;
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = lineWidth;

  for (let col = 10; col < cols; col += 10) {
    const x = offsetX + col * gridSize;
    ctx.beginPath();
    ctx.moveTo(x, offsetY);
    ctx.lineTo(x, offsetY + rows * gridSize);
    ctx.stroke();
  }

  for (let row = 10; row < rows; row += 10) {
    const y = offsetY + row * gridSize;
    ctx.beginPath();
    ctx.moveTo(offsetX, y);
    ctx.lineTo(offsetX + cols * gridSize, y);
    ctx.stroke();
  }
}

function drawWatermark(ctx, canvasWidth, canvasHeight, text = '拼豆酱') {
  const fontSize = 24;
  const angle = -30 * Math.PI / 180;

  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillStyle = '#888888';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const textWidth = ctx.measureText(text).width;
  const spacingX = textWidth + 150;
  const spacingY = fontSize + 80;

  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;
  ctx.translate(centerX, centerY);
  ctx.rotate(angle);
  ctx.translate(-centerX, -centerY);

  const rows = Math.ceil(canvasHeight / spacingY) + 2;
  const cols = Math.ceil(canvasWidth / spacingX) + 2;

  for (let row = -1; row < rows; row++) {
    for (let col = -1; col < cols; col++) {
      const x = col * spacingX + (row % 2) * (spacingX / 2);
      const y = row * spacingY;
      ctx.fillText(text, x, y);
    }
  }

  ctx.restore();
}

module.exports = {
  drawRoundedRect,
  drawExportGuideLines,
  drawWatermark
};
