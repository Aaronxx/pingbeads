const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const mixin = require('../src/components/mosaicCanvas/mixins/colorReplace');

function createMockCtx(overrides = {}) {
  return {
    data: {
      processMode: 'normal',
      removeEdge: true,
      ...overrides.data
    },
    cachedGridData: null,
    cachedGridInfo: null,
    cachedSegments: null,
    triggerEvent() {},
    setData() {},
    calculateStats() { return { colorCount: 0, totalCount: 0, sortedByCount: [] }; },
    renderToCanvas() {},
    getVisibleRange() { return null; },
    _findColorHexByCode: mixin._findColorHexByCode,
    ...overrides
  };
}

function makeCell(markCode, markHex) {
  return { markCode, markHex, markRgb: { r: 0, g: 0, b: 0 }, isEdge: false };
}

function makeGrid(rows, cols, fillCode, fillHex) {
  const grid = [];
  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      grid[r][c] = makeCell(fillCode, fillHex);
    }
  }
  return grid;
}

describe('_findColorHexByCode', () => {
  it('应返回已知色号的 hex', () => {
    const ctx = createMockCtx();
    const hex = mixin._findColorHexByCode.call(ctx, 'A1');
    assert.equal(hex, '#FAF4C8');
  });

  it('未知色号返回 null', () => {
    const ctx = createMockCtx();
    assert.equal(mixin._findColorHexByCode.call(ctx, 'NOPE'), null);
  });
});

describe('replaceColor', () => {
  it('应替换匹配的色号', () => {
    const gridData = makeGrid(3, 3, 'A1', '#FAF4C8');
    gridData[1][1] = makeCell('B2', '#63F347');
    const ctx = createMockCtx({
      cachedGridData: gridData,
      cachedGridInfo: { rows: 3, cols: 3, gridSize: 10 }
    });
    const result = mixin.replaceColor.call(ctx, 'B2', 'A1', 'all');
    assert.equal(result.success, true);
    assert.equal(result.count, 1);
    assert.equal(gridData[1][1].markCode, 'A1');
  });

  it('无匹配时返回失败', () => {
    const gridData = makeGrid(2, 2, 'A1', '#FAF4C8');
    const ctx = createMockCtx({
      cachedGridData: gridData,
      cachedGridInfo: { rows: 2, cols: 2, gridSize: 10 }
    });
    const result = mixin.replaceColor.call(ctx, 'ZG1', 'A1', 'all');
    assert.equal(result.success, false);
    assert.equal(result.count, 0);
  });

  it('无缓存数据时返回失败', () => {
    const ctx = createMockCtx({ cachedGridData: null, cachedGridInfo: null });
    const result = mixin.replaceColor.call(ctx, 'A1', 'B2', 'all');
    assert.equal(result.success, false);
  });

  it('按位置列表替换', () => {
    const gridData = makeGrid(3, 3, 'A1', '#FAF4C8');
    const ctx = createMockCtx({
      cachedGridData: gridData,
      cachedGridInfo: { rows: 3, cols: 3, gridSize: 10 }
    });
    const result = mixin.replaceColor.call(ctx, 'A1', 'B2', 'all', [{ row: 0, col: 0 }]);
    assert.equal(result.success, true);
    assert.equal(result.count, 1);
    assert.equal(gridData[0][0].markCode, 'B2');
    // 其他位置不变
    assert.equal(gridData[0][1].markCode, 'A1');
  });
});

describe('replaceByRegion', () => {
  it('应替换大区内匹配的色号', () => {
    // 15×15 网格，大区 A1 覆盖 [0-9][0-9]
    const gridData = makeGrid(15, 15, 'A1', '#FAF4C8');
    // 在大区 A1 内放一个 B2
    gridData[5][5] = makeCell('B2', '#63F347');
    const ctx = createMockCtx({
      cachedGridData: gridData,
      cachedGridInfo: { rows: 15, cols: 15, gridSize: 10 }
    });
    const result = mixin.replaceByRegion.call(ctx, 'A1', 'B2', 'A1');
    assert.equal(result.success, true);
    assert.equal(result.count, 1);
    assert.equal(gridData[5][5].markCode, 'A1');
  });

  it('大区内无匹配色号时返回失败', () => {
    const gridData = makeGrid(3, 3, 'A1', '#FAF4C8');
    const ctx = createMockCtx({
      cachedGridData: gridData,
      cachedGridInfo: { rows: 3, cols: 3, gridSize: 10 }
    });
    // 3×3 网格全为 A1，替换 B2→A1 应无匹配
    const result = mixin.replaceByRegion.call(ctx, 'A1', 'B2', 'A1');
    assert.equal(result.success, false);
    assert.equal(result.count, 0);
  });
});
