const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { aggregateSimilarColors } = require('../src/utils/imageProcessor');
const { markPalette } = require('../src/utils/colorMapper');

/** 构造测试网格：指定行列数的同色网格 */
function makeUniformGrid(rows, cols, code) {
  const c = markPalette.find(p => p.code === code);
  const grid = [];
  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c2 = 0; c2 < cols; c2++) {
      grid[r][c2] = {
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

describe('aggregateSimilarColors', () => {
  it('targetCount=0 时不应改动', () => {
    const grid = makeUniformGrid(5, 5, 'F4');
    aggregateSimilarColors(grid, 5, 5, 0);
    assert.equal(grid[0][0].markCode, 'F4');
  });

  it('gridData=null 安全返回', () => {
    assert.doesNotThrow(() => aggregateSimilarColors(null, 0, 0, 10));
  });

  it('色号数 <= targetCount 时不聚类', () => {
    // 只有 2 种色，目标 10，应保持不变
    const grid = makeUniformGrid(5, 5, 'F4');
    grid[0][0].markCode = 'E5';
    grid[0][0].rawRgb = { r: 245, g: 81, b: 162 };
    aggregateSimilarColors(grid, 5, 5, 10);
    assert.equal(grid[0][0].markCode, 'E5');
  });

  it('回归：浅彩色不应被聚成纯白 T1', () => {
    // 模拟白底图：大量白色背景 + 少量浅米色(G16)主体
    // G16 #E0C593 是浅米色(饱和度低但有黄调)，不应被纯白 T1 吞并
    const grid = makeUniformGrid(10, 10, 'T1');  // 白色背景
    // 中间放 G16 米色
    const g16 = markPalette.find(p => p.code === 'G16');
    for (let r = 4; r < 6; r++) {
      for (let c = 4; c < 6; c++) {
        grid[r][c] = {
          markCode: 'G16', markHex: g16.hex, markRgb: { ...g16.rgb },
          rawRgb: { ...g16.rgb }, originalRgb: { ...g16.rgb }
        };
      }
    }
    aggregateSimilarColors(grid, 10, 10, 3);

    // G16 格子聚合后不应是纯白 T1（应保留浅色调）
    const g16Cells = [];
    for (let r = 4; r < 6; r++) for (let c = 4; c < 6; c++) g16Cells.push(grid[r][c].markCode);
    const becameT1 = g16Cells.every(code => code === 'T1');
    assert.ok(!becameT1, `G16 米色不应被聚成纯白 T1，实际: ${g16Cells.join(',')}`);
  });

  it('回归：高饱和彩色不应被聚成白色', () => {
    // 大量白色 + 红色主体，红色应保持彩色
    const grid = makeUniformGrid(10, 10, 'T1');
    const f4 = markPalette.find(p => p.code === 'F4');
    for (let r = 3; r < 7; r++) {
      for (let c = 3; c < 7; c++) {
        grid[r][c] = {
          markCode: 'F4', markHex: f4.hex, markRgb: { ...f4.rgb },
          rawRgb: { ...f4.rgb }, originalRgb: { ...f4.rgb }
        };
      }
    }
    aggregateSimilarColors(grid, 10, 10, 5);

    // F4 红色格子应保持彩色（饱和度 > 0.3）
    for (let r = 3; r < 7; r++) {
      for (let c = 3; c < 7; c++) {
        const rgb = grid[r][c].markRgb;
        const mx = Math.max(rgb.r, rgb.g, rgb.b);
        const mn = Math.min(rgb.r, rgb.g, rgb.b);
        const sat = mx === 0 ? 0 : (mx - mn) / mx;
        assert.ok(sat > 0.3, `红色区域格子 ${grid[r][c].markCode} 饱和度 ${sat.toFixed(2)} 过低，可能变白`);
      }
    }
  });

  it('聚类后格子数应减少到约 targetCount', () => {
    // 多种色，聚成少量
    const grid = makeUniformGrid(10, 10, 'T1');
    const codes = ['F4', 'E5', 'D1', 'A4', 'B5'];
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        if (r < 2) {
          const cc = markPalette.find(p => p.code === codes[c % codes.length]);
          grid[r][c] = {
            markCode: cc.code, markHex: cc.hex, markRgb: { ...cc.rgb },
            rawRgb: { ...cc.rgb }, originalRgb: { ...cc.rgb }
          };
        }
      }
    }
    aggregateSimilarColors(grid, 10, 10, 3);
    const used = new Set();
    for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) used.add(grid[r][c].markCode);
    // 应该比原来少（原来 6 种：T1 + 5个彩色）
    assert.ok(used.size <= 6, `聚类后色号数 ${used.size} 应减少`);
  });
});

describe('classic 版 aggregateSimilarColors（共享实现委托）', () => {
  const { aggregateSimilarColors: classicAggregate } = require('../src/utils/algorithms/classic');

  it('暴露导出且可正常聚类（色号被合并）', () => {
    assert.equal(typeof classicAggregate, 'function');
    const grid = makeUniformGrid(10, 10, 'T1');
    const codes = ['F4', 'E5', 'D1', 'A4', 'B5'];
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        if (r < 2) {
          const cc = markPalette.find(p => p.code === codes[c % codes.length]);
          grid[r][c] = {
            markCode: cc.code, markHex: cc.hex, markRgb: { ...cc.rgb },
            rawRgb: { ...cc.rgb }, originalRgb: { ...cc.rgb }
          };
        }
      }
    }
    classicAggregate(grid, 10, 10, 3);
    const used = new Set();
    for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) used.add(grid[r][c].markCode);
    assert.ok(used.size <= 6, `classic 聚类后色号数 ${used.size} 应减少`);
  });

  it('targetCount=0 时不应改动（与 current 版一致）', () => {
    const grid = makeUniformGrid(5, 5, 'F4');
    classicAggregate(grid, 5, 5, 0);
    assert.equal(grid[0][0].markCode, 'F4');
  });
});
