/**
 * 边缘底色检测回归测试
 *
 * 锁定纯白（及 ≥252 的高亮值）边缘的量化打包修复：
 * 修复前 Math.round(255/8)*8 = 256，打包进 8 位字段后溢出，
 * 解包得到近黑色（如 {r:1,g:1,b:0}），导致后续洪泛匹配不到任何白格子，
 * "去边缘"功能对纯白边缘完全失效。
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  detectEdgeColorFromGrid,
  detectEdgeColorFromSegments,
  filterEdgeSegments,
  filterEdgeBlocks
} = require('../src/utils/imageProcessor');

/** 构造 segments：外层白色边缘 + 内部红色内容 */
function makeBorderSegments(rows, cols, borderLayers, borderColor) {
  const segments = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isBorder = r < borderLayers || r >= rows - borderLayers ||
                       c < borderLayers || c >= cols - borderLayers;
      segments.push({
        row: r, col: c,
        avgColor: isBorder ? { ...borderColor } : { r: 200, g: 30, b: 30 }
      });
    }
  }
  return segments;
}

/** 构造 gridData：外层白色边缘 + 内部红色内容 */
function makeBorderGrid(rows, cols, borderLayers, borderColor) {
  const grid = [];
  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      const isBorder = r < borderLayers || r >= rows - borderLayers ||
                       c < borderLayers || c >= cols - borderLayers;
      grid[r][c] = {
        originalRgb: isBorder ? { ...borderColor } : { r: 200, g: 30, b: 30 }
      };
    }
  }
  return grid;
}

function countMarkedSegments(segments) {
  return segments.filter(s => s.isEdge).length;
}

function countMarkedCells(gridData) {
  let n = 0;
  for (const row of gridData) for (const cell of row) if (cell && cell.isEdge) n++;
  return n;
}

describe('detectEdgeColorFromSegments', () => {
  it('纯白 (255) 边缘检测出白色而非溢出后的近黑色', () => {
    const segments = makeBorderSegments(12, 12, 3, { r: 255, g: 255, b: 255 });
    const det = detectEdgeColorFromSegments(segments, 12, 12, 30);
    assert.equal(det.hasEdge, true);
    // 修复前此处解包为 {r:1,g:1,b:0}；修复后应回到白色量化桶
    assert.ok(det.edgeColor.r >= 248, `r=${det.edgeColor.r} 应接近 255`);
    assert.ok(det.edgeColor.g >= 248, `g=${det.edgeColor.g} 应接近 255`);
    assert.ok(det.edgeColor.b >= 248, `b=${det.edgeColor.b} 应接近 255`);
  });

  it('高亮值 (252) 边缘同样不溢出', () => {
    const segments = makeBorderSegments(10, 10, 2, { r: 252, g: 253, b: 254 });
    const det = detectEdgeColorFromSegments(segments, 10, 10, 30);
    assert.equal(det.hasEdge, true);
    assert.ok(det.edgeColor.r >= 248 && det.edgeColor.g >= 248 && det.edgeColor.b >= 248);
  });

  it('检测 + 标记端到端：纯白外圈 3 层全部标记 isEdge', () => {
    const segments = makeBorderSegments(12, 12, 3, { r: 255, g: 255, b: 255 });
    const det = detectEdgeColorFromSegments(segments, 12, 12, 30);
    assert.equal(det.hasEdge, true);
    filterEdgeSegments(segments, 12, 12, det.edgeColor, 25);
    // 12x12 - 6x6 内容区 = 108 格边缘
    assert.equal(countMarkedSegments(segments), 108);
  });

  it('中间灰度边缘不受量化修复影响（无回归）', () => {
    const segments = makeBorderSegments(10, 10, 2, { r: 128, g: 128, b: 128 });
    const det = detectEdgeColorFromSegments(segments, 10, 10, 30);
    assert.equal(det.hasEdge, true);
    filterEdgeSegments(segments, 10, 10, det.edgeColor, 25);
    // 10x10 - 6x6 内容区 = 64 格边缘
    assert.equal(countMarkedSegments(segments), 64);
  });
});

describe('detectEdgeColorFromGrid', () => {
  it('纯白 (255) 边缘检测出白色而非溢出后的近黑色', () => {
    const grid = makeBorderGrid(12, 12, 3, { r: 255, g: 255, b: 255 });
    const det = detectEdgeColorFromGrid(grid, 12, 12, 8, 30);
    assert.equal(det.hasEdge, true);
    assert.ok(det.edgeColor.r >= 248, `r=${det.edgeColor.r} 应接近 255`);
    assert.ok(det.edgeColor.g >= 248, `g=${det.edgeColor.g} 应接近 255`);
    assert.ok(det.edgeColor.b >= 248, `b=${det.edgeColor.b} 应接近 255`);
  });

  it('检测 + 标记端到端：纯白外圈 3 层全部标记 isEdge', () => {
    const grid = makeBorderGrid(12, 12, 3, { r: 255, g: 255, b: 255 });
    const det = detectEdgeColorFromGrid(grid, 12, 12, 8, 30);
    assert.equal(det.hasEdge, true);
    const boundary = { hasEdge: true, top: 0, bottom: 12, left: 0, right: 12 };
    filterEdgeBlocks(grid, 12, 12, 8, det.edgeColor, boundary, 25);
    // 12x12 - 6x6 内容区 = 108 格边缘
    assert.equal(countMarkedCells(grid), 108);
    assert.equal(grid[3][3].isEdge, false);
  });
});
