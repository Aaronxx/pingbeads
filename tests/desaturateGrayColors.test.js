const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { desaturateGrayColors } = require('../src/utils/imageProcessor');
const { markPalette, computeGrayness } = require('../src/utils/colorMapper');

// 找一个实际浊色和一个实际非浊色用于构造测试网格
const grayish = markPalette.find(c => computeGrayness(c.rgb) > 0.5);
const vivid = markPalette.find(c => computeGrayness(c.rgb) === 0 && c.rgb.r > 200);

/** 构造一个 cell */
function makeCell(code, hex, rgb) {
  return {
    markCode: code,
    markHex: hex,
    markRgb: { ...rgb },
    rawRgb: { ...rgb },
    originalRgb: { ...rgb }
  };
}

/** 构造简单 gridData：rows×cols，中心格子用指定色，其余用另一色 */
function makeGrid(rows, cols, centerCode, centerHex, centerRgb, surroundCode, surroundHex, surroundRgb) {
  const grid = [];
  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      const isCenter = r === Math.floor(rows / 2) && c === Math.floor(cols / 2);
      if (isCenter) {
        grid[r][c] = makeCell(centerCode, centerHex, centerRgb);
      } else {
        grid[r][c] = makeCell(surroundCode, surroundHex, surroundRgb);
      }
    }
  }
  return grid;
}

describe('desaturateGrayColors', () => {
  it('intensity=0 时不应改动任何格子', () => {
    const grid = makeGrid(5, 5,
      grayish.code, grayish.hex, grayish.rgb,
      vivid.code, vivid.hex, vivid.rgb);
    const before = grid[2][2].markCode;
    desaturateGrayColors(grid, 5, 5, 0);
    assert.equal(grid[2][2].markCode, before, 'intensity=0 不应改动');
  });

  it('被非浊色包围的浊色格子应被替换为邻居色', () => {
    const grid = makeGrid(5, 5,
      grayish.code, grayish.hex, grayish.rgb,
      vivid.code, vivid.hex, vivid.rgb);
    desaturateGrayColors(grid, 5, 5, 1);
    // 中心浊色被四周鲜艳色包围，应被替换为鲜艳色
    assert.equal(grid[2][2].markCode, vivid.code,
      `浊色 ${grayish.code} 应被替换为邻居 ${vivid.code}，实际 ${grid[2][2].markCode}`);
  });

  it('替换后 markHex/markRgb 应同步更新', () => {
    const grid = makeGrid(5, 5,
      grayish.code, grayish.hex, grayish.rgb,
      vivid.code, vivid.hex, vivid.rgb);
    desaturateGrayColors(grid, 5, 5, 1);
    assert.equal(grid[2][2].markHex, vivid.hex);
    assert.deepEqual(grid[2][2].markRgb, vivid.rgb);
  });

  it('被浊色完全包围的浊色格子应保留（无有效邻居）', () => {
    // 整片都是同一浊色，无非浊色邻居
    const grid = [];
    for (let r = 0; r < 5; r++) {
      grid[r] = [];
      for (let c = 0; c < 5; c++) {
        grid[r][c] = makeCell(grayish.code, grayish.hex, grayish.rgb);
      }
    }
    desaturateGrayColors(grid, 5, 5, 1);
    // 全是浊色，无邻居可替换，应保持不变
    assert.equal(grid[2][2].markCode, grayish.code, '无邻居时应保留');
  });

  it('非浊色格子不应被改动', () => {
    // 中心是鲜艳色，四周是浊色
    const grid = makeGrid(5, 5,
      vivid.code, vivid.hex, vivid.rgb,
      grayish.code, grayish.hex, grayish.rgb);
    desaturateGrayColors(grid, 5, 5, 1);
    assert.equal(grid[2][2].markCode, vivid.code, '非浊色不应被改动');
  });

  it('intensity 较低时只处理浊度很高的色', () => {
    // intensity=0.1 → grayThreshold=0.9，只有 grayness>0.9 才处理
    // 构造一个 grayness 中等的浊色（如果存在）
    const midGray = markPalette.find(c => {
      const g = computeGrayness(c.rgb);
      return g > 0 && g < 0.9;
    });
    if (!midGray) return; // 跳过：色板里没有这种中间浊度色

    const grid = makeGrid(5, 5,
      midGray.code, midGray.hex, midGray.rgb,
      vivid.code, vivid.hex, vivid.rgb);
    desaturateGrayColors(grid, 5, 5, 0.1);
    // grayness<0.9 在 intensity=0.1 时不处理
    assert.equal(grid[2][2].markCode, midGray.code, '中等浊度在低强度时应保留');
  });

  it('gridData=null 应安全返回', () => {
    assert.doesNotThrow(() => desaturateGrayColors(null, 0, 0, 1));
  });

  it('空网格应安全返回', () => {
    const grid = [[null, null], [null, null]];
    assert.doesNotThrow(() => desaturateGrayColors(grid, 2, 2, 1));
  });
});
