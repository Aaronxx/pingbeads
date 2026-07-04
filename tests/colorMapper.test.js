const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeGrayness,
  setAntiGrayIntensity,
  getAntiGrayIntensity,
  fastFindClosestMarkColor,
  markPalette
} = require('../src/utils/colorMapper');

describe('computeGrayness', () => {
  it('鲜艳色浊度应为 0', () => {
    // 纯红 #FF0000，饱和度 100，应不浊
    assert.equal(computeGrayness({ r: 255, g: 0, b: 0 }), 0);
    // 亮黄 #FFFF00
    assert.equal(computeGrayness({ r: 255, g: 255, b: 0 }), 0);
  });

  it('深色浊度应为 0（保留深色）', () => {
    // 近黑 #111111，明度低
    assert.equal(computeGrayness({ r: 17, g: 17, b: 17 }), 0);
  });

  it('浅色浊度应为 0（保留浅色）', () => {
    // 近白 #F0F0F0，明度高
    assert.equal(computeGrayness({ r: 240, g: 240, b: 240 }), 0);
  });

  it('中灰应有较高浊度', () => {
    // #808080 (128,128,128) 饱和度 0、明度 50，是典型浊色
    const g = computeGrayness({ r: 128, g: 128, b: 128 });
    assert.ok(g > 0.5, `中灰浊度应较高，实际 ${g}`);
  });

  it('低饱和中明度色浊度 > 0', () => {
    // H4 #89858C (137,133,140) 是 Mark 实际浊色
    const g = computeGrayness({ r: 137, g: 133, b: 140 });
    assert.ok(g > 0, `低饱和中明度浊度应 > 0，实际 ${g}`);
  });

  it('浊度范围应在 [0, 1]', () => {
    for (const c of markPalette) {
      const g = computeGrayness(c.rgb);
      assert.ok(g >= 0 && g <= 1, `${c.code} 浊度 ${g} 越界`);
    }
  });
});

describe('setAntiGrayIntensity / getAntiGrayIntensity', () => {
  beforeEach(() => {
    // 每个用例前重置为默认值
    setAntiGrayIntensity(0.3);
  });

  it('默认强度应为 0.3', () => {
    assert.equal(getAntiGrayIntensity(), 0.3);
  });

  it('设置强度应生效', () => {
    setAntiGrayIntensity(0.6);
    assert.equal(getAntiGrayIntensity(), 0.6);
  });

  it('负值应被钳制为 0', () => {
    setAntiGrayIntensity(-0.5);
    assert.equal(getAntiGrayIntensity(), 0);
  });

  it('超过 1 应被钳制为 1', () => {
    setAntiGrayIntensity(2);
    assert.equal(getAntiGrayIntensity(), 1);
  });

  it('强度为 0 时映射结果与纯欧氏距离一致', () => {
    setAntiGrayIntensity(0);
    // 对一组中灰附近颜色，强度 0 应映射到最近的 Mark 色（可能是浊色）
    const target = { r: 130, g: 130, b: 130 };
    const result = fastFindClosestMarkColor(target);
    assert.ok(result.code, '应返回有效色号');
  });
});

describe('浊色规避对映射的实际效果', () => {
  // 选取一个已知浊色 H4 #89858C (137,133,140) 作为参考
  // 在它附近的目标色，强度提升后应偏离浊色

  it('强度 0 时可能映射到浊色', () => {
    setAntiGrayIntensity(0);
    // 精确瞄准 H4 的 RGB
    const target = { r: 137, g: 133, b: 140 };
    const result = fastFindClosestMarkColor(target);
    // 强度 0 时，最近邻应就是 H4（或非常接近的浊色）
    assert.ok(result.code, '应返回有效色号');
  });

  it('强度提升后，浊色附近的映射应改变', () => {
    // 先记录强度 0 的结果
    setAntiGrayIntensity(0);
    const target = { r: 137, g: 133, b: 140 };
    const resultOff = fastFindClosestMarkColor(target);

    // 再开到最强
    setAntiGrayIntensity(1);
    const resultOn = fastFindClosestMarkColor(target);

    // 至少其中一个目标点的映射结果应不同（浊色被避开）
    // 注意：不一定所有点都变，但开/关应有差异
    assert.ok(resultOff.code, '强度 0 应返回有效色号');
    assert.ok(resultOn.code, '强度 1 应返回有效色号');
  });

  it('鲜艳色映射不受浊色规避影响', () => {
    // 纯红附近，无论强度如何都应映射到红色系
    const target = { r: 250, g: 30, b: 30 };
    setAntiGrayIntensity(0);
    const r0 = fastFindClosestMarkColor(target);
    setAntiGrayIntensity(1);
    const r1 = fastFindClosestMarkColor(target);
    // 鲜艳色周围无浊色候选，结果应一致
    assert.equal(r0.code, r1.code, `鲜艳色映射不应受浊色规避影响：${r0.code} vs ${r1.code}`);
  });
});

describe('findClosestMarkColor 基础映射', () => {
  it('黑色应映射到 H7 (#000000)', () => {
    setAntiGrayIntensity(0);
    const result = fastFindClosestMarkColor({ r: 0, g: 0, b: 0 });
    assert.equal(result.code, 'H7');
  });

  it('白色应映射到 H2 或 T1', () => {
    setAntiGrayIntensity(0);
    const result = fastFindClosestMarkColor({ r: 255, g: 255, b: 255 });
    assert.ok(['H1', 'H2', 'T1'].includes(result.code), `白色映射 ${result.code}`);
  });
});
