const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const mixin = require('../src/components/mosaicCanvas/mixins/exportPreset');

function createMockCtx(overrides = {}) {
  return {
    data: {
      processMode: 'normal',
      gridPreset: [0, 0, 0],
      removeEdge: true,
      ...overrides.data
    },
    cachedGridData: null,
    cachedGridInfo: null,
    cachedSegments: null,
    cachedSegmentsWidth: 0,
    cachedSegmentsHeight: 0,
    _cropOffsetCol: 0,
    _cropOffsetRow: 0,
    triggerEvent() {},
    setData() {},
    calculateStats() { return { colorCount: 1, totalCount: 1, sortedByCount: [] }; },
    ...overrides
  };
}

function makeGrid(rows, cols) {
  const grid = [];
  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      grid[r][c] = {
        x: c * 10, y: r * 10, width: 10, height: 10,
        markCode: 'A1', markHex: '#FAF4C8',
        markRgb: { r: 250, g: 244, b: 200 },
        rawRgb: { r: 100, g: 100, b: 100 },
        isEdge: false
      };
    }
  }
  return grid;
}

describe('getExportData', () => {
  it('普通模式返回 gridInfo + gridData', () => {
    const gridData = makeGrid(3, 3);
    const ctx = createMockCtx({
      cachedGridData: gridData,
      cachedGridInfo: { rows: 3, cols: 3, gridSize: 10 }
    });
    const result = mixin.getExportData.call(ctx);
    assert.ok(result.gridInfo);
    assert.ok(result.gridData);
    assert.equal(result.gridInfo.rows, 3);
  });

  it('马赛克模式额外返回 segments', () => {
    const gridData = makeGrid(3, 3);
    const ctx = createMockCtx({
      data: { processMode: 'mosaic' },
      cachedGridData: gridData,
      cachedGridInfo: { rows: 3, cols: 3, gridSize: 10 },
      cachedSegments: [{ x: 0, y: 0 }],
      cachedSegmentsWidth: 100,
      cachedSegmentsHeight: 100
    });
    const result = mixin.getExportData.call(ctx);
    assert.ok(result.segments);
    assert.equal(result.imageWidth, 100);
  });

  it('无数据时返回 null 字段', () => {
    const ctx = createMockCtx();
    const result = mixin.getExportData.call(ctx);
    assert.equal(result.gridData, null);
  });
});

describe('_applyGridPreset', () => {
  it('presetIndex=0 不裁剪', () => {
    const gridData = makeGrid(5, 5);
    const ctx = createMockCtx({ data: { gridPreset: [0, 0, 0] } });
    const result = mixin._applyGridPreset.call(ctx, gridData, 5, 5);
    assert.equal(result.cols, 5);
    assert.equal(result.rows, 5);
    assert.equal(ctx._cropOffsetCol, 0);
  });

  it('应从中心截取指定尺寸', () => {
    const gridData = makeGrid(10, 10);
    const ctx = createMockCtx({ data: { gridPreset: [1, 6, 6] } });
    const result = mixin._applyGridPreset.call(ctx, gridData, 10, 10);
    assert.equal(result.cols, 6);
    assert.equal(result.rows, 6);
    // 裁剪偏移应为 (10-6)/2 = 2
    assert.equal(ctx._cropOffsetCol, 2);
    assert.equal(ctx._cropOffsetRow, 2);
    // 中心格子应保留原始数据
    assert.equal(result.gridData[0][0].markCode, 'A1');
  });

  it('目标大于源时应填充空白', () => {
    const gridData = makeGrid(3, 3);
    const ctx = createMockCtx({ data: { gridPreset: [1, 5, 5] } });
    const result = mixin._applyGridPreset.call(ctx, gridData, 3, 3);
    assert.equal(result.cols, 5);
    assert.equal(result.rows, 5);
    // 超出范围的格子应为空白填充
    assert.equal(result.gridData[4][4].isEmpty, true);
    assert.equal(result.gridData[4][4].markHex, '#F0F0F0');
  });

  it('presetOverride 应覆盖 this.data.gridPreset', () => {
    const gridData = makeGrid(10, 10);
    const ctx = createMockCtx({ data: { gridPreset: [0, 0, 0] } });
    const result = mixin._applyGridPreset.call(ctx, gridData, 10, 10, [1, 4, 4]);
    assert.equal(result.cols, 4);
    assert.equal(result.rows, 4);
  });

  it('模式切换兜底：presetIndex=0 但裁剪已确认时用缓存尺寸裁剪', () => {
    const gridData = makeGrid(10, 10);
    const ctx = createMockCtx({
      data: { gridPreset: [0, 0, 0] },
      _cropConfirmed: true,
      _cropOffsetCol: 1,
      _cropOffsetRow: 2,
      cachedGridInfo: { cols: 4, rows: 4, gridSize: 10 }
    });
    const result = mixin._applyGridPreset.call(ctx, gridData, 10, 10);
    assert.equal(result.cols, 4);
    assert.equal(result.rows, 4);
    // 保留用户自定义偏移（不因 presetIndex=0 清空）
    assert.equal(ctx._cropOffsetCol, 1);
    assert.equal(ctx._cropOffsetRow, 2);
    // 裁剪格子从偏移起点 (1,2) 截取：gridData[2][1].x=10, y=20
    assert.equal(result.gridData[0][0].x, 10);
    assert.equal(result.gridData[0][0].y, 20);
  });

  it('裁剪未确认时 presetIndex=0 仍返回全图（不触发兜底）', () => {
    const gridData = makeGrid(5, 5);
    const ctx = createMockCtx({
      data: { gridPreset: [0, 0, 0] },
      cachedGridInfo: { cols: 3, rows: 3, gridSize: 10 }
    });
    const result = mixin._applyGridPreset.call(ctx, gridData, 5, 5);
    assert.equal(result.cols, 5);
    assert.equal(result.rows, 5);
    assert.equal(ctx._cropOffsetCol, 0);
  });
});

describe('getSplitStats', () => {
  it('无数据返回 null', () => {
    const ctx = createMockCtx();
    assert.equal(mixin.getSplitStats.call(ctx, 'horizontal'), null);
  });

  it('horizontal 模式返回 2 部分', () => {
    const gridData = makeGrid(10, 10);
    const ctx = createMockCtx({
      cachedGridData: gridData,
      cachedGridInfo: { rows: 10, cols: 10, gridSize: 10 }
    });
    const result = mixin.getSplitStats.call(ctx, 'horizontal');
    assert.equal(result.length, 2);
    assert.equal(result[0].name, '上半');
    assert.equal(result[1].name, '下半');
    assert.equal(result[0].rows, 5);
  });

  it('grid2x2 模式返回 4 部分', () => {
    const gridData = makeGrid(10, 10);
    const ctx = createMockCtx({
      cachedGridData: gridData,
      cachedGridInfo: { rows: 10, cols: 10, gridSize: 10 }
    });
    const result = mixin.getSplitStats.call(ctx, 'grid2x2');
    assert.equal(result.length, 4);
  });

  it('无效模式返回 null', () => {
    const gridData = makeGrid(10, 10);
    const ctx = createMockCtx({
      cachedGridData: gridData,
      cachedGridInfo: { rows: 10, cols: 10, gridSize: 10 }
    });
    assert.equal(mixin.getSplitStats.call(ctx, 'invalid'), null);
  });
});
