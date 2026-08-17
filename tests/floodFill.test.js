/**
 * BFS 连通性边缘标记锁定测试
 *
 * filterEdgeBlocks（卡通网格）与 filterEdgeSegments（马赛克 segments）
 * 内部使用同一套"从图片边缘洪泛标记与 edgeColor 连通的格子"算法。
 * 这些测试锁定当前行为，作为后续提取公共 floodFill 函数的回归基线。
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { filterEdgeBlocks, filterEdgeSegments } = require('../src/utils/imageProcessor');

/** 构造网格：外圈白色边缘 + 中间红色内容 */
function makeBorderGrid(rows, cols, borderLayers = 3) {
  const grid = [];
  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      const isBorder = r < borderLayers || r >= rows - borderLayers ||
                       c < borderLayers || c >= cols - borderLayers;
      grid[r][c] = {
        markCode: isBorder ? 'A1' : 'C4',
        markHex: isBorder ? '#FFFFFF' : '#FF0000',
        originalRgb: isBorder ? { r: 255, g: 255, b: 255 } : { r: 255, g: 0, b: 0 }
      };
    }
  }
  return grid;
}

/** 统计网格中 isEdge 格子数 */
function countEdgeCells(gridData) {
  let n = 0;
  for (const row of gridData) {
    for (const cell of row) {
      if (cell && cell.isEdge) n++;
    }
  }
  return n;
}

describe('filterEdgeBlocks（有边界坐标分支）', () => {
  it('3 层白色边缘全部标记为 isEdge', () => {
    const grid = makeBorderGrid(10, 10, 3);
    const boundary = { hasEdge: true, top: 0, bottom: 10, left: 0, right: 10 };
    const res = filterEdgeBlocks(grid, 10, 10, 8, { r: 255, g: 255, b: 255 }, boundary);
    assert.equal(res.marked, true);
    // 10x10，去掉 3 层边 = 4x4 内容区 → 边缘 84 格
    assert.equal(countEdgeCells(grid), 84);
    // 内容区第一格不被标记
    assert.equal(grid[3][3].isEdge, false);
  });

  it('中央同色块不连通边缘时不标记（连通性核心语义）', () => {
    // 8x8：外圈 2 层白色，中央 2x2 白色被一圈红色隔开（不连通边缘）
    const grid = [];
    for (let r = 0; r < 8; r++) {
      grid[r] = [];
      for (let c = 0; c < 8; c++) {
        const isBorder = r < 2 || r >= 6 || c < 2 || c >= 6;
        const isBlockRing = !isBorder && (r === 2 || r === 5 || c === 2 || c === 5);
        const isCenterWhite = r >= 3 && r <= 4 && c >= 3 && c <= 4;
        grid[r][c] = {
          originalRgb: isBorder || isCenterWhite
            ? { r: 255, g: 255, b: 255 }
            : isBlockRing ? { r: 255, g: 0, b: 0 } : { r: 0, g: 0, b: 0 }
        };
      }
    }
    const boundary = { hasEdge: true, top: 0, bottom: 8, left: 0, right: 8 };
    filterEdgeBlocks(grid, 8, 8, 8, { r: 255, g: 255, b: 255 }, boundary);
    // 外圈 2 层白 = 8*8 - 4*4 = 48 格标记；中央 2x2 白被红色环隔开 → 不标记
    assert.equal(countEdgeCells(grid), 48);
    assert.equal(grid[3][3].isEdge, false);
    assert.equal(grid[4][4].isEdge, false);
  });

  it('颜色差异超过阈值不标记', () => {
    const grid = makeBorderGrid(6, 6, 2);
    // 边缘格子改成浅灰 (250,250,250)，edgeColor 白色但阈值 5 → 距离 8.66 > 5 不匹配
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        const isBorder = r < 2 || r >= 4 || c < 2 || c >= 4;
        if (isBorder) grid[r][c].originalRgb = { r: 250, g: 250, b: 250 };
      }
    }
    const boundary = { hasEdge: true, top: 0, bottom: 6, left: 0, right: 6 };
    const res = filterEdgeBlocks(grid, 6, 6, 8, { r: 255, g: 255, b: 255 }, boundary, 5);
    assert.equal(countEdgeCells(grid), 0);
    assert.equal(res.marked, true); // marked 恒为 true（有边界坐标分支）
  });
});

describe('filterEdgeBlocks（无边界坐标分支）', () => {
  it('与有坐标分支行为一致', () => {
    const grid = makeBorderGrid(8, 8, 3);
    const boundary = { hasEdge: true }; // 无 top/bottom/left/right
    const res = filterEdgeBlocks(grid, 8, 8, 8, { r: 255, g: 255, b: 255 }, boundary);
    assert.equal(res.marked, true);
    // 8x8 - 3 层边(2x2 内容区) = 60 格边缘
    assert.equal(countEdgeCells(grid), 60);
    assert.equal(grid[3][3].isEdge, false);
  });
});

describe('filterEdgeSegments', () => {
  /** 构造 segments：3 层白色边缘段 + 中央红色段 */
  function makeBorderSegments(rows, cols, borderLayers = 3) {
    const segments = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const isBorder = r < borderLayers || r >= rows - borderLayers ||
                         c < borderLayers || c >= cols - borderLayers;
        segments.push({
          row: r, col: c,
          avgColor: isBorder ? { r: 255, g: 255, b: 255 } : { r: 255, g: 0, b: 0 }
        });
      }
    }
    return segments;
  }

  it('3 层白色边缘段全部标记为 isEdge', () => {
    const segments = makeBorderSegments(8, 8, 3);
    const res = filterEdgeSegments(segments, 8, 8, { r: 255, g: 255, b: 255 });
    const marked = segments.filter(s => s.isEdge).length;
    assert.equal(res.marked, true);
    assert.equal(marked, 60); // 8x8 - 2x2 内容区
    assert.equal(segments.find(s => s.row === 3 && s.col === 3).isEdge, false);
  });

  it('无匹配时 marked=false 且无标记', () => {
    const segments = makeBorderSegments(6, 6, 2);
    for (const s of segments) s.avgColor = { r: 10, g: 200, b: 10 };
    const res = filterEdgeSegments(segments, 6, 6, { r: 255, g: 255, b: 255 });
    assert.equal(res.marked, false);
    assert.equal(segments.filter(s => s.isEdge).length, 0);
  });
});
