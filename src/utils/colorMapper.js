/**
 * 颜色映射算法模块
 * 将 RGB 颜色映射到 Mark 色号
 */

const { markPalette } = require('../data/colorPalettes');

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
 * 找到最接近的 Mark 色号
 * @param {{r: number, g: number, b: number}} targetRgb - 目标 RGB 颜色
 * @returns {{code: string, hex: string, rgb: {r: number, g: number, b: number}, distance: number}}
 */
function findClosestMarkColor(targetRgb) {
  let minDistance = Infinity;
  let closestColor = null;

  for (const color of markPalette) {
    const distance = euclideanDistance(targetRgb, color.rgb);
    if (distance < minDistance) {
      minDistance = distance;
      closestColor = color;
    }
  }

  return {
    ...closestColor,
    distance: minDistance
  };
}

/**
 * 将 RGB 颜色映射到 Mark 色号
 * @param {number} r - 红色通道 (0-255)
 * @param {number} g - 绿色通道 (0-255)
 * @param {number} b - 蓝色通道 (0-255)
 * @returns {{code: string, hex: string, rgb: {r: number, g: number, b: number}}}
 */
function rgbToMark(r, g, b) {
  const targetRgb = { r, g, b };
  const result = findClosestMarkColor(targetRgb);
  // 移除 distance 字段，因为调用者不需要
  const { distance, ...colorInfo } = result;
  return colorInfo;
}

/**
 * 将十六进制颜色映射到 Mark 色号
 * @param {string} hex - 十六进制颜色值
 * @returns {{code: string, hex: string, rgb: {r: number, g: number, b: number}}}
 */
function hexToMark(hex) {
  const rgb = hexToRgb(hex);
  return rgbToMark(rgb.r, rgb.g, rgb.b);
}

/**
 * 批量映射颜色数组
 * @param {Array<{r: number, g: number, b: number}>} colors - RGB 颜色数组
 * @returns {Array<{code: string, hex: string, rgb: {r: number, g: number, b: number}}>}
 */
function batchMapColors(colors) {
  return colors.map(color => rgbToMark(color.r, color.g, color.b));
}

module.exports = {
  euclideanDistance,
  rgbToHex,
  hexToRgb,
  findClosestMarkColor,
  rgbToMark,
  hexToMark,
  batchMapColors,
  markPalette
};
