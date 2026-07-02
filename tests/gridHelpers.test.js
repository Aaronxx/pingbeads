const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { deepCloneGridData, findColorHexByCode } = require('../src/utils/gridHelpers');

describe('deepCloneGridData', () => {
  it('应深拷贝所有属性', () => {
    const gridData = [
      [{
        x: 0, y: 0, width: 10, height: 10, row: 0, col: 0,
        rawRgb: { r: 100, g: 150, b: 200 },
        originalRgb: { r: 100, g: 150, b: 200 },
        originalMarkCode: 'A1',
        markCode: 'A1', markHex: '#FAF4C8', markRgb: { r: 250, g: 244, b: 200 },
        isEdge: false
      }],
      [null]
    ];
    const cloned = deepCloneGridData(gridData, 2, 1);

    // 值相等
    assert.deepEqual(cloned[0][0].rawRgb, { r: 100, g: 150, b: 200 });
    assert.equal(cloned[0][0].markCode, 'A1');
    assert.equal(cloned[0][0].initialMarkCode, 'A1');
    assert.equal(cloned[0][0].initialMarkHex, '#FAF4C8');
    assert.equal(cloned[1][0], null);

    // 引用不同（深拷贝）
    cloned[0][0].rawRgb.r = 999;
    assert.equal(gridData[0][0].rawRgb.r, 100);
  });

  it('应处理 null/undefined 的 rawRgb', () => {
    const gridData = [[{ x: 0, y: 0, rawRgb: null, markCode: 'A1', markHex: '#fff', markRgb: null }]];
    const cloned = deepCloneGridData(gridData, 1, 1);
    assert.equal(cloned[0][0].rawRgb, null);
    assert.equal(cloned[0][0].initialMarkRgb, null);
  });
});

describe('findColorHexByCode', () => {
  it('应返回已知色号的 hex', () => {
    const hex = findColorHexByCode('A1');
    assert.equal(hex, '#FAF4C8');
  });

  it('应返回 null 对于未知色号', () => {
    assert.equal(findColorHexByCode('UNKNOWN'), null);
  });

  it('连续调用应使用缓存', () => {
    // 第二次调用命中缓存
    const h1 = findColorHexByCode('B2');
    const h2 = findColorHexByCode('B2');
    assert.equal(h1, h2);
    assert.equal(h1, '#63F347');
  });
});
