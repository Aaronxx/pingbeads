/**
 * Shared color and Mark code helpers.
 */

// 色板只有 291 种 hex，缓存命中后零开销（渲染热路径每格调用一次）
const _isLightCache = new Map();

function isLightColor(hex) {
  if (!hex) return false;
  const cached = _isLightCache.get(hex);
  if (cached !== undefined) return cached;

  const normalized = hex.replace('#', '');
  let r;
  let g;
  let b;

  if (normalized.length === 3) {
    r = parseInt(normalized[0] + normalized[0], 16);
    g = parseInt(normalized[1] + normalized[1], 16);
    b = parseInt(normalized[2] + normalized[2], 16);
  } else if (normalized.length === 6) {
    r = parseInt(normalized.substring(0, 2), 16);
    g = parseInt(normalized.substring(2, 4), 16);
    b = parseInt(normalized.substring(4, 6), 16);
  } else {
    return false;
  }

  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  const result = brightness > 150;
  _isLightCache.set(hex, result);
  return result;
}

/**
 * 格式化色号（现已不需要转换，数据已不带前缀0）
 * 保留函数以兼容可能的其他用途
 */
function formatMarkCode(code) {
  if (!code) return '';
  return code;
}

/**
 * 解析色号输入为标准格式
 * 兼容用户输入：支持 "A1", "A01", "a1", "a01" 等格式
 * 输出统一格式：不带前缀0（如 "A1"）
 */
function parseMarkCode(input) {
  if (!input) return null;
  const normalized = input.toUpperCase().trim();
  // 支持单字母(A-Z)或双字母(ZG等)前缀 + 数字
  const match = normalized.match(/^([A-Z]{1,2})(\d+)$/);
  if (!match) return null;
  const letter = match[1];
  const num = parseInt(match[2], 10);
  // 输出时不加前缀0，直接拼接
  return `${letter}${num}`;
}

module.exports = {
  isLightColor,
  formatMarkCode,
  parseMarkCode
};
