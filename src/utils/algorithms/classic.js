/**
 * 经典算法（1bdbade 版本）
 *
 * 核心特征：
 * - 纯中位数取色（独立通道 R/G/B 中位数，无加权平均）
 * - 全色板查找表（markPalette，无浊色惩罚，无 excludeSpecial 全局开关）
 * - 静态特殊色替代表（P2→H3 等）
 * - K-means 聚类合并（欧氏距离构建中心，曼哈顿距离分配）
 *
 * 所有查找表、缓存、取色函数自包含，不影响 current/perceptual 算法。
 */

const { markPalette } = require('../../data/colorPalettes');

// ========== 特殊色 ==========

const SPECIAL_SERIES = ['P', 'Q', 'R', 'T', 'Y', 'ZG'];
const specialSeriesSet = new Set(SPECIAL_SERIES);

function isSpecialColor(code) {
  if (!code) return false;
  const prefix = code.match(/^[A-Z]+/);
  return prefix && specialSeriesSet.has(prefix[0]);
}

// 静态特殊色替代映射表（1bdbade 原始版本）
const SPECIAL_ALTERNATIVES = {
  "P1": "H1", "P2": "H3", "P3": "B28", "P4": "F14", "P5": "A7",
  "P6": "B6", "P7": "F17", "P8": "A20", "P9": "H14", "P10": "E24",
  "P11": "H13", "P12": "H9", "P13": "C28", "P14": "B25", "P15": "M3",
  "P16": "A6", "P17": "G6", "P18": "F16", "P19": "H18", "P20": "F22",
  "P21": "A23", "P22": "F24", "P23": "G14",
  "Q1": "E3", "Q2": "A21", "Q3": "B1", "Q4": "H12", "Q5": "C24",
  "R1": "F15", "R2": "E6", "R3": "A10", "R4": "B1", "R5": "B5",
  "R6": "C19", "R7": "C19", "R8": "C8", "R9": "D7", "R10": "A8",
  "R11": "H1", "R12": "H14", "R13": "H5", "R14": "C25", "R15": "C24",
  "R16": "C15", "R17": "B25", "R18": "B6", "R19": "B29", "R20": "A23",
  "R21": "G13", "R22": "G8", "R23": "A18", "R24": "E15", "R25": "M14",
  "R26": "D12", "R27": "F24", "R28": "D6",
  "T1": "H2",
  "ZG1": "M10", "ZG2": "G4", "ZG3": "M6", "ZG4": "E23", "ZG5": "H20",
  "ZG6": "D1", "ZG7": "D12", "ZG8": "H3",
  "Y1": "E9", "Y2": "A18", "Y3": "B30", "Y4": "C3", "Y5": "D12"
};

// 预计算替代色缓存
const markColorByCode = new Map(markPalette.map(c => [c.code, c]));
const alternativeColorCache = new Map();
for (const [specialCode, altCode] of Object.entries(SPECIAL_ALTERNATIVES)) {
  const altColor = markColorByCode.get(altCode);
  if (altColor) {
    alternativeColorCache.set(specialCode, altColor);
  }
}

function getAlternativeColor(specialCode) {
  return alternativeColorCache.get(specialCode) || null;
}

// ========== 查找表（全色板，无惩罚）==========

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
          const pr = paletteRgb[i].r - rVal;
          const pg = paletteRgb[i].g - gVal;
          const pb = paletteRgb[i].b - bVal;
          const dist = pr * pr + pg * pg + pb * pb;
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
    return findClosestMarkColor(targetRgb, excludeSpecial);
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

function findClosestMarkColor(targetRgb, excludeSpecial) {
  const exclude = !!excludeSpecial;
  let minDistance = Infinity;
  let closestColor = null;
  for (const color of markPalette) {
    const dr = targetRgb.r - color.rgb.r;
    const dg = targetRgb.g - color.rgb.g;
    const db = targetRgb.b - color.rgb.b;
    const distSq = dr * dr + dg * dg + db * db;
    if (distSq < minDistance) {
      minDistance = distSq;
      closestColor = color;
    }
  }
  if (!closestColor) return null;
  let result = { ...closestColor, distance: Math.sqrt(minDistance) };
  if (exclude && isSpecialColor(result.code)) {
    const alt = getAlternativeColor(result.code);
    if (alt) result = { ...alt, distance: result.distance };
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

      // 纯中位数取色（经典算法核心：独立通道中位数）
      const dominantColor = medianColor(pixelData, width, height, srcX, srcY, endX, endY);

      // 鲜艳度增强/降低
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

// ========== 颜色合并（经典 K-means） ==========

function aggregateSimilarColors(gridData, rows, cols, targetCount) {
  if (!gridData || targetCount <= 0) return gridData;

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
  if (allColors.length <= targetCount) return gridData;

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

  // K-means 初始中心：均匀采样
  const centers = [];
  const step = Math.max(1, Math.floor(uniqueColors.length / targetCount));
  for (let i = 0; i < targetCount && i * step < uniqueColors.length; i++) {
    centers.push({ ...uniqueColors[i * step].rgb });
  }
  while (centers.length < targetCount && centers.length < uniqueColors.length) {
    centers.push({ ...uniqueColors[centers.length].rgb });
  }

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
        // 曼哈顿距离分配
        const dist = Math.abs(centers[i].r - cr) + Math.abs(centers[i].g - cg) + Math.abs(centers[i].b - cb);
        if (dist < minDist) { minDist = dist; minIdx = i; }
      }
      lastAssign[ci] = minIdx;
      clusters[minIdx].push(colorInfo);
    }

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
      const dist = Math.abs(centers[i].r - newCenter.r) + Math.abs(centers[i].g - newCenter.g) + Math.abs(centers[i].b - newCenter.b);
      if (dist > 3) { centers[i] = newCenter; changed = true; }
    }
    if (!changed) break;
  }

  // 映射中心到色板
  const centerMarkColors = centers.map(center => fastFindClosestMarkColor(center));

  // 构建 RGB → 簇索引映射
  const rgbToCenterIdx = new Map();
  for (let ci = 0; ci < uniqueColors.length; ci++) {
    const colorInfo = uniqueColors[ci];
    const key = (colorInfo.rgb.r << 16) | (colorInfo.rgb.g << 8) | colorInfo.rgb.b;
    rgbToCenterIdx.set(key, lastAssign[ci]);
  }

  // 应用到所有格子
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
  const contrast = 1.0 + scale * 0.5;
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
  getAlternativeColor,
  enhanceVibrant,
  reduceVibrant
};
