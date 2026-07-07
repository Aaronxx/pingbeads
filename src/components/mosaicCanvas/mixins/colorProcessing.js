/**
 * 颜色处理 mixin：特殊色替换、鲜艳度增强/降低、原始颜色恢复
 */
const { isSpecialColor, getAlternativeColor, batchMapColors, setExcludeSpecial } = require('../../../utils/colorMapper');
const { aggregateSimilarColors, enhanceVibrant, reduceVibrant } = require('../../../utils/imageProcessor');
const { deepCloneGridData } = require('../../../utils/gridHelpers');

module.exports = {
  replaceSpecialColors(gridData, rows, cols) {
    if (this.data.useSpecialColors) return;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = gridData[row] && gridData[row][col];
        if (!cell || !cell.markCode) continue;

        if (isSpecialColor(cell.markCode)) {
          const altColor = getAlternativeColor(cell.markCode);
          if (altColor) {
            cell.markCode = altColor.code;
            cell.markHex = altColor.hex;
            cell.markRgb = altColor.rgb;
          }
        }
      }
    }
  },

  reapplyVibrantScale(gridData, rows, cols) {
    const vibrantScale = this.data.vibrantScale;

    if (vibrantScale === 0) {
      this.resetToOriginalColors(gridData, rows, cols);
      if (!this.data.useSpecialColors) {
        this.replaceSpecialColors(gridData, rows, cols);
      }
      return;
    }

    const cellsToProcess = [];
    const colorsToMap = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = gridData[row] && gridData[row][col];
        if (!cell || !cell.rawRgb) continue;

        let processedColor;
        if (vibrantScale > 0) {
          processedColor = enhanceVibrant(cell.rawRgb, vibrantScale / 10);
        } else {
          processedColor = reduceVibrant(cell.rawRgb, Math.abs(vibrantScale) / 10);
        }

        cellsToProcess.push({ row, col });
        colorsToMap.push(processedColor);
      }
    }

    const mappedColors = batchMapColors(colorsToMap);

    for (let i = 0; i < cellsToProcess.length; i++) {
      const { row, col } = cellsToProcess[i];
      const cell = gridData[row][col];
      const markColor = mappedColors[i];
      cell.originalRgb = colorsToMap[i];
      cell.markCode = markColor.code;
      cell.markHex = markColor.hex;
      cell.markRgb = markColor.rgb;
    }

    const mergeThreshold = this.data.mergeThreshold;
    if (mergeThreshold > 0) {
      aggregateSimilarColors(gridData, rows, cols, mergeThreshold);
    }

    if (!this.data.useSpecialColors) {
      this.replaceSpecialColors(gridData, rows, cols);
    }
  },

  resetToOriginalColors(gridData, rows, cols) {
    const snapshot = this.cachedOriginalGridData;
    if (!snapshot) return;

    const offsetCol = this._cropOffsetCol || 0;
    const offsetRow = this._cropOffsetRow || 0;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = gridData[row] && gridData[row][col];
        const snapCell = snapshot[row + offsetRow] && snapshot[row + offsetRow][col + offsetCol];
        if (!cell || !snapCell) continue;

        cell.rawRgb = snapCell.rawRgb ? { ...snapCell.rawRgb } : null;
        cell.originalRgb = snapCell.rawRgb ? { ...snapCell.rawRgb } : null;
        cell.originalMarkCode = snapCell.originalMarkCode;
        cell.markCode = snapCell.markCode;
        cell.markHex = snapCell.markHex;
        cell.markRgb = snapCell.markRgb ? { ...snapCell.markRgb } : null;
        cell.isEdge = snapCell.isEdge;
      }
    }
  },

  deepCloneGridData(gridData, rows, cols) {
    return deepCloneGridData(gridData, rows, cols);
  },

  _applyColorAndPreset(gridData, rows, cols, gridSize) {
    this.cachedOriginalGridData = this.deepCloneGridData(gridData, rows, cols);
    this.replaceSpecialColors(gridData, rows, cols);
    this.reapplyVibrantScale(gridData, rows, cols);

    const presetResult = this._applyGridPreset(gridData, cols, rows);
    this.cachedGridData = presetResult.gridData;
    this.cachedGridInfo = { cols: presetResult.cols, rows: presetResult.rows, gridSize };

    return presetResult;
  }
};
