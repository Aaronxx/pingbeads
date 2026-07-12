/**
 * 色块取色工具（共享模块）
 *
 * 供有边界和无边界马赛克处理器共用，避免代码重复。
 *
 * 核心功能：
 * 1. collectCenterPixels - 采集色块中心50%区域像素（排除边缘串色）
 * 2. extractDominantColor - 中位数引导加权平均取色
 */

const { fastFindClosestMarkColor } = require('./colorMapper');

/**
 * 快速中位数
 */
function fastMedian(arr) {
  const len = arr.length;
  if (len === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = len >> 1;
  return len % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * 中位数颜色
 */
function medianColor(colors) {
  if (!colors || colors.length === 0) return null;
  const rs = [], gs = [], bs = [];
  for (const c of colors) { rs.push(c.r); gs.push(c.g); bs.push(c.b); }
  return { r: fastMedian(rs), g: fastMedian(gs), b: fastMedian(bs) };
}

/**
 * 中位数引导加权平均取色（带异常像素过滤）
 *
 * 在加权平均之前，先排除和主体色（中位数）差异过大的像素，
 * 这些像素可能是分界线残留（AI生成图的乱画线等）。
 *
 * 1. 先找中位数作为参考中心
 * 2. 排除距离中位数 > 阈值的像素（分界线残留）
 * 3. 对剩余像素做高斯加权平均
 */
function extractDominantColor(colors) {
  if (!colors || colors.length === 0) return null;
  if (colors.length <= 4) return medianColor(colors);

  const median = medianColor(colors);
  if (!median) return null;

  // 先排除异常像素（分界线残留）：距离中位数 > 40 的视为异常
  const cleanColors = colors.filter(c => {
    const dr = c.r - median.r;
    const dg = c.g - median.g;
    const db = c.b - median.b;
    return Math.sqrt(dr * dr + dg * dg + db * db) <= 40;
  });

  // 如果过滤后像素太少，用全部像素
  const useColors = cleanColors.length >= colors.length * 0.3 ? cleanColors : colors;

  const sigmaSq = 2 * 25 * 25;
  let sumW = 0, sumR = 0, sumG = 0, sumB = 0;
  for (const c of useColors) {
    const dr = c.r - median.r;
    const dg = c.g - median.g;
    const db = c.b - median.b;
    const distSq = dr * dr + dg * dg + db * db;
    const w = Math.exp(-distSq / sigmaSq);
    sumW += w; sumR += c.r * w; sumG += c.g * w; sumB += c.b * w;
  }
  if (sumW === 0) return median;
  return { r: Math.round(sumR / sumW), g: Math.round(sumG / sumW), b: Math.round(sumB / sumW) };
}

/**
 * 采集色块中心50%区域的像素（跳过分界线行/列）
 *
 * 排除四周25%的边缘区域（避免串色），跳过分界线位置的行/列像素。
 * 小色块（<5px）回退到全区域采样。
 *
 * @param {Uint8ClampedArray} pixelData
 * @param {number} width
 * @param {number} startX
 * @param {number} endX
 * @param {number} startY
 * @param {number} endY
 * @param {Set} [excludeXSet] - 需要跳过的X坐标集合（分界线位置）
 * @param {Set} [excludeYSet] - 需要跳过的Y坐标集合（分界线位置）
 * @returns {Array<{r,g,b}>} 像素颜色数组
 */
function collectCenterPixels(pixelData, width, startX, endX, startY, endY) {
  const cellW = endX - startX;
  const cellH = endY - startY;

  if (cellW < 5 || cellH < 5) {
    // 小色块：全区域采样
    const colors = [];
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const i = (y * width + x) * 4;
        colors.push({ r: pixelData[i], g: pixelData[i + 1], b: pixelData[i + 2] });
      }
    }
    return colors;
  }

  // 中心50%区域
  const marginX = Math.floor(cellW * 0.25);
  const marginY = Math.floor(cellH * 0.25);
  const sx0 = startX + marginX;
  const sx1 = endX - marginX;
  const sy0 = startY + marginY;
  const sy1 = endY - marginY;

  const colors = [];
  for (let y = sy0; y < sy1; y++) {
    for (let x = sx0; x < sx1; x++) {
      const i = (y * width + x) * 4;
      colors.push({ r: pixelData[i], g: pixelData[i + 1], b: pixelData[i + 2] });
    }
  }
  return colors;
}

/**
 * 色块取色（一站式：采集中心像素 + 加权平均 + 映射色号）
 */
function extractCellColor(pixelData, width, startX, endX, startY, endY) {
  const colors = collectCenterPixels(pixelData, width, startX, endX, startY, endY);
  if (colors.length === 0) return null;

  const avgColor = extractDominantColor(colors);
  if (!avgColor) return null;

  const markColor = fastFindClosestMarkColor(avgColor);
  return {
    avgColor,
    markCode: markColor ? markColor.code : 'M001',
    markHex: markColor ? markColor.hex : '#CCCCCC',
    markRgb: markColor ? markColor.rgb : { r: 204, g: 204, b: 204 }
  };
}

module.exports = {
  collectCenterPixels,
  extractDominantColor,
  extractCellColor,
  medianColor
};
