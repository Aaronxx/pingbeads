/**
 * filterEdgeByMarkCode 回归测试
 *
 * 去边缘功能从「原始取色欧氏距离」改为「最终色号 markCode 连通」判定。
 * 这些测试锁定新语义：边缘判定基于最终显示色号，且保持"只有通过边缘色号
 * 连通到图片边缘的格子才标记"这一连通性约束。
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { filterEdgeByMarkCode } = require('../src/utils/imageProcessor');

/** 构造网格：外层 borderLayers 层 borderCode + 内部 innerCode */
function makeGrid(rows, cols, borderCode, innerCode, borderLayers = 3) {
  const grid = [];
  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      const isBorder = r < borderLayers || r >= rows - borderLayers ||
                       c < borderLayers || c >= cols - borderLayers;
      grid[r][c] = {
        markCode: isBorder ? borderCode : innerCode,
        markHex: isBorder ? '#FEFFFF' : '#FF0000'
      };
    }
  }
  return grid;
}

function countEdgeCells(gridData) {
  let n = 0;
  for (const row of gridData) for (const cell of row) if (cell && cell.isEdge) n++;
  return n;
}

describe('filterEdgeByMarkCode', () => {
  it('按最终色号标记：外圈 3 层同色号全部标记 isEdge', () => {
    const grid = makeGrid(12, 12, 'H2', 'C4', 3);
    const res = filterEdgeByMarkCode(grid, 12, 12);
    assert.equal(res.marked, true);
    assert.equal(res.edgeMarkCode, 'H2');
    // 12x12 - 6x6 内容区 = 108 格边缘
    assert.equal(countEdgeCells(grid), 108);
    assert.equal(grid[3][3].isEdge, false);
  });

  it('边缘色号与内容同色时仍只标外圈连通部分（连通性语义）', () => {
    // 8x8：外圈 2 层 H2 白 + 中央 2x2 H2 白被红色环隔开
    const grid = [];
    for (let r = 0; r < 8; r++) {
      grid[r] = [];
      for (let c = 0; c < 8; c++) {
        const isBorder = r < 2 || r >= 6 || c < 2 || c >= 6;
        const isCenter = r >= 3 && r <= 4 && c >= 3 && c <= 4;
        grid[r][c] = { markCode: (isBorder || isCenter) ? 'H2' : 'C4' };
      }
    }
    filterEdgeByMarkCode(grid, 8, 8);
    // 外圈 2 层白 = 8x8 - 4x4 = 48 格；中央 2x2 白被隔开不标记
    assert.equal(countEdgeCells(grid), 48);
    assert.equal(grid[3][3].isEdge, false);
    assert.equal(grid[4][4].isEdge, false);
  });

  it('无边缘底色（内容色占比不足一半）时不标记', () => {
    // 全图都是不同色号，无主导边缘色
    const grid = [];
    for (let r = 0; r < 4; r++) {
      grid[r] = [];
      for (let c = 0; c < 4; c++) {
        grid[r][c] = { markCode: `C${(r * 4 + c) % 5}` };
      }
    }
    const res = filterEdgeByMarkCode(grid, 4, 4);
    // 边缘 12 格中最多出现同一色号 4 次，占比 4/12 < 0.5
    assert.equal(res.marked, false);
    assert.equal(countEdgeCells(grid), 0);
  });

  it('标记后会正确清理旧 isEdge（重新标记语义）', () => {
    const grid = makeGrid(10, 10, 'H2', 'C4', 2);
    // 预先污染一个内容格子为 isEdge=true，验证函数会按新结果整体回写
    grid[5][5].isEdge = true;
    filterEdgeByMarkCode(grid, 10, 10);
    assert.equal(grid[5][5].isEdge, false);
  });
});
