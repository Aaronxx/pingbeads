/**
 * 网格数据辅助函数（纯函数，无 this 依赖）
 */

/**
 * 深拷贝 gridData（只拷贝必要的属性，避免拷贝大对象）
 * 删除死字段：originalMarkCode/initialMark* 经核实无任何读取者
 */
function deepCloneGridData(gridData, rows, cols) {
  const cloned = [];
  for (let row = 0; row < rows; row++) {
    cloned[row] = [];
    for (let col = 0; col < cols; col++) {
      const cell = gridData[row] && gridData[row][col];
      if (cell) {
        cloned[row][col] = {
          x: cell.x,
          y: cell.y,
          width: cell.width,
          height: cell.height,
          row: cell.row,
          col: cell.col,
          rawRgb: cell.rawRgb ? { ...cell.rawRgb } : null,
          originalRgb: cell.originalRgb ? { ...cell.originalRgb } : null,
          markCode: cell.markCode,
          markHex: cell.markHex,
          markRgb: cell.markRgb ? { ...cell.markRgb } : null,
          isEdge: cell.isEdge
        };
      } else {
        cloned[row][col] = null;
      }
    }
  }
  return cloned;
}

// 模块级缓存，惰性初始化
let _codeToHexCache = null;

/**
 * 根据 Mark 色号查找对应的 hex 颜色值
 */
function findColorHexByCode(code) {
  if (!_codeToHexCache) {
    const colorPalettes = require('../data/colorPalettes.js');
    const colorMapping = colorPalettes.colorMapping;
    _codeToHexCache = new Map();
    for (const hex in colorMapping) {
      const color = colorMapping[hex];
      if (color.MARD) {
        _codeToHexCache.set(color.MARD, hex);
      }
    }
  }
  return _codeToHexCache.get(code) || null;
}

module.exports = {
  deepCloneGridData,
  findColorHexByCode
};
