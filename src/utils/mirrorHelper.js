/**
 * 镜像翻转辅助函数
 * 提供水平镜像的核心算法，供预览和导出复用
 */

/**
 * 获取镜像变换后的网格数据（用于数据层）
 * @param {Array} gridData - 原始网格数据（二维数组）
 * @param {Number} cols - 列数
 * @returns {Array} 镜像后的网格数据
 */
function flipGridDataHorizontal(gridData, cols) {
  const flipped = [];
  for (let row = 0; row < gridData.length; row++) {
    const newRow = [];
    for (let col = cols - 1; col >= 0; col--) {
      newRow.push(gridData[row][col]);
    }
    flipped.push(newRow);
  }
  return flipped;
}

/**
 * 获取水平镜像坐标转换函数（用于 Canvas 渲染层）
 * @param {Number} canvasWidth - 画布宽度
 * @returns {Function} 转换函数，输入原始 x 坐标，返回镜像后的 x 坐标
 */
function createHorizontalFlipX(canvasWidth) {
  return function(x) {
    return canvasWidth - x;
  };
}

module.exports = {
  flipGridDataHorizontal,
  createHorizontalFlipX
};
