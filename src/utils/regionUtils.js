/**
 * 大区编号工具函数
 * 用于生成、解析大区编号，以及获取大区内的色块位置
 */

// 大区常量：每个大区包含 10x10 个色块
const REGION_SIZE = 10;

/**
 * 生成列编号：A, B, ..., Z, AA, AB, ...
 * @param {number} colIndex - 列索引（从0开始）
 * @returns {string} 列编号
 */
function getColCode(colIndex) {
  let code = '';
  while (colIndex >= 0) {
    code = String.fromCharCode(65 + (colIndex % 26)) + code;
    colIndex = Math.floor(colIndex / 26) - 1;
  }
  return code;
}

/**
 * 解析大区编号（如 B1）-> 起始行列
 * @param {string} code - 大区编号
 * @returns {object|null} { colIndex, rowIndex } 或 null
 */
function parseRegionCode(code) {
  if (!code) return null;
  // 提取列字母和行数字（不区分大小写）
  const match = code.toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;

  const colLetters = match[1];
  const rowNum = parseInt(match[2], 10);

  // 转换列字母为列索引（从 0 开始）
  let colIndex = 0;
  for (let i = 0; i < colLetters.length; i++) {
    colIndex = colIndex * 26 + (colLetters.charCodeAt(i) - 64);
  }
  colIndex -= 1; // 转为从 0 开始

  // 行号从 1 开始，转换为从 0 开始
  const rowIndex = rowNum - 1;

  return { colIndex, rowIndex };
}

/**
 * 获取大区内的所有色块位置
 * @param {string} regionCode - 大区编号（如 A1, B2）
 * @param {number} cols - 总列数
 * @param {number} rows - 总行数
 * @returns {Array} [{ row, col }, ...]
 */
function getRegionCells(regionCode, cols, rows) {
  const parsed = parseRegionCode(regionCode);
  if (!parsed) return [];

  const { colIndex, rowIndex } = parsed;

  // 计算大区起始行列（每个大区 REGION_SIZE 个色块）
  const regionStartCol = colIndex * REGION_SIZE;
  const regionStartRow = rowIndex * REGION_SIZE;

  // 检查是否超出范围
  if (regionStartCol >= cols || regionStartRow >= rows) {
    return [];
  }

  const positions = [];
  // 遍历大区内的所有色块
  for (let row = regionStartRow; row < regionStartRow + REGION_SIZE && row < rows; row++) {
    for (let col = regionStartCol; col < regionStartCol + REGION_SIZE && col < cols; col++) {
      positions.push({ row, col });
    }
  }
  return positions;
}

module.exports = {
  REGION_SIZE,
  getColCode,
  parseRegionCode,
  getRegionCells
};
