const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const mixin = require('../src/components/mosaicCanvas/mixins/imageProcessing');

function createMockCtx(overrides = {}) {
  return {
    data: {
      gridSize: 10,
      previewQuality: 2,
      processMode: 'normal',
      mergeThreshold: 0,
      vibrantScale: 0,
      removeEdge: true,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      canvasWidth: 300,
      canvasHeight: 300,
      ...overrides.data
    },
    cachedGridData: null,
    cachedGridInfo: null,
    cachedPixelData: null,
    cachedWidth: 0,
    cachedHeight: 0,
    triggerEvent() {},
    setData() {},
    ...overrides
  };
}

function makeCell(markCode, markHex, opts = {}) {
  return {
    markCode, markHex,
    markRgb: { r: 0, g: 0, b: 0 },
    isEdge: opts.isEdge || false,
    ...opts
  };
}

describe('calculateStats', () => {
  it('应正确统计色号数量', () => {
    const gridData = [
      [makeCell('A1', '#FAF4C8'), makeCell('A1', '#FAF4C8'), makeCell('B2', '#63F347')],
      [makeCell('A1', '#FAF4C8'), makeCell('B2', '#63F347'), makeCell('B2', '#63F347')],
    ];
    const ctx = createMockCtx();
    const stats = mixin.calculateStats.call(ctx, gridData, 2, 3);
    assert.equal(stats.colorCount, 2);
    assert.equal(stats.totalCount, 6);
    // A1 有 3 个，B2 有 3 个
    assert.equal(stats.sortedByCount[0].count, 3);
  });

  it('应跳过边缘格子（removeEdge=true）', () => {
    const gridData = [
      [makeCell('A1', '#FAF4C8'), makeCell('B2', '#63F347', { isEdge: true })],
    ];
    const ctx = createMockCtx({ data: { removeEdge: true } });
    const stats = mixin.calculateStats.call(ctx, gridData, 1, 2);
    assert.equal(stats.totalCount, 1);
    assert.equal(stats.colorCount, 1);
  });

  it('removeEdge=false 时统计边缘格子', () => {
    const gridData = [
      [makeCell('A1', '#FAF4C8'), makeCell('B2', '#63F347', { isEdge: true })],
    ];
    const ctx = createMockCtx({ data: { removeEdge: false } });
    const stats = mixin.calculateStats.call(ctx, gridData, 1, 2);
    assert.equal(stats.totalCount, 2);
  });

  it('应跳过空格子', () => {
    const gridData = [
      [makeCell('A1', '#FAF4C8'), null],
      [null, makeCell('B2', '#63F347')],
    ];
    const ctx = createMockCtx();
    const stats = mixin.calculateStats.call(ctx, gridData, 2, 2);
    assert.equal(stats.totalCount, 2);
  });

  it('sortedByCount 应按数量降序', () => {
    const gridData = [
      [makeCell('A1', '#FAF4C8'), makeCell('B2', '#63F347'), makeCell('B2', '#63F347')],
    ];
    const ctx = createMockCtx();
    const stats = mixin.calculateStats.call(ctx, gridData, 1, 3);
    assert.equal(stats.sortedByCount[0].code, 'B2');
    assert.equal(stats.sortedByCount[1].code, 'A1');
  });
});

describe('getQualityGridSize', () => {
  it('quality=2 返回基础 gridSize', () => {
    const ctx = createMockCtx({ data: { gridSize: 10 } });
    assert.equal(mixin.getQualityGridSize.call(ctx, 2), 10);
  });

  it('quality=1 返回 2 倍 gridSize', () => {
    const ctx = createMockCtx({ data: { gridSize: 10 } });
    assert.equal(mixin.getQualityGridSize.call(ctx, 1), 20);
  });

  it('quality=3 返回 half gridSize（向上取整）', () => {
    const ctx = createMockCtx({ data: { gridSize: 10 } });
    assert.equal(mixin.getQualityGridSize.call(ctx, 3), 5);
  });

  it('quality=3 奇数 gridSize 向上取整', () => {
    const ctx = createMockCtx({ data: { gridSize: 7 } });
    assert.equal(mixin.getQualityGridSize.call(ctx, 3), 4);
  });
});

describe('getVisibleRange', () => {
  it('无数据返回 null', () => {
    const ctx = createMockCtx();
    assert.equal(mixin.getVisibleRange.call(ctx), null);
  });

  it('应返回可见行列范围', () => {
    const gridData = [];
    for (let r = 0; r < 20; r++) {
      gridData[r] = [];
      for (let c = 0; c < 20; c++) {
        gridData[r][c] = makeCell('A1', '#FAF4C8');
      }
    }
    const ctx = createMockCtx({
      cachedGridData: gridData,
      cachedGridInfo: { rows: 20, cols: 20, gridSize: 10 }
    });
    const range = mixin.getVisibleRange.call(ctx);
    assert.ok(range.startCol >= 0);
    assert.ok(range.endCol < 20);
    assert.ok(range.startRow >= 0);
    assert.ok(range.endRow < 20);
    assert.ok(range.endCol >= range.startCol);
    assert.ok(range.endRow >= range.startRow);
  });
});

describe('_waitForData', () => {
  it('数据已就绪时立即回调', (_, done) => {
    const ctx = createMockCtx({
      cachedGridData: [[makeCell('A1', '#FAF4C8')]],
      cachedGridInfo: { rows: 1, cols: 1, gridSize: 10 }
    });
    mixin._waitForData.call(ctx, (rows, cols, gridSize) => {
      assert.equal(rows, 1);
      assert.equal(cols, 1);
      done();
    });
  });
});

describe('getCachedPixelData / setCachedPixelData', () => {
  it('应存储和读取像素数据', () => {
    const ctx = createMockCtx();
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    mixin.setCachedPixelData.call(ctx, data, 2, 1);
    assert.equal(ctx.cachedWidth, 2);
    assert.equal(ctx.cachedHeight, 1);
    const retrieved = mixin.getCachedPixelData.call(ctx);
    assert.equal(retrieved.length, 8);
    // 应为拷贝，修改不影响原始
    retrieved[0] = 0;
    assert.equal(data[0], 255);
  });
});
