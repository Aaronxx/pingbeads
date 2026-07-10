const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createColorPipeline } = require('../src/utils/colorPipeline');
const { markPalette } = require('../src/utils/colorMapper');

/** 构造测试网格：指定行列数的同色网格 */
function makeUniformGrid(rows, cols, code) {
  const c = markPalette.find(p => p.code === code);
  const grid = [];
  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let cc = 0; cc < cols; cc++) {
      grid[r][cc] = {
        markCode: c.code,
        markHex: c.hex,
        markRgb: { ...c.rgb },
        rawRgb: { ...c.rgb },
        originalRgb: { ...c.rgb }
      };
    }
  }
  return grid;
}

function makePipeline(opts = {}) {
  return createColorPipeline({
    algorithmVersion: 'current',
    vibrantScale: 0,
    mergeThreshold: 0,
    useSpecialColors: true,
    antiGrayIntensity: 0,
    ...opts
  });
}

describe('colorPipeline 特殊色替换', () => {
  it('useSpecialColors=true 时不强制替换为普通色', () => {
    const grid = makeUniformGrid(3, 3, 'A1');
    const pipeline = makePipeline({ useSpecialColors: true });
    pipeline.reapplyColors(grid, 3, 3);
    // A1 是普通色，useSpecialColors=true 时应保持不变
    assert.equal(grid[0][0].markCode, 'A1');
  });

  it('useSpecialColors=false 时替换特殊色', () => {
    const grid = makeUniformGrid(3, 3, 'P1');
    const pipeline = makePipeline({ useSpecialColors: false });
    pipeline.reapplyColors(grid, 3, 3);
    assert.notEqual(grid[0][0].markCode, 'P1');
  });

  it('非特殊色不受影响', () => {
    const grid = makeUniformGrid(3, 3, 'A1');
    const pipeline = makePipeline({ useSpecialColors: false });
    pipeline.reapplyColors(grid, 3, 3);
    assert.equal(grid[0][0].markCode, 'A1');
  });
});

describe('colorPipeline 一致性', () => {
  it('相同参数多次调用结果一致', () => {
    const grid1 = makeUniformGrid(3, 3, 'A4');
    const grid2 = makeUniformGrid(3, 3, 'A4');
    const pipeline = makePipeline({ vibrantScale: 2, mergeThreshold: 10 });
    pipeline.reapplyColors(grid1, 3, 3);
    pipeline.reapplyColors(grid2, 3, 3);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        assert.equal(grid1[r][c].markCode, grid2[r][c].markCode);
      }
    }
  });
});
