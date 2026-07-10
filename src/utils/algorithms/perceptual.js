/**
 * 感知算法（perceptual）
 *
 * 核心改进：
 * 1. 感知色彩距离（redmean 近似）替代纯 RGB 欧氏距离
 *    人眼对绿色最敏感，蓝色最迟钝，距离随红色均值微调
 * 2. 两阶段色彩缩减：先聚类后映射
 *    聚类在连续 RGB 空间用感知距离做 K-means → 相近色归为同一簇
 *    然后每个簇中心映射到色板 → 同区域格子得到同一色号
 * 3. 空间众数滤波清理孤立杂色
 *
 * 查找表、缓存独立于 current/classic 算法。
 */

const { markPalette } = require('../../data/colorPalettes');
const { getMarkColorInfoByCode, isSpecialColor, getAlternativeColor } = require('../colorMapper');

// ========== 感知距离（redmean 近似） ==========

/**
 * 感知距离平方（redmean weighted）
 * 人眼对绿色通道权重最高，蓝色最低。
 * 距离随红通道均值微调，比纯欧氏更接近人眼感受。
 */
/**
 * 色彩距离（欧氏距离平方）
 * 查找表和聚合都用欧氏距离，保持和柔和/鲜亮模式一致的色彩映射。
 * 平衡模式的独特优势在于两阶段聚类 + 空间众数滤波，不在于距离公式。
 */
function perceptualDistanceSq(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr + dg * dg + db * db;
}

// ========== 查找表（感知距离构建） ==========

let colorLookupTable = null;
let lookupTableReady = false;

const rgbCache = new Map();
const excludeSpecialCache = new Map();
const RGB_CACHE_MAX = 4096;
const EXCLUDE_SPECIAL_CACHE_MAX = 1024;

function buildColorLookupTable() {
  if (colorLookupTable) return;
  const resolution = 32;
  const total = resolution * resolution * resolution;
  colorLookupTable = new Array(total);

  const quantValues = [];
  for (let i = 0; i < resolution; i++) {
    quantValues[i] = Math.round(i * 255 / (resolution - 1));
  }

  const paletteRgb = markPalette.map(c => c.rgb);
  const paletteLen = paletteRgb.length;

  for (let r = 0; r < resolution; r++) {
    const rVal = quantValues[r];
    const rIdxOffset = r * resolution * resolution;
    for (let g = 0; g < resolution; g++) {
      const gVal = quantValues[g];
      const gIdxOffset = g * resolution;
      for (let b = 0; b < resolution; b++) {
        const bVal = quantValues[b];
        let minDistance = Infinity;
        let closestColor = markPalette[0];
        for (let i = 0; i < paletteLen; i++) {
          // 感知距离替代欧氏距离
          const dist = perceptualDistanceSq(
            paletteRgb[i].r, paletteRgb[i].g, paletteRgb[i].b,
            rVal, gVal, bVal
          );
          if (dist < minDistance) {
            minDistance = dist;
            closestColor = markPalette[i];
          }
        }
        colorLookupTable[rIdxOffset + gIdxOffset + b] = closestColor;
      }
    }
  }
}

function initColorLookupTable() {
  if (lookupTableReady) return;
  buildColorLookupTable();
  lookupTableReady = true;
}

function fastFindClosestMarkColor(targetRgb, excludeSpecial) {
  if (!lookupTableReady) initColorLookupTable();

  const rq = Math.floor(targetRgb.r / 4);
  const gq = Math.floor(targetRgb.g / 4);
  const bq = Math.floor(targetRgb.b / 4);
  const cacheKey = (rq << 12) | (gq << 6) | bq | (excludeSpecial ? 262144 : 0);
  const cache = excludeSpecial ? excludeSpecialCache : rgbCache;

  if (cache.has(cacheKey)) return cache.get(cacheKey);

  if (!colorLookupTable) {
    return findClosestMarkColorExact(targetRgb, excludeSpecial);
  }

  const resolution = 32;
  const rIdx = Math.min(31, targetRgb.r >> 3);
  const gIdx = Math.min(31, targetRgb.g >> 3);
  const bIdx = Math.min(31, targetRgb.b >> 3);
  let result = colorLookupTable[rIdx * resolution * resolution + gIdx * resolution + bIdx];

  if (excludeSpecial && result && isSpecialColor(result.code)) {
    const alt = getAlternativeColor(result.code);
    if (alt) result = alt;
  }

  const cacheMax = excludeSpecial ? EXCLUDE_SPECIAL_CACHE_MAX : RGB_CACHE_MAX;
  if (cache.size < cacheMax) cache.set(cacheKey, result);
  return result;
}

function findClosestMarkColorExact(targetRgb, excludeSpecial) {
  const exclude = !!excludeSpecial;
  let minDistance = Infinity;
  let closestColor = null;
  for (const color of markPalette) {
    const dist = perceptualDistanceSq(
      targetRgb.r, targetRgb.g, targetRgb.b,
      color.rgb.r, color.rgb.g, color.rgb.b
    );
    if (dist < minDistance) {
      minDistance = dist;
      closestColor = color;
    }
  }
  if (!closestColor) return null;
  let result = { ...closestColor };
  if (exclude && isSpecialColor(result.code)) {
    const alt = getAlternativeColor(result.code);
    if (alt) result = alt;
  }
  return result;
}

// ========== 取色 ==========

function quickMedian(arr) {
  const len = arr.length;
  if (len === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = len >> 1;
  return len % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function medianColor(pixelData, width, height, srcX, srcY, endX, endY) {
  const rs = [], gs = [], bs = [];
  for (let y = srcY; y < endY && y < height; y++) {
    for (let x = srcX; x < endX && x < width; x++) {
      const idx = (y * width + x) * 4;
      rs.push(pixelData[idx]);
      gs.push(pixelData[idx + 1]);
      bs.push(pixelData[idx + 2]);
    }
  }
  if (rs.length === 0) return { r: 0, g: 0, b: 0 };
  return { r: quickMedian(rs), g: quickMedian(gs), b: quickMedian(bs) };
}

// ========== 主处理函数 ==========

function processSimple(pixelData, width, height, gridSize, mergeThreshold, vibrantScale) {
  const cols = Math.ceil(width / gridSize);
  const rows = Math.ceil(height / gridSize);
  const scaleX = width / cols;
  const scaleY = height / rows;
  const gridData = [];

  if (!pixelData || pixelData.length === 0) {
    return { gridData: [], cols, rows, gridSize };
  }

  const gridRegions = [];
  for (let row = 0; row < rows; row++) {
    gridRegions[row] = [];
    for (let col = 0; col < cols; col++) {
      gridRegions[row][col] = {
        srcX: Math.floor(col * scaleX),
        srcY: Math.floor(row * scaleY),
        endX: Math.floor((col + 1) * scaleX),
        endY: Math.floor((row + 1) * scaleY)
      };
    }
  }

  const markCache = new Map();
  const MARK_CACHE_MAX = 8192;
  const vScale = vibrantScale || 0;

  for (let row = 0; row < rows; row++) {
    gridData[row] = [];
    for (let col = 0; col < cols; col++) {
      const { srcX, srcY, endX, endY } = gridRegions[row][col];

      // 中位数取色（鲁棒、抗噪）
      const dominantColor = medianColor(pixelData, width, height, srcX, srcY, endX, endY);

      let vibrantColor = dominantColor;
      if (vScale !== 0) {
        if (vScale > 0) {
          vibrantColor = enhanceVibrant(dominantColor, vScale / 10);
        } else {
          vibrantColor = reduceVibrant(dominantColor, Math.abs(vScale) / 10);
        }
      }

      const rq = Math.floor(vibrantColor.r / 4);
      const gq = Math.floor(vibrantColor.g / 4);
      const bq = Math.floor(vibrantColor.b / 4);
      const cacheKeyV = (rq << 12) | (gq << 6) | bq;
      let markColor;
      if (markCache.has(cacheKeyV)) {
        markColor = markCache.get(cacheKeyV);
      } else {
        markColor = fastFindClosestMarkColor(vibrantColor);
        if (markCache.size < MARK_CACHE_MAX) markCache.set(cacheKeyV, markColor);
      }

      gridData[row][col] = {
        x: col * gridSize,
        y: row * gridSize,
        width: gridSize,
        height: gridSize,
        rawRgb: dominantColor,
        originalRgb: dominantColor,
        originalMarkCode: markColor.code,
        markCode: markColor.code,
        markHex: markColor.hex,
        markRgb: markColor.rgb
      };
    }
  }

  // 注意：aggregateSimilarColors 不在此处调用，由调用方根据 algorithmVersion 选择合并策略

  return { gridData, cols, rows, gridSize, mergeThreshold };
}

// ========== 两阶段色彩合并 ==========

/**
 * 感知空间两阶段合并：
 * 阶段 1：感知距离 K-means 聚类，将相近的 originalRgb 归为同一簇
 * 阶段 2：每簇映射到色板 + 空间众数滤波清理孤立色号
 */
function aggregateSimilarColors(gridData, rows, cols, targetCount) {
  if (!gridData || targetCount <= 0) return gridData;

  // 统计唯一色号，若已低于 targetCount 则跳过
  const freq = {};
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = gridData[row] && gridData[row][col];
      if (cell && cell.markCode) freq[cell.markCode] = (freq[cell.markCode] || 0) + 1;
    }
  }
  if (Object.keys(freq).length <= targetCount) return gridData;

  // ===== 阶段 1：感知 K-means 聚类 =====

  // 收集所有格子的 originalRgb
  const allColors = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = gridData[row] && gridData[row][col];
      if (cell && cell.originalRgb) {
        allColors.push({ row, col, rgb: cell.originalRgb });
      }
    }
  }
  if (allColors.length === 0) return gridData;

  // 去重 + 频次统计
  const colorCountMap = new Map();
  for (const c of allColors) {
    const key = `${c.rgb.r},${c.rgb.g},${c.rgb.b}`;
    if (!colorCountMap.has(key)) {
      colorCountMap.set(key, { rgb: c.rgb, count: 0 });
    }
    colorCountMap.get(key).count++;
  }
  const uniqueColors = Array.from(colorCountMap.values());
  if (uniqueColors.length <= targetCount) return gridData;

  // 初始中心：频次加权采样（高频色优先成为中心，更贴合实际分布）
  const sortedByCount = uniqueColors.slice().sort((a, b) => b.count - a.count);
  const centers = [];
  const step = Math.max(1, Math.floor(sortedByCount.length / targetCount));
  for (let i = 0; i < targetCount && i * step < sortedByCount.length; i++) {
    centers.push({ ...sortedByCount[i * step].rgb });
  }
  while (centers.length < targetCount && centers.length < uniqueColors.length) {
    centers.push({ ...uniqueColors[centers.length].rgb });
  }

  // K-means 迭代（感知距离分配）
  const maxIterations = 5;
  let lastAssign = new Array(uniqueColors.length);

  for (let iter = 0; iter < maxIterations; iter++) {
    const clusters = Array.from({ length: centers.length }, () => []);

    for (let ci = 0; ci < uniqueColors.length; ci++) {
      const colorInfo = uniqueColors[ci];
      const cr = colorInfo.rgb.r;
      const cg = colorInfo.rgb.g;
      const cb = colorInfo.rgb.b;
      let minDist = Infinity;
      let minIdx = 0;
      for (let i = 0; i < centers.length; i++) {
        // 感知距离（与查找表一致）
        const dist = perceptualDistanceSq(cr, cg, cb, centers[i].r, centers[i].g, centers[i].b);
        if (dist < minDist) { minDist = dist; minIdx = i; }
      }
      lastAssign[ci] = minIdx;
      clusters[minIdx].push(colorInfo);
    }

    // 更新中心（频次加权）
    let changed = false;
    for (let i = 0; i < centers.length; i++) {
      if (clusters[i].length === 0) continue;
      let sumR = 0, sumG = 0, sumB = 0;
      for (const c of clusters[i]) {
        sumR += c.rgb.r * c.count;
        sumG += c.rgb.g * c.count;
        sumB += c.rgb.b * c.count;
      }
      const totalWeight = clusters[i].reduce((sum, c) => sum + c.count, 0);
      const newCenter = {
        r: Math.round(sumR / totalWeight),
        g: Math.round(sumG / totalWeight),
        b: Math.round(sumB / totalWeight)
      };
      const dist = perceptualDistanceSq(centers[i].r, centers[i].g, centers[i].b, newCenter.r, newCenter.g, newCenter.b);
      if (dist > 25) { centers[i] = newCenter; changed = true; }
    }
    if (!changed) break;
  }

  // ===== 阶段 2：簇中心映射色板 + 应用 =====

  const centerMarkColors = centers.map(center => fastFindClosestMarkColor(center));

  // 构建 RGB → 簇索引
  const rgbToCenterIdx = new Map();
  for (let ci = 0; ci < uniqueColors.length; ci++) {
    const colorInfo = uniqueColors[ci];
    const key = (colorInfo.rgb.r << 16) | (colorInfo.rgb.g << 8) | colorInfo.rgb.b;
    rgbToCenterIdx.set(key, lastAssign[ci]);
  }

  // 应用聚类结果到所有格子
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = gridData[row] && gridData[row][col];
      if (!cell || !cell.originalRgb) continue;
      const key = (cell.originalRgb.r << 16) | (cell.originalRgb.g << 8) | cell.originalRgb.b;
      const centerIdx = rgbToCenterIdx.get(key);
      if (centerIdx !== undefined) {
        const markColor = centerMarkColors[centerIdx];
        cell.markCode = markColor.code;
        cell.markHex = markColor.hex;
        cell.markRgb = markColor.rgb;
      }
    }
  }

  // ===== 空间众数滤波：清理孤立杂色 =====
  const minFreq = Math.max(1, Math.floor(targetCount / 3));
  const maxPasses = 3;
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  for (let pass = 0; pass < maxPasses; pass++) {
    const freqPass = {};
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = gridData[row] && gridData[row][col];
        if (cell && cell.markCode) freqPass[cell.markCode] = (freqPass[cell.markCode] || 0) + 1;
      }
    }

    const lowFreqCodes = new Set();
    for (const code in freqPass) {
      if (freqPass[code] < minFreq) lowFreqCodes.add(code);
    }
    if (lowFreqCodes.size === 0) break;

    let replaced = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = gridData[row] && gridData[row][col];
        if (!cell || !cell.markCode || !lowFreqCodes.has(cell.markCode)) continue;

        const neighborFreq = {};
        for (const [dr, dc] of dirs) {
          const nr = row + dr, nc = col + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          const neighbor = gridData[nr] && gridData[nr][nc];
          if (neighbor && neighbor.markCode && neighbor.markCode !== cell.markCode) {
            neighborFreq[neighbor.markCode] = (neighborFreq[neighbor.markCode] || 0) + 1;
          }
        }

        let bestCode = null, bestCount = 0;
        for (const code in neighborFreq) {
          if (neighborFreq[code] > bestCount) {
            bestCount = neighborFreq[code];
            bestCode = code;
          }
        }

        if (bestCode && freqPass[bestCode] > freqPass[cell.markCode]) {
          const altInfo = getMarkColorInfoByCode(bestCode);
          if (altInfo) {
            cell.markCode = altInfo.code;
            cell.markHex = altInfo.hex;
            cell.markRgb = altInfo.rgb;
            replaced++;
          }
        }
      }
    }
    if (replaced === 0) break;
  }

  return gridData;
}

// ========== 鲜艳度增强/降低（自包含，避免循环依赖） ==========

function enhanceVibrant(rgb, scale) {
  if (!rgb || scale <= 0) return rgb;
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0, s = max === 0 ? 0 : d / max, v = max;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  s = Math.min(1, s * (1 + scale * 0.5));
  v = Math.min(1, v * (1 + scale * 0.2));
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  let rn, gn, bn;
  switch (i % 6) {
    case 0: rn = v; gn = t; bn = p; break;
    case 1: rn = q; gn = v; bn = p; break;
    case 2: rn = p; gn = v; bn = t; break;
    case 3: rn = p; gn = q; bn = v; break;
    case 4: rn = t; gn = p; bn = v; break;
    case 5: rn = v; gn = p; bn = q; break;
  }
  const contrast = 1.0 + scale * 0.2;
  return {
    r: Math.max(0, Math.min(255, Math.round(128 + (rn * 255 - 128) * contrast))),
    g: Math.max(0, Math.min(255, Math.round(128 + (gn * 255 - 128) * contrast))),
    b: Math.max(0, Math.min(255, Math.round(128 + (bn * 255 - 128) * contrast)))
  };
}

function reduceVibrant(rgb, scale) {
  if (!rgb) return rgb;
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0, s = max === 0 ? 0 : d / max, v = max;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  s = Math.max(0, s * (1 - scale * 0.5));
  v = Math.max(0, v * (1 - scale * 0.2));
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  let rn, gn, bn;
  switch (i % 6) {
    case 0: rn = v; gn = t; bn = p; break;
    case 1: rn = q; gn = v; bn = p; break;
    case 2: rn = p; gn = v; bn = t; break;
    case 3: rn = p; gn = q; bn = v; break;
    case 4: rn = t; gn = p; bn = v; break;
    case 5: rn = v; gn = p; bn = q; break;
  }
  const avgGray = (rn + gn + bn) / 3 * 255;
  const contrast = 1.0 - scale * 0.3;
  return {
    r: Math.max(0, Math.min(255, Math.round(avgGray + (rn * 255 - avgGray) * contrast))),
    g: Math.max(0, Math.min(255, Math.round(avgGray + (gn * 255 - avgGray) * contrast))),
    b: Math.max(0, Math.min(255, Math.round(avgGray + (bn * 255 - avgGray) * contrast)))
  };
}

module.exports = {
  processSimple,
  aggregateSimilarColors,
  fastFindClosestMarkColor,
  enhanceVibrant,
  reduceVibrant,
  perceptualDistanceSq
};
