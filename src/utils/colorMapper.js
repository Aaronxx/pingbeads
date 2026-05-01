/**
 * 颜色映射算法模块
 * 将 RGB 颜色映射到 Mark 色号
 * 优化：使用预计算的查找表加速
 */

const { markPalette } = require('../data/colorPalettes');

// 特殊色系列（不包括在普通色中）
const SPECIAL_SERIES = ['P', 'Q', 'R', 'T', 'Y', 'ZG'];

// 预构建特殊色系列前缀的 Set，用于 O(1) 查找
const specialSeriesSet = new Set(SPECIAL_SERIES);

/**
 * 判断色号是否为特殊色系列
 * @param {string} code - 色号（如 "P1", "ZG2", "R10"）
 * @returns {boolean}
 */
function isSpecialColor(code) {
  if (!code) return false;
  // 检查字母前缀是否在特殊色系列中（使用 Set 查找）
  const prefix = code.match(/^[A-Z]+/);
  return prefix && specialSeriesSet.has(prefix[0]);
}

/**
 * 特殊色替代映射表
 * 每个特殊色映射到最接近的普通色
 * 由脚本自动生成
 */
const SPECIAL_ALTERNATIVES = {
  "P1": "H1",
  "P2": "H3",
  "P3": "B28",
  "P4": "F14",
  "P5": "A7",
  "P6": "B6",
  "P7": "F17",
  "P8": "A20",
  "P9": "H14",
  "P10": "E24",
  "P11": "H13",
  "P12": "H9",
  "P13": "C28",
  "P14": "B25",
  "P15": "M3",
  "P16": "A6",
  "P17": "G6",
  "P18": "F16",
  "P19": "H18",
  "P20": "F22",
  "P21": "A23",
  "P22": "F24",
  "P23": "G14",
  "Q1": "E3",
  "Q2": "A21",
  "Q3": "B1",
  "Q4": "H12",
  "Q5": "C24",
  "R1": "F15",
  "R2": "E6",
  "R3": "A10",
  "R4": "B1",
  "R5": "B5",
  "R6": "C19",
  "R7": "C19",
  "R8": "C8",
  "R9": "D7",
  "R10": "A8",
  "R11": "H1",
  "R12": "H14",
  "R13": "H5",
  "R14": "C25",
  "R15": "C24",
  "R16": "C15",
  "R17": "B25",
  "R18": "B6",
  "R19": "B29",
  "R20": "A23",
  "R21": "G13",
  "R22": "G8",
  "R23": "A18",
  "R24": "E15",
  "R25": "M14",
  "R26": "D12",
  "R27": "F24",
  "R28": "D6",
  "T1": "H2",
  "ZG1": "M10",
  "ZG2": "G4",
  "ZG3": "M6",
  "ZG4": "E23",
  "ZG5": "H20",
  "ZG6": "D1",
  "ZG7": "D12",
  "ZG8": "H3",
  "Y1": "E3",
  "Y2": "G12",
  "Y3": "B13",
  "Y4": "C4",
  "Y5": "D18"
};

// 预计算替代色信息的缓存（避免每次都调用 markPalette.find）
const alternativeColorCache = new Map();
for (const [specialCode, altCode] of Object.entries(SPECIAL_ALTERNATIVES)) {
  const altColor = markPalette.find(c => c.code === altCode);
  if (altColor) {
    alternativeColorCache.set(specialCode, altColor);
  }
}

/**
 * 根据色号获取替代色信息
 * @param {string} specialCode - 特殊色号
 * @returns {{code: string, hex: string, rgb: object}|null} 替代色信息
 */
function getAlternativeColor(specialCode) {
  return alternativeColorCache.get(specialCode) || null;
}

/**
 * 根据色号获取替代色号
 * @param {string} specialCode - 特殊色号
 * @returns {string|null} 替代色号
 */
function getAlternativeCode(specialCode) {
  return SPECIAL_ALTERNATIVES[specialCode] || null;
}

// 预计算 256×256×256 RGB 到 Mark 的映射表
// 为平衡性能和内存，使用 8-bit 精度映射
let colorLookupTable = null;

// RGB 颜色缓存（LRU），避免对相同 RGB 值的重复查找
const rgbCache = new Map();
const RGB_CACHE_MAX = 4096;

// 特殊色排除模式下的缓存
const excludeSpecialCache = new Map();
const EXCLUDE_SPECIAL_CACHE_MAX = 1024;

/**
 * 构建快速颜色查找表
 * 将 RGB 空间量化到 32×32×32 = 32768 个 bucket
 * 优化：避免函数调用，使用距离平方
 */
function buildColorLookupTable() {
  if (colorLookupTable) return;

  const resolution = 32;
  const total = resolution * resolution * resolution;
  colorLookupTable = new Array(total);

  // 预计算量化值
  const quantValues = [];
  for (let i = 0; i < resolution; i++) {
    quantValues[i] = Math.round(i * 255 / (resolution - 1));
  }

  // 预计算 markPalette 的 RGB 值，避免每次都访问
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

        // 找到最接近的 Mark 颜色（使用距离平方避免 sqrt）
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

// 延迟初始化查找表，避免阻塞小程序启动
let lookupTableReady = false;

/**
 * 初始化查找表
 */
function initColorLookupTable() {
  if (lookupTableReady) return;
  buildColorLookupTable();
  lookupTableReady = true;
}

// 不再在模块加载时同步初始化，改为延迟初始化

/**
 * 计算两个 RGB 颜色之间的欧氏距离
 * @param {{r: number, g: number, b: number}} color1 - 颜色1
 * @param {{r: number, g: number, b: number}} color2 - 颜色2
 * @returns {number} 欧氏距离
 */
function euclideanDistance(color1, color2) {
  return Math.sqrt(
    Math.pow(color1.r - color2.r, 2) +
    Math.pow(color1.g - color2.g, 2) +
    Math.pow(color1.b - color2.b, 2)
  );
}

/**
 * 将 RGB 颜色转换为十六进制
 * @param {{r: number, g: number, b: number}} rgb - RGB 对象
 * @returns {string} 十六进制颜色值
 */
function rgbToHex(rgb) {
  const toHex = (n) => {
    const hex = Math.round(n).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`.toUpperCase();
}

/**
 * 将十六进制转换为 RGB
 * @param {string} hex - 十六进制颜色值
 * @returns {{r: number, g: number, b: number}} RGB 对象
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    };
  }
  // 处理 3 位简写
  const shortResult = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex);
  if (shortResult) {
    return {
      r: parseInt(shortResult[1] + shortResult[1], 16),
      g: parseInt(shortResult[2] + shortResult[2], 16),
      b: parseInt(shortResult[3] + shortResult[3], 16)
    };
  }
  return { r: 0, g: 0, b: 0 };
}

/**
 * 快速查找最接近的 Mark 色号（使用查找表）
 * @param {{r: number, g: number, b: number}} targetRgb - 目标 RGB 颜色
 * @param {boolean} excludeSpecial - 是否排除特殊色（使用替代色），默认 false
 * @returns {{code: string, hex: string, rgb: {r: number, g: number, b: number}}}
 */
function fastFindClosestMarkColor(targetRgb, excludeSpecial = false) {
  // 确保查找表已初始化（延迟初始化）
  if (!lookupTableReady) {
    initColorLookupTable();
  }

  // 使用更粗粒度的缓存键（除以4，64级）
  const rq = Math.floor(targetRgb.r / 4);
  const gq = Math.floor(targetRgb.g / 4);
  const bq = Math.floor(targetRgb.b / 4);
  const cacheKey = (rq << 12) | (gq << 6) | bq | (excludeSpecial ? 262144 : 0);

  // 根据 excludeSpecial 选择不同的缓存
  const cache = excludeSpecial ? excludeSpecialCache : rgbCache;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  if (!colorLookupTable) {
    return findClosestMarkColor(targetRgb, excludeSpecial);
  }

  const resolution = 32;
  // 量化到 32 级
  const rIdx = Math.min(resolution - 1, Math.floor(targetRgb.r * resolution / 256));
  const gIdx = Math.min(resolution - 1, Math.floor(targetRgb.g * resolution / 256));
  const bIdx = Math.min(resolution - 1, Math.floor(targetRgb.b * resolution / 256));

  let result = colorLookupTable[rIdx * resolution * resolution + gIdx * resolution + bIdx];

  // 如果需要排除特殊色，替换为替代色
  if (excludeSpecial && isSpecialColor(result.code)) {
    const altColor = getAlternativeColor(result.code);
    if (altColor) {
      result = altColor;
    }
  }

  // 缓存结果
  const cacheMax = excludeSpecial ? EXCLUDE_SPECIAL_CACHE_MAX : RGB_CACHE_MAX;
  if (cache.size < cacheMax) {
    cache.set(cacheKey, result);
  }

  return result;
}

/**
 * 找到最接近的 Mark 色号（精确版本）
 * @param {{r: number, g: number, b: number}} targetRgb - 目标 RGB 颜色
 * @param {boolean} excludeSpecial - 是否排除特殊色（使用替代色），默认 false
 * @returns {{code: string, hex: string, rgb: {r: number, g: number, b: number}, distance: number}}
 */
function findClosestMarkColor(targetRgb, excludeSpecial = false) {
  let minDistance = Infinity;
  let closestColor = null;

  for (const color of markPalette) {
    const distance = euclideanDistance(targetRgb, color.rgb);
    if (distance < minDistance) {
      minDistance = distance;
      closestColor = color;
    }
  }

  let result = {
    ...closestColor,
    distance: minDistance
  };

  // 如果需要排除特殊色，替换为替代色
  if (excludeSpecial && isSpecialColor(result.code)) {
    const altColor = getAlternativeColor(result.code);
    if (altColor) {
      result = {
        ...altColor,
        distance: minDistance  // 保留原始距离
      };
    }
  }

  return result;
}

/**
 * 将 RGB 颜色映射到 Mark 色号
 * @param {number} r - 红色通道 (0-255)
 * @param {number} g - 绿色通道 (0-255)
 * @param {number} b - 蓝色通道 (0-255)
 * @param {boolean} excludeSpecial - 是否排除特殊色，默认 false
 * @returns {{code: string, hex: string, rgb: {r: number, g: number, b: number}}}
 */
function rgbToMark(r, g, b, excludeSpecial = false) {
  const targetRgb = { r, g, b };
  const result = findClosestMarkColor(targetRgb, excludeSpecial);
  // 移除 distance 字段，因为调用者不需要
  const { distance, ...colorInfo } = result;
  return colorInfo;
}

/**
 * 将十六进制颜色映射到 Mark 色号
 * @param {string} hex - 十六进制颜色值
 * @param {boolean} excludeSpecial - 是否排除特殊色，默认 false
 * @returns {{code: string, hex: string, rgb: {r: number, g: number, b: number}}}
 */
function hexToMark(hex, excludeSpecial = false) {
  const rgb = hexToRgb(hex);
  return rgbToMark(rgb.r, rgb.g, rgb.b, excludeSpecial);
}

/**
 * 批量映射颜色数组
 * @param {Array<{r: number, g: number, b: number}>} colors - RGB 颜色数组
 * @param {boolean} excludeSpecial - 是否排除特殊色，默认 false
 * @returns {Array<{code: string, hex: string, rgb: {r: number, g: number, b: number}}>}
 */
function batchMapColors(colors, excludeSpecial = false) {
  return colors.map(color => rgbToMark(color.r, color.g, color.b, excludeSpecial));
}

module.exports = {
  euclideanDistance,
  rgbToHex,
  hexToRgb,
  fastFindClosestMarkColor,
  findClosestMarkColor,
  rgbToMark,
  hexToMark,
  batchMapColors,
  markPalette,
  isSpecialColor,
  SPECIAL_SERIES,
  SPECIAL_ALTERNATIVES,
  getAlternativeColor,
  getAlternativeCode
};
