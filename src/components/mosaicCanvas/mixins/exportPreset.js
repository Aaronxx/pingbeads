/**
 * 导出与网格预设 mixin：导出数据获取、网格截取/填充、分块统计
 */

module.exports = {
  getExportData() {
    if (this.data.processMode === 'mosaic' && this.cachedGridData && this.cachedGridInfo) {
      return {
        gridInfo: this.cachedGridInfo,
        gridData: this.cachedGridData,
        segments: this.cachedSegments,
        imageWidth: this.cachedSegmentsWidth,
        imageHeight: this.cachedSegmentsHeight
      };
    }
    return {
      gridInfo: this.cachedGridInfo,
      gridData: this.cachedGridData
    };
  },

  _applyGridPreset(gridData, cols, rows, presetOverride) {
    const preset = presetOverride || this.data.gridPreset;
    const presetIndex = preset[0];
    const targetCols = preset[1];
    const targetRows = preset[2];

    if (presetIndex === 0 || targetCols === 0 || targetRows === 0) {
      this._cropOffsetCol = 0;
      this._cropOffsetRow = 0;
      return { gridData, cols, rows };
    }

    const startCol = Math.max(0, Math.floor((cols - targetCols) / 2));
    const startRow = Math.max(0, Math.floor((rows - targetRows) / 2));

    this._cropOffsetCol = startCol;
    this._cropOffsetRow = startRow;

    const newCols = targetCols;
    const newRows = targetRows;
    const newGridData = [];

    for (let r = 0; r < newRows; r++) {
      newGridData[r] = [];
      for (let c = 0; c < newCols; c++) {
        const srcR = startRow + r;
        const srcC = startCol + c;
        if (srcR >= 0 && srcR < rows && srcC >= 0 && srcC < cols && gridData[srcR] && gridData[srcR][srcC]) {
          newGridData[r][c] = { ...gridData[srcR][srcC] };
        } else {
          newGridData[r][c] = {
            x: c * (gridData[0] && gridData[0][0] ? gridData[0][0].width || 10 : 10),
            y: r * (gridData[0] && gridData[0][0] ? gridData[0][0].height || 10 : 10),
            width: gridData[0] && gridData[0][0] ? gridData[0][0].width || 10 : 10,
            height: gridData[0] && gridData[0][0] ? gridData[0][0].height || 10 : 10,
            rawRgb: { r: 240, g: 240, b: 240 },
            originalRgb: { r: 240, g: 240, b: 240 },
            originalMarkCode: '',
            markCode: '',
            markHex: '#F0F0F0',
            markRgb: { r: 240, g: 240, b: 240 },
            isEmpty: true
          };
        }
      }
    }

    return { gridData: newGridData, cols: newCols, rows: newRows };
  },

  getSplitStats(splitMode) {
    if (!this.cachedGridData || !this.cachedGridInfo) return null;
    const { cols, rows } = this.cachedGridInfo;
    const gridData = this.cachedGridData;

    const parts = [];
    const partNames = {
      horizontal: ['上半', '下半'],
      vertical: ['左侧', '右侧'],
      grid2x2: ['左上', '右上', '左下', '右下'],
      grid52: [],
      grid104: []
    };

    const midRow = Math.floor(rows / 2);
    const midCol = Math.floor(cols / 2);

    const extractPart = (startRow, endRow, startCol, endCol, blockSize) => {
      const targetRows = blockSize || (endRow - startRow);
      const targetCols = blockSize || (endCol - startCol);
      const partGridData = [];

      for (let r = 0; r < targetRows; r++) {
        const newRow = [];
        for (let c = 0; c < targetCols; c++) {
          const actualR = startRow + r;
          const actualC = startCol + c;
          const cell = (actualR < rows && actualC < cols) ? (gridData[actualR] && gridData[actualR][actualC]) : null;
          newRow.push(cell ? { ...cell } : null);
        }
        partGridData.push(newRow);
      }
      const stats = this.calculateStats(partGridData, targetRows, targetCols);
      return { gridData: partGridData, rows: targetRows, cols: targetCols, stats };
    };

    if (splitMode === 'horizontal') {
      parts.push(extractPart(0, midRow, 0, cols));
      parts.push(extractPart(midRow, rows, 0, cols));
    } else if (splitMode === 'vertical') {
      parts.push(extractPart(0, rows, 0, midCol));
      parts.push(extractPart(0, rows, midCol, cols));
    } else if (splitMode === 'grid2x2') {
      parts.push(extractPart(0, midRow, 0, midCol));
      parts.push(extractPart(0, midRow, midCol, cols));
      parts.push(extractPart(midRow, rows, 0, midCol));
      parts.push(extractPart(midRow, rows, midCol, cols));
    } else if (splitMode === 'grid52' || splitMode === 'grid104') {
      const blockSize = splitMode === 'grid52' ? 52 : 104;
      for (let r = 0; r < rows; r += blockSize) {
        for (let c = 0; c < cols; c += blockSize) {
          parts.push(extractPart(r, r + blockSize, c, c + blockSize, blockSize));
          partNames[splitMode].push((parts.length) + '/' + Math.ceil(rows / blockSize) * Math.ceil(cols / blockSize));
        }
      }
      const totalParts = parts.length;
      partNames[splitMode] = partNames[splitMode].map((_, i) => (i + 1) + '/' + totalParts);
    } else {
      return null;
    }

    const names = partNames[splitMode];
    return parts.map((p, i) => ({ ...p, name: names[i] }));
  }
};
