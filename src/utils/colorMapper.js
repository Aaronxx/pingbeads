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

/**
 * 判断 Mark 色是否为"中明度浊色"（灰扑扑的脏色）
 * 饱和度低(<0.15) 且 明度中等(70-225)。深色/浅色不算。
 */
function isMuddyMarkColor(rgb) {
  const mx = Math.max(rgb.r, rgb.g, rgb.b);
  const mn = Math.min(rgb.r, rgb.g, rgb.b);
  const s = mx === 0 ? 0 : (mx - mn) / mx;
  return s < 0.15 && mx > 70 && mx < 225;
}

/**
 * 在全色板中找离 target 最近的非浊色、非特殊色 Mark 色
 * （替代色必须是普通色，不能用特殊色替代特殊色）
 */
function findClosestNonMuddy(target) {
  let best = null, bestDist = Infinity;
  for (const c of markPalette) {
    if (isMuddyMarkColor(c.rgb)) continue;
    if (isSpecialColor(c.code)) continue;  // 排除特殊色(避免自映射)
    const dr = c.rgb.r - target.r;
    const dg = c.rgb.g - target.g;
    const db = c.rgb.b - target.b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best;
}

// 预计算替代色信息的缓存（避免每次都调用 markPalette.find）
// 预计算替代色：所有特殊色统一用"特殊色自身 RGB 找最近非浊色、非特殊色普通色"
// 这样既避开浊色(防 M10/H3 等脏色)，又保证色相匹配(以特殊色自身而非浊色替代为 target)
const alternativeColorCache = new Map();
for (const specialCode of Object.keys(SPECIAL_ALTERNATIVES)) {
  const specialColor = markPalette.find(c => c.code === specialCode);
  if (specialColor) {
    const better = findClosestNonMuddy(specialColor.rgb);
    if (better) {
      alternativeColorCache.set(specialCode, better);
    } else {
      // 兜底：用原静态表
      const altColor = markPalette.find(c => c.code === SPECIAL_ALTERNATIVES[specialCode]);
      if (altColor) alternativeColorCache.set(specialCode, altColor);
    }
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

/**
 * 根据色号获取完整的 Mark 颜色信息
 * @param {string} code - Mark 色号（如 A1, B2 等）
 * @returns {{code: string, hex: string, rgb: {r: number, g: number, b: number}}|null}
 */
function getMarkColorInfoByCode(code) {
  return markPalette.find(c => c.code === code) || null;
}

// 预计算 256×256×256 RGB 到 Mark 的映射表
// 为平衡性能和内存，使用 8-bit 精度映射
let colorLookupTable = null;      // 仅含普通色（useSpecialColors=false 用）
let specialLookupTable = null;    // 仅含特殊色（合并时用）
// 延迟初始化查找表，避免阻塞小程序启动
let lookupTableReady = false;

// 普通色 / 特殊色分离（特殊色：P/Q/R/T/Y/ZG 系列）
const normalPalette = markPalette.filter(c => !isSpecialColor(c.code));
const specialPalette = markPalette.filter(c => isSpecialColor(c.code));

// 模块级开关：是否排除特殊色（由组件层 setExcludeSpecial 控制）
// true = 映射时只考虑普通色（useSpecialColors=false），不再事后替代
let excludeSpecialGlobal = true;  // 默认 true（拼豆主流程 useSpecialColors=false）

// RGB 颜色缓存（LRU），避免对相同 RGB 值的重复查找
const rgbCache = new Map();
const RGB_CACHE_MAX = 4096;

// 特殊色排除模式下的缓存
const excludeSpecialCache = new Map();
const EXCLUDE_SPECIAL_CACHE_MAX = 1024;

/**
 * RGB → HSV（用于浊度判定）
 * @returns {{s: number, v: number}} 饱和度/明度，均归一化到 0-100
 */
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  const s = mx === 0 ? 0 : d / mx;
  return { s: s * 100, v: mx * 100 };
}

/**
 * 浊度判定（仅"明显灰扑扑"色号 > 0）
 * 判定条件：饱和度 s<35 且 明度 v∈[25,80]（既不亮也不暗的浊色）
 * 浅色(高明度)和深色(低明度)不惩罚，只打击中间的灰浊色
 * @param {{r,g,b}} rgb
 * @returns {number} 0~1 浊度，s 越低且 v 越接近 50(中灰) 越大
 */
function computeGrayness(rgb) {
  const { s, v } = rgbToHsv(rgb.r, rgb.g, rgb.b);
  if (s >= 35) return 0;            // 够鲜艳，不惩罚
  if (v < 25 || v > 80) return 0;   // 深色或浅色，保留（用户要保留）
  const sFactor = (35 - s) / 35;            // 0..1，s 越低越大
  const vFactor = 1 - Math.abs(v - 50) / 30; // 距中灰越近越大，clamp 到 [0,1]
  return Math.max(0, Math.min(1, sFactor * vFactor));
}

// 预计算每个 Mark 色号的浊度（模块加载时一次性算好）
const paletteGrayness = markPalette.map(c => computeGrayness(c.rgb));

// 浊色规避强度（0=纯欧氏距离/关闭，1=最强惩罚），默认 0 关闭
// 由 setAntiGrayIntensity 修改，修改后触发查找表重建
let antiGrayIntensity = 0;

// 距离惩罚缩放系数：把 grayness(0-1) 换算成与"距离平方"同量级
// RGB 最大距离平方 ≈ 195075，SCALE 取其 ~5% 使中等强度下惩罚可见
const ANTI_GRAY_SCALE = 10000;

/**
 * 设置浊色规避强度，触发查找表惰性重建
 * @param {number} intensity 0~1，0=关闭（纯欧氏距离），1=最强
 */
function setAntiGrayIntensity(intensity) {
  const v = Math.max(0, Math.min(1, intensity));
  if (Math.abs(v - antiGrayIntensity) < 1e-6) return;
  antiGrayIntensity = v;
  // 失效查找表与缓存，下次 fastFindClosestMarkColor 时惰性重建
  colorLookupTable = null;
  specialLookupTable = null;
  lookupTableReady = false;
  rgbCache.clear();
  excludeSpecialCache.clear();
}

/**
 * 设置是否排除特殊色（由组件层 useSpecialColors 控制）
 * true = 映射时只查普通色表（不再事后替代特殊色）
 * false = 合并普通色表和特殊色表，取最近（useSpecialColors=true 时用）
 */
function setExcludeSpecial(exclude) {
  excludeSpecialGlobal = !!exclude;
  // 切换模式失效缓存（表本身不变，但查找结果缓存要清）
  rgbCache.clear();
  excludeSpecialCache.clear();
}

/**
 * 获取当前浊色规避强度
 */
function getAntiGrayIntensity() {
  return antiGrayIntensity;
}

/**
 * 构建快速颜色查找表
 * 将 RGB 空间量化到 32×32×32 = 32768 个 bucket
 * 优化：避免函数调用，使用距离平方
 */
/**
 * 构建查找表（内部通用函数）
 * @param {Array} palette - 色板（normalPalette 或 specialPalette）
 * @param {Array} grayness - 对应的浊度数组（可选，长度与 palette 一致）
 */
function buildLookupTableFor(palette, grayness) {
  const resolution = 32;
  const total = resolution * resolution * resolution;
  const table = new Array(total);

  const quantValues = [];
  for (let i = 0; i < resolution; i++) {
    quantValues[i] = Math.round(i * 255 / (resolution - 1));
  }

  const paletteRgb = palette.map(c => c.rgb);
  const paletteLen = palette.length;

  // 浊色规避惩罚（仅对普通色表生效，特殊色表不加惩罚）
  const intensitySq = antiGrayIntensity * antiGrayIntensity;
  const penalty = new Array(paletteLen);
  for (let i = 0; i < paletteLen; i++) {
    penalty[i] = (grayness && intensitySq > 0) ? intensitySq * grayness[i] * ANTI_GRAY_SCALE : 0;
  }

  for (let r = 0; r < resolution; r++) {
    const rVal = quantValues[r];
    const rIdxOffset = r * resolution * resolution;
    for (let g = 0; g < resolution; g++) {
      const gVal = quantValues[g];
      const gIdxOffset = g * resolution;
      for (let b = 0; b < resolution; b++) {
        const bVal = quantValues[b];

        let minDistance = Infinity;
        let closestColor = palette[0];

        for (let i = 0; i < paletteLen; i++) {
          const pr = paletteRgb[i].r - rVal;
          const pg = paletteRgb[i].g - gVal;
          const pb = paletteRgb[i].b - bVal;
          const dist = pr * pr + pg * pg + pb * pb + penalty[i];
          if (dist < minDistance) {
            minDistance = dist;
            closestColor = palette[i];
          }
        }

        table[rIdxOffset + gIdxOffset + b] = closestColor;
      }
    }
  }
  return table;
}

// 普通色浊度数组（按 normalPalette 顺序）
const normalPaletteGrayness = normalPalette.map(c => computeGrayness(c.rgb));

function buildColorLookupTable() {
  if (colorLookupTable) return;
  // 普通色表（含浊色惩罚）
  colorLookupTable = buildLookupTableFor(normalPalette, normalPaletteGrayness);
  // 特殊色表（不含浊色惩罚，特殊色少且不参与浊色规避）
  if (specialPalette.length > 0) {
    specialLookupTable = buildLookupTableFor(specialPalette, null);
  }
}

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
function fastFindClosestMarkColor(targetRgb, excludeSpecial) {
  // excludeSpecial 参数优先；未传则用模块全局状态
  const exclude = (excludeSpecial !== undefined) ? excludeSpecial : excludeSpecialGlobal;

  // 确保查找表已初始化（延迟初始化）
  if (!lookupTableReady) {
    initColorLookupTable();
  }

  // 使用更粗粒度的缓存键（除以4，64级）
  const rq = Math.floor(targetRgb.r / 4);
  const gq = Math.floor(targetRgb.g / 4);
  const bq = Math.floor(targetRgb.b / 4);
  const cacheKey = (rq << 12) | (gq << 6) | bq | (exclude ? 262144 : 0);

  const cache = exclude ? excludeSpecialCache : rgbCache;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  if (!colorLookupTable) {
    return findClosestMarkColor(targetRgb, exclude);
  }

  const resolution = 32;
  const rIdx = Math.min(31, targetRgb.r >> 3);
  const gIdx = Math.min(31, targetRgb.g >> 3);
  const bIdx = Math.min(31, targetRgb.b >> 3);
  const bucketIdx = rIdx * resolution * resolution + gIdx * resolution + bIdx;

  // 普通色表的结果
  let result = colorLookupTable[bucketIdx];

  // 若不排除特殊色，比较普通色表和特殊色表，取距离更近的
  if (!exclude && specialLookupTable) {
    const specialResult = specialLookupTable[bucketIdx];
    if (specialResult) {
      const drN = specialResult.rgb.r - targetRgb.r;
      const dgN = specialResult.rgb.g - targetRgb.g;
      const dbN = specialResult.rgb.b - targetRgb.b;
      const distSpecial = drN * drN + dgN * dgN + dbN * dbN;
      const drR = result.rgb.r - targetRgb.r;
      const dgR = result.rgb.g - targetRgb.g;
      const dbR = result.rgb.b - targetRgb.b;
      const distNormal = drR * drR + dgR * dgR + dbR * dbR;
      if (distSpecial < distNormal) {
        result = specialResult;
      }
    }
  }

  const cacheMax = exclude ? EXCLUDE_SPECIAL_CACHE_MAX : RGB_CACHE_MAX;
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
function findClosestMarkColor(targetRgb, excludeSpecial) {
  const exclude = (excludeSpecial !== undefined) ? excludeSpecial : excludeSpecialGlobal;
  let minDistance = Infinity;
  let closestColor = null;

  for (const color of markPalette) {
    if (exclude && isSpecialColor(color.code)) continue;
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
function rgbToMark(r, g, b, excludeSpecial) {
  const targetRgb = { r, g, b };
  // 使用快速查找表版本，享受缓存优化（excludeSpecial 未传则用全局设置）
  const result = fastFindClosestMarkColor(targetRgb, excludeSpecial);
  return { code: result.code, hex: result.hex, rgb: result.rgb };
}

/**
 * 将十六进制颜色映射到 Mark 色号
 * @param {string} hex - 十六进制颜色值
 * @param {boolean} excludeSpecial - 是否排除特殊色，默认 false
 * @returns {{code: string, hex: string, rgb: {r: number, g: number, b: number}}}
 */
function hexToMark(hex, excludeSpecial) {
  const rgb = hexToRgb(hex);
  return rgbToMark(rgb.r, rgb.g, rgb.b, excludeSpecial);
}

/**
 * 批量映射颜色数组
 * @param {Array<{r: number, g: number, b: number}>} colors - RGB 颜色数组
 * @param {boolean} excludeSpecial - 是否排除特殊色，默认 false
 * @returns {Array<{code: string, hex: string, rgb: {r: number, g: number, b: number}}>}
 */
function batchMapColors(colors, excludeSpecial) {
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
  getAlternativeCode,
  getMarkColorInfoByCode,
  computeGrayness,
  setAntiGrayIntensity,
  setExcludeSpecial,
  getAntiGrayIntensity
};
