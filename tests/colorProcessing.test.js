const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const mixin = require('../src/components/mosaicCanvas/mixins/colorProcessing');

function createMockCtx(overrides = {}) {
  return {
    data: {
      useSpecialColors: true,
      vibrantScale: 0,
      mergeThreshold: 0,
      ...overrides.data
    },
    cachedOriginalGridData: null,
    cachedGridData: null,
    cachedGridInfo: null,
    _cropOffsetCol: 0,
    _cropOffsetRow: 0,
    triggerEvent() {},
    setData() {},
    ...overrides
  };
}

function makeCell(markCode, markHex, opts = {}) {
  return {
    x: 0, y: 0, width: 10, height: 10,
    markCode, markHex,
    markRgb: opts.markRgb || { r: 0, g: 0, b: 0 },
    rawRgb: opts.rawRgb || { r: 100, g: 100, b: 100 },
    originalRgb: opts.originalRgb || null,
    isEdge: opts.isEdge || false
  };
}

describe('replaceSpecialColors', () => {
  it('useSpecialColors=true 时不替换', () => {
    const gridData = [[makeCell('P1', '#fff')]];
    const ctx = createMockCtx({ data: { useSpecialColors: true } });
    mixin.replaceSpecialColors.call(ctx, gridData, 1, 1);
    assert.equal(gridData[0][0].markCode, 'P1');
  });

  it('useSpecialColors=false 时替换特殊色', () => {
    const gridData = [[makeCell('P1', '#fff')]];
    const ctx = createMockCtx({ data: { useSpecialColors: false } });
    mixin.replaceSpecialColors.call(ctx, gridData, 1, 1);
    // P1 应被替换为替代色（H1）
    assert.notEqual(gridData[0][0].markCode, 'P1');
    assert.ok(gridData[0][0].markHex);
  });

  it('非特殊色不受影响', () => {
    const gridData = [[makeCell('A1', '#FAF4C8')]];
    const ctx = createMockCtx({ data: { useSpecialColors: false } });
    mixin.replaceSpecialColors.call(ctx, gridData, 1, 1);
    assert.equal(gridData[0][0].markCode, 'A1');
  });
});

describe('reduceVibrant', () => {
  it('scale=0 应基本不变', () => {
    const ctx = createMockCtx();
    const rgb = { r: 200, g: 100, b: 50 };
    const result = mixin.reduceVibrant.call(ctx, rgb, 0);
    // scale=0 时对比度=1.0，s 和 v 不变
    assert.ok(Math.abs(result.r - 200) < 5);
    assert.ok(Math.abs(result.g - 100) < 5);
  });

  it('scale=1 应降低饱和度', () => {
    const ctx = createMockCtx();
    const rgb = { r: 255, g: 0, b: 0 };
    const result = mixin.reduceVibrant.call(ctx, rgb, 1);
    // 红色降低饱和度后 r 应减小
    assert.ok(result.r < 255);
  });

  it('null 输入返回 null', () => {
    const ctx = createMockCtx();
    assert.equal(mixin.reduceVibrant.call(ctx, null, 0.5), null);
  });
});

describe('resetToOriginalColors', () => {
  it('应从快照恢复 markCode/markHex', () => {
    const snapshot = [[
      { rawRgb: { r: 10, g: 20, b: 30 }, markCode: 'X1', markHex: '#111', markRgb: { r: 1, g: 1, b: 1 }, originalMarkCode: 'X1', isEdge: false }
    ]];
    const gridData = [[
      { rawRgb: { r: 99, g: 99, b: 99 }, markCode: 'Y2', markHex: '#999', markRgb: { r: 9, g: 9, b: 9 }, originalMarkCode: 'Y2', isEdge: false }
    ]];
    const ctx = createMockCtx({ cachedOriginalGridData: snapshot });
    mixin.resetToOriginalColors.call(ctx, gridData, 1, 1);

    assert.equal(gridData[0][0].markCode, 'X1');
    assert.equal(gridData[0][0].markHex, '#111');
    assert.deepEqual(gridData[0][0].rawRgb, { r: 10, g: 20, b: 30 });
  });

  it('无快照时不做任何操作', () => {
    const gridData = [[{ markCode: 'A1', markHex: '#fff' }]];
    const ctx = createMockCtx({ cachedOriginalGridData: null });
    mixin.resetToOriginalColors.call(ctx, gridData, 1, 1);
    assert.equal(gridData[0][0].markCode, 'A1');
  });
});

describe('deepCloneGridData (mixin 代理)', () => {
  it('应调用 gridHelpers 的 deepCloneGridData', () => {
    const gridData = [[makeCell('A1', '#FAF4C8')]];
    const ctx = createMockCtx();
    const cloned = mixin.deepCloneGridData.call(ctx, gridData, 1, 1);
    assert.equal(cloned[0][0].markCode, 'A1');
    cloned[0][0].markCode = 'CHANGED';
    assert.equal(gridData[0][0].markCode, 'A1');
  });
});
