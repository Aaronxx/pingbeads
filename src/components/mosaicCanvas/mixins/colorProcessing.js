/**
 * 颜色处理 mixin：特殊色替换、鲜艳度增强/降低、原始颜色恢复
 */
const { isSpecialColor, getAlternativeColor, batchMapColors } = require('../../../utils/colorMapper');
const { aggregateSimilarColors, enhanceVibrant } = require('../../../utils/imageProcessor');
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
      // vibrant=0 时同样需要执行颜色聚合 (修复：原实现在此分支漏掉聚合，
      // 导致 vibrant=0 + mergeThreshold>0 时不聚类的 bug)
      const mergeThreshold0 = this.data.mergeThreshold;
      if (mergeThreshold0 > 0) {
        aggregateSimilarColors(gridData, rows, cols, mergeThreshold0, { legacy: this.data.useLegacyAggregation });
      }
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
          processedColor = this.reduceVibrant(cell.rawRgb, Math.abs(vibrantScale) / 10);
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
      aggregateSimilarColors(gridData, rows, cols, mergeThreshold, { legacy: this.data.useLegacyAggregation });
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

  reduceVibrant(rgb, scale) {
    if (!rgb) return rgb;

    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;

    let h = 0, s = max === 0 ? 0 : d / max, v = max;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }

    s = Math.max(0, s * (1 - scale * 0.5));
    v = Math.max(0, v * (1 - scale * 0.2));

    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    let rn, gn, bn;

    switch (i % 6) {
      case 0: rn = v; gn = t; bn = p; break;
      case 1: rn = q; gn = v; bn = p; break;
      case 2: rn = p; gn = v; bn = t; break;
      case 3: rn = p; gn = q; bn = v; break;
      case 4: rn = t; gn = p; bn = v; break;
      case 5: rn = v; gn = p; bn = q; break;
    }

    const contrast = 1.0 - scale * 0.3;
    return {
      r: Math.max(0, Math.min(255, Math.round(128 + (rn * 255 - 128) * contrast))),
      g: Math.max(0, Math.min(255, Math.round(128 + (gn * 255 - 128) * contrast))),
      b: Math.max(0, Math.min(255, Math.round(128 + (bn * 255 - 128) * contrast)))
    };
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
