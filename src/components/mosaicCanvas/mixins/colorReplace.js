/**
 * 颜色替换 mixin：单色替换、大区替换、马赛克模式同步
 */
const { getRegionCells } = require('../../../utils/regionUtils');
const { findColorHexByCode } = require('../../../utils/gridHelpers');

module.exports = {
  _findColorHexByCode(code) {
    return findColorHexByCode(code);
  },

  replaceColor(fromCode, toCode, scope, positions) {
    if (this.data.processMode === 'mosaic' && this.cachedGridData && this.cachedGridInfo) {
      return this._replaceColorInSegments(fromCode, toCode, scope, positions);
    }

    if (!this.cachedGridData || !this.cachedGridInfo) {
      return { success: false, message: '没有可替换的数据' };
    }

    const { cols, rows, gridSize } = this.cachedGridInfo;
    const gridData = this.cachedGridData;

    const toColorHex = this._findColorHexByCode(toCode);
    if (!toColorHex) {
      return { success: false, message: '替换色号不存在' };
    }

    let startCol = 0, endCol = cols - 1, startRow = 0, endRow = rows - 1;
    let positionSet = null;

    if (positions && positions.length > 0) {
      // 性能：构造 "row,col" 字符串集合，O(1) 判断是否在替换范围内
      // （原实现 positionList.find O(n) 嵌套在 row×col 循环里，复杂度 O(rows*cols*positions)）
      positionSet = new Set();
      // 先用首元素初始化边界，再做单遍 min/max
      const p0 = positions[0];
      let minC = p0.col !== undefined ? p0.col : p0[1];
      let maxC = minC;
      let minR = p0.row !== undefined ? p0.row : p0[0];
      let maxR = minR;
      for (const p of positions) {
        const r = p.row !== undefined ? p.row : p[0];
        const c = p.col !== undefined ? p.col : p[1];
        positionSet.add(r + ',' + c);
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
      }
      startCol = minC;
      endCol = maxC;
      startRow = minR;
      endRow = maxR;
    } else if (scope === 'visible') {
      const visibleRange = this.getVisibleRange();
      if (visibleRange) {
        startCol = visibleRange.startCol;
        endCol = visibleRange.endCol;
        startRow = visibleRange.startRow;
        endRow = visibleRange.endRow;
      }
    }

    const replacedPositions = [];
    let count = 0;

    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const cell = gridData[row] && gridData[row][col];
        if (!cell || !cell.markCode) continue;

        if (positionSet && !positionSet.has(row + ',' + col)) continue;

        if (cell.markCode === fromCode) {
          replacedPositions.push({
            row,
            col,
            oldCode: cell.markCode,
            oldHex: cell.markHex
          });

          cell.markCode = toCode;
          cell.markHex = toColorHex;
          count++;
        }
      }
    }

    if (count === 0) {
      return { success: false, message: '没有找到匹配的色块', count: 0 };
    }

    const stats = this.calculateStats(gridData, rows, cols);
    this.setData({
      gridInfo: { cols, rows, gridSize }
    });
    this.triggerEvent('statsUpdate', { stats: stats });

    setTimeout(() => {
      this.renderToCanvas(gridData, cols, rows, gridSize);
    }, 50);

    return {
      success: true,
      count,
      positions: replacedPositions
    };
  },

  _replaceColorInSegments(fromCode, toCode, scope, positions) {
    const { cols, rows, gridSize } = this.cachedGridInfo;
    const gridData = this.cachedGridData;

    if (!gridData) {
      return { success: false, message: '没有可替换的数据' };
    }

    const toColorHex = this._findColorHexByCode(toCode);
    if (!toColorHex) {
      return { success: false, message: '替换色号不存在' };
    }

    let startCol = 0, endCol = cols - 1, startRow = 0, endRow = rows - 1;
    let positionSet = null;

    if (positions && positions.length > 0) {
      // 性能：构造 Set 用于 O(1) 判断（同 replaceColor）
      positionSet = new Set();
      const p0 = positions[0];
      let minC = p0.col !== undefined ? p0.col : p0[1];
      let maxC = minC;
      let minR = p0.row !== undefined ? p0.row : p0[0];
      let maxR = minR;
      for (const p of positions) {
        const r = p.row !== undefined ? p.row : p[0];
        const c = p.col !== undefined ? p.col : p[1];
        positionSet.add(r + ',' + c);
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
      }
      startCol = minC;
      endCol = maxC;
      startRow = minR;
      endRow = maxR;
    }

    const replacedPositions = [];
    let count = 0;

    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const cell = gridData[row] && gridData[row][col];
        if (!cell || !cell.markCode) continue;

        if (positionSet && !positionSet.has(row + ',' + col)) continue;

        if (cell.markCode === fromCode) {
          replacedPositions.push({
            row,
            col,
            oldCode: cell.markCode,
            oldHex: cell.markHex
          });

          cell.markCode = toCode;
          cell.markHex = toColorHex;
          count++;
        }
      }
    }

    if (count === 0) {
      return { success: false, message: '没有找到匹配的色块', count: 0 };
    }

    if (this.cachedSegments) {
      for (const pos of replacedPositions) {
        const segment = this.cachedSegments.find(s => s.row === pos.row && s.col === pos.col);
        if (segment) {
          segment.markCode = toCode;
          segment.markHex = toColorHex;
        }
      }
    }

    const stats = this.calculateStats(gridData, rows, cols);
    this.triggerEvent('statsUpdate', { stats: stats });

    setTimeout(() => {
      this.renderToCanvas(gridData, cols, rows, gridSize);
    }, 50);

    return {
      success: true,
      count,
      positions: replacedPositions
    };
  },

  _replaceByRegionInSegments(regionCode, fromCode, toCode) {
    const { cols, rows, gridSize } = this.cachedGridInfo;
    const gridData = this.cachedGridData;

    if (!gridData) {
      return { success: false, message: '没有可替换的数据' };
    }

    const positions = getRegionCells(regionCode, cols, rows);
    if (positions.length === 0) {
      return { success: false, message: '大区编号无效或超出范围' };
    }

    const toColorHex = this._findColorHexByCode(toCode);
    if (!toColorHex) {
      return { success: false, message: '替换色号不存在' };
    }

    const replacedPositions = [];
    let count = 0;

    for (let i = 0; i < positions.length; i++) {
      const { row, col } = positions[i];
      const cell = gridData[row] && gridData[row][col];
      if (!cell || !cell.markCode) continue;

      if (cell.markCode === fromCode) {
        replacedPositions.push({
          row,
          col,
          oldCode: cell.markCode,
          oldHex: cell.markHex
        });

        cell.markCode = toCode;
        cell.markHex = toColorHex;
        count++;
      }
    }

    if (count === 0) {
      return { success: false, message: '该大区内没有匹配的色块', count: 0 };
    }

    if (this.cachedSegments) {
      for (const pos of replacedPositions) {
        const segment = this.cachedSegments.find(s => s.row === pos.row && s.col === pos.col);
        if (segment) {
          segment.markCode = toCode;
          segment.markHex = toColorHex;
        }
      }
    }

    const stats = this.calculateStats(gridData, rows, cols);
    this.triggerEvent('statsUpdate', { stats: stats });

    setTimeout(() => {
      this.renderToCanvas(gridData, cols, rows, gridSize);
    }, 50);

    return {
      success: true,
      count,
      positions: replacedPositions
    };
  },

  replaceByRegion(regionCode, fromCode, toCode) {
    if (this.data.processMode === 'mosaic' && this.cachedGridData && this.cachedGridInfo) {
      return this._replaceByRegionInSegments(regionCode, fromCode, toCode);
    }

    if (!this.cachedGridData || !this.cachedGridInfo) {
      return { success: false, message: '没有可替换的数据' };
    }

    const { cols, rows, gridSize } = this.cachedGridInfo;
    const gridData = this.cachedGridData;

    const positions = getRegionCells(regionCode, cols, rows);
    if (positions.length === 0) {
      return { success: false, message: '大区编号无效或超出范围' };
    }

    const toColorHex = this._findColorHexByCode(toCode);
    if (!toColorHex) {
      return { success: false, message: '替换色号不存在' };
    }

    const replacedPositions = [];
    let count = 0;

    for (let i = 0; i < positions.length; i++) {
      const { row, col } = positions[i];
      const cell = gridData[row] && gridData[row][col];
      if (!cell || !cell.markCode) continue;

      if (cell.markCode === fromCode) {
        replacedPositions.push({
          row,
          col,
          oldCode: cell.markCode,
          oldHex: cell.markHex
        });

        cell.markCode = toCode;
        cell.markHex = toColorHex;
        count++;
      }
    }

    if (count === 0) {
      return { success: false, message: '该大区内没有匹配的色块', count: 0 };
    }

    const stats = this.calculateStats(gridData, rows, cols);
    this.setData({
      gridInfo: { cols, rows, gridSize }
    });
    this.triggerEvent('statsUpdate', { stats: stats });

    this.renderToCanvas(gridData, cols, rows, gridSize);

    return {
      success: true,
      count,
      positions: replacedPositions
    };
  }
};
