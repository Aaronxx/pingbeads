/**
 * 裁剪相关纯函数（脱离 WeChat 组件依赖，可单独测试）
 *
 * 这些函数从 mosaicCanvas 组件提取，封装裁剪坐标计算、网格裁取、缩放限制等逻辑。
 * 组件方法作为薄包装，负责读 this.data / this.* 并调用这些纯函数。
 */

/**
 * 计算 baseScale：原图网格缩放到 canvas 里的基础比例（不放大，最大 1）
 * 在 cropHelpers 4 处使用（recalcCropWindow / getCropModeMaxScale / computeCropStartCell / computeInitialCropWindow）
 *
 * @param {number} origCols - 原图列数
 * @param {number} origRows - 原图行数
 * @param {number} gridSize - 每格像素大小
 * @param {number} canvasW - canvas CSS 宽度
 * @param {number} canvasH - canvas CSS 高度
 * @returns {number} baseScale（0 < baseScale ≤ 1）
 */
function computeBaseScale(origCols, origRows, gridSize, canvasW, canvasH) {
  return Math.min(
    origCols * gridSize > 0 ? canvasW / (origCols * gridSize) : 1,
    origRows * gridSize > 0 ? canvasH / (origRows * gridSize) : 1,
    1
  );
}

/**
 * 从原图快照裁出指定起始位置的子网格（纯函数，无副作用）
 *
 * @param {Array} originalGrid - 原图完整网格数据（二维数组）
 * @param {number} startCol - 起始列（原图坐标）
 * @param {number} startRow - 起始行（原图坐标）
 * @param {number} targetCols - 目标列数
 * @param {number} targetRows - 目标行数
 * @returns {{ gridData: Array }} 裁剪后的网格数据
 */
function applyCustomCrop(originalGrid, startCol, startRow, targetCols, targetRows) {
  const origRows = originalGrid.length;
  const origCols = originalGrid[0] ? originalGrid[0].length : 0;
  const newGridData = [];

  for (let r = 0; r < targetRows; r++) {
    newGridData[r] = [];
    for (let c = 0; c < targetCols; c++) {
      const srcR = startRow + r;
      const srcC = startCol + c;
      if (srcR >= 0 && srcR < origRows && srcC >= 0 && srcC < origCols
          && originalGrid[srcR] && originalGrid[srcR][srcC]) {
        newGridData[r][c] = { ...originalGrid[srcR][srcC] };
      } else {
        const refCell = originalGrid[0] && originalGrid[0][0] ? originalGrid[0][0] : { width: 10, height: 10 };
        newGridData[r][c] = {
          x: c * (refCell.width || 10),
          y: r * (refCell.height || 10),
          width: refCell.width || 10,
          height: refCell.height || 10,
          rawRgb: { r: 240, g: 240, b: 240 },
          originalRgb: { r: 240, g: 240, b: 240 },
          markCode: '',
          markHex: '#F0F0F0',
          markRgb: { r: 240, g: 240, b: 240 },
          isEmpty: true
        };
      }
    }
  }
  return { gridData: newGridData };
}

/**
 * 由裁剪框 CSS 位置反算网格起始行列（含镜像翻转逻辑）
 *
 * @param {Object} opts
 * @param {number} opts.cropWinX - 裁剪框左上角 X（CSS px）
 * @param {number} opts.cropWinY - 裁剪框左上角 Y（CSS px）
 * @param {number} opts.canvasW - canvas CSS 宽度
 * @param {number} opts.canvasH - canvas CSS 高度
 * @param {number} opts.userScale - 当前缩放比例
 * @param {number} opts.origCols - 原图列数
 * @param {number} opts.origRows - 原图行数
 * @param {number} opts.gridSize - 每格像素大小
 * @param {boolean} opts.mirrorImage - 是否镜像
 * @param {number} opts.targetCols - 目标列数
 * @param {number} opts.targetRows - 目标行数
 * @returns {{ startCol: number, startRow: number }}
 */
function computeCropStartCell(opts) {
  const { cropWinX, cropWinY, canvasW, canvasH, userScale,
    origCols, origRows, gridSize, mirrorImage, targetCols, targetRows } = opts;

  const baseScale = computeBaseScale(origCols, origRows, gridSize, canvasW, canvasH);
  const cssCellSize = gridSize * baseScale * userScale;
  const cssGridOffsetX = (canvasW - origCols * cssCellSize) / 2;
  const cssGridOffsetY = (canvasH - origRows * cssCellSize) / 2;

  let startCol = Math.round((cropWinX - cssGridOffsetX) / cssCellSize);
  let startRow = Math.round((cropWinY - cssGridOffsetY) / cssCellSize);

  // 镜像模式下，预览视觉左右翻转（col=0 在右），cropWinX 是视觉位置。
  // 反算的 startCol 对应镜像后的列号，需翻转回原始数据的列号。
  if (mirrorImage) {
    startCol = origCols - targetCols - startCol;
  }

  // clamp 到原图范围内
  startCol = Math.max(0, Math.min(origCols - targetCols, startCol));
  startRow = Math.max(0, Math.min(origRows - targetRows, startRow));

  return { startCol, startRow };
}

/**
 * 裁剪模式下缩放上限：放大到最大时，裁剪框两侧各留 2 格色块的可见空间
 *
 * @param {Object} opts
 * @param {number} opts.origCols - 原图列数
 * @param {number} opts.origRows - 原图行数
 * @param {number} opts.gridSize - 每格像素大小
 * @param {number} opts.canvasW - canvas CSS 宽度
 * @param {number} opts.canvasH - canvas CSS 高度
 * @param {number} opts.targetCols - 目标列数
 * @param {number} opts.targetRows - 目标行数
 * @returns {number} 最大缩放比例（≥ 1）
 */
function getCropModeMaxScale(opts) {
  const { origCols, origRows, gridSize, canvasW, canvasH, targetCols, targetRows } = opts;
  const baseScale = computeBaseScale(origCols, origRows, gridSize, canvasW, canvasH);
  // 最大时：裁剪框 + 两侧各 2 格 ≤ canvas，即占用 (targetCols + 4) 格宽
  // 但不能超过原图本身的格数，否则会算出过大的上限
  const availColsW = Math.min(origCols, targetCols + 4);
  const availRowsH = Math.min(origRows, targetRows + 4);
  const maxByW = canvasW / (availColsW * gridSize * baseScale);
  const maxByH = canvasH / (availRowsH * gridSize * baseScale);
  return Math.max(1, Math.min(maxByW, maxByH));
}

/**
 * 缩放变化后重算裁剪框尺寸和位置（保持中心点不变）
 *
 * @param {Object} opts
 * @param {number} opts.canvasW, opts.canvasH - canvas CSS 尺寸
 * @param {number} opts.userScale - 新缩放比例
 * @param {number} opts.origCols, opts.origRows - 原图行列数
 * @param {number} opts.gridSize - 每格像素大小
 * @param {number} opts.targetCols, opts.targetRows - 预设目标行列数
 * @param {number} opts.prevCropWinX/Y/W/H - 缩放前的裁剪框位置/尺寸
 * @returns {{ cropWinX, cropWinY, cropWinW, cropWinH }}
 */
function recalcCropWindow(opts) {
  const { canvasW, canvasH, userScale, origCols, origRows, gridSize,
    targetCols, targetRows, prevCropWinX, prevCropWinY, prevCropWinW, prevCropWinH } = opts;

  const baseScale = computeBaseScale(origCols, origRows, gridSize, canvasW, canvasH);
  const newCellSize = gridSize * baseScale * userScale;
  const newCropWinW = targetCols * newCellSize;
  const newCropWinH = targetRows * newCellSize;

  // 保持裁剪框中心点不变
  const oldCenterX = (prevCropWinX || 0) + (prevCropWinW || 0) / 2;
  const oldCenterY = (prevCropWinY || 0) + (prevCropWinH || 0) / 2;
  let newCropWinX = oldCenterX - newCropWinW / 2;
  let newCropWinY = oldCenterY - newCropWinH / 2;

  // clamp 到 canvas 范围
  const maxX = Math.max(0, canvasW - newCropWinW);
  const maxY = Math.max(0, canvasH - newCropWinH);
  newCropWinX = Math.max(0, Math.min(maxX, newCropWinX));
  newCropWinY = Math.max(0, Math.min(maxY, newCropWinY));

  return { cropWinX: newCropWinX, cropWinY: newCropWinY, cropWinW: newCropWinW, cropWinH: newCropWinH };
}

/**
 * 首次进入 cropMode 时计算裁剪框初始位置和尺寸（居中，userScale=1）
 *
 * @param {Object} opts
 * @param {number} opts.canvasW, opts.canvasH - canvas CSS 尺寸
 * @param {number} opts.origCols, opts.origRows - 原图行列数
 * @param {number} opts.gridSize - 每格像素大小
 * @param {number} opts.targetCols, opts.targetRows - 预设目标行列数
 * @returns {{ cropWinX, cropWinY, cropWinW, cropWinH }}
 */
function computeInitialCropWindow(opts) {
  const { canvasW, canvasH, origCols, origRows, gridSize, targetCols, targetRows } = opts;
  const baseScale = computeBaseScale(origCols, origRows, gridSize, canvasW, canvasH);
  const cssCellSize = gridSize * baseScale; // userScale = 1
  const cropWinW = targetCols * cssCellSize;
  const cropWinH = targetRows * cssCellSize;
  const cropWinX = (canvasW - cropWinW) / 2;
  const cropWinY = (canvasH - cropWinH) / 2;
  return { cropWinX, cropWinY, cropWinW, cropWinH };
}

module.exports = {
  computeBaseScale,
  applyCustomCrop,
  computeCropStartCell,
  getCropModeMaxScale,
  recalcCropWindow,
  computeInitialCropWindow
};
