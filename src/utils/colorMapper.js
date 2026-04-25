/**
 * 颜色映射算法模块
 * 将 RGB 颜色映射到 Mark 色号
 * 优化：使用预计算的查找表加速
 */

const { markPalette } = require('../data/colorPalettes');

// 特殊色系列（不包括在普通色中）
const SPECIAL_SERIES = ['P', 'Q', 'R', 'T', 'ZG'];

/**
 * 判断色号是否为特殊色系列
 * @param {string} code - 色号（如 "P1", "ZG2", "R10"）
 * @returns {boolean}
 */
function isSpecialColor(code) {
  if (!code) return false;
  // 检查字母前缀是否在特殊色系列中
  const prefix = code.match(/^[A-Z]+/);
  return prefix && SPECIAL_SERIES.includes(prefix[0]);
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
  "ZG8": "H3"
};

/**
 * 根据色号获取替代色信息
 * @param {string} specialCode - 特殊色号
 * @returns {{code: string, hex: string, rgb: object}|null} 替代色信息
 */
function getAlternativeColor(specialCode) {
  const altCode = SPECIAL_ALTERNATIVES[specialCode];
  if (!altCode) return null;
  return markPalette.find(c => c.code === altCode) || null;
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

/**
 * 构建快速颜色查找表
 * 将 RGB 空间量化到 32×32×32 = 32768 个 bucket
 */
function buildColorLookupTable() {
  if (colorLookupTable) return;

  const resolution = 32;
  colorLookupTable = new Array(resolution * resolution * resolution);

  for (let r = 0; r < resolution; r++) {
    for (let g = 0; g < resolution; g++) {
      for (let b = 0; b < resolution; b++) {
        const rgb = {
          r: Math.round(r * 255 / (resolution - 1)),
          g: Math.round(g * 255 / (resolution - 1)),
          b: Math.round(b * 255 / (resolution - 1))
        };

        // 找到最接近的 Mark 颜色
        let minDistance = Infinity;
        let closestColor = markPalette[0];

        for (const color of markPalette) {
          const distance = euclideanDistance(rgb, color.rgb);
          if (distance < minDistance) {
            minDistance = distance;
            closestColor = color;
          }
        }

        colorLookupTable[r * resolution * resolution + g * resolution + b] = closestColor;
      }
    }
  }
}

// 初始化查找表
buildColorLookupTable();

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
