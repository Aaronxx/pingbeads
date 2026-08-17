const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeBaseScale, applyCustomCrop, computeCropStartCell,
  getCropModeMaxScale, recalcCropWindow, computeInitialCropWindow
} = require('../src/utils/cropHelpers');

describe('computeBaseScale', () => {
  it('大网格缩小适配 canvas', () => {
    // 200×200 格，每格 10px = 2000px，canvas 300px → baseScale = 300/2000 = 0.15
    const bs = computeBaseScale(200, 200, 10, 300, 300);
    assert.equal(bs, 0.15);
  });

  it('小网格不放大（baseScale = 1）', () => {
    // 10×10 格，每格 10px = 100px，canvas 300px → 不放大
    const bs = computeBaseScale(10, 10, 10, 300, 300);
    assert.equal(bs, 1);
  });

  it('宽高比不同取较小值', () => {
    // 200 列 100 行：宽方向 300/(200*10)=0.15，高方向 300/(100*10)=0.3 → 取 0.15
    const bs = computeBaseScale(200, 100, 10, 300, 300);
    assert.equal(bs, 0.15);
  });
});

describe('applyCustomCrop', () => {
  // 构造 5×5 测试网格
  const makeGrid = () => {
    const g = [];
    for (let r = 0; r < 5; r++) {
      g[r] = [];
      for (let c = 0; c < 5; c++) {
        g[r][c] = {
          x: c * 10, y: r * 10, width: 10, height: 10,
          rawRgb: { r: r * 10, g: c * 10, b: 0 },
          originalRgb: { r: r * 10, g: c * 10, b: 0 },
          markCode: 'A' + (r * 5 + c + 1),
          markHex: '#ffffff',
          markRgb: { r: r * 10, g: c * 10, b: 0 }
        };
      }
    }
    return g;
  };

  it('中心裁剪 3×3 from 5×5（start=1,1）', () => {
    const result = applyCustomCrop(makeGrid(), 1, 1, 3, 3);
    assert.equal(result.gridData.length, 3);
    assert.equal(result.gridData[0].length, 3);
    // 左上角应是原图 (1,1) 的数据
    assert.equal(result.gridData[0][0].markCode, 'A7');
    // 右下角应是原图 (3,3)
    assert.equal(result.gridData[2][2].markCode, 'A19');
  });

  it('偏移裁剪 (0,0) from 5×5 → 2×2', () => {
    const result = applyCustomCrop(makeGrid(), 0, 0, 2, 2);
    assert.equal(result.gridData[0][0].markCode, 'A1');
    assert.equal(result.gridData[1][1].markCode, 'A7');
  });

  it('越界裁剪填充空格子', () => {
    // start=(3,3) target=3×3 from 5×5：只有 (3,3)(3,4)(4,3)(4,4) 有效，其余越界
    const result = applyCustomCrop(makeGrid(), 3, 3, 3, 3);
    assert.equal(result.gridData[0][0].markCode, 'A19'); // (3,3) 有效
    assert.equal(result.gridData[0][2].isEmpty, true);   // (3,5) 越界
    assert.equal(result.gridData[2][2].isEmpty, true);   // (5,5) 越界
    assert.equal(result.gridData[2][2].markHex, '#F0F0F0');
  });

  it('完整字段保留（浅拷贝）', () => {
    const result = applyCustomCrop(makeGrid(), 0, 0, 1, 1);
    const cell = result.gridData[0][0];
    assert.deepEqual(cell.rawRgb, { r: 0, g: 0, b: 0 });
    assert.deepEqual(cell.markRgb, { r: 0, g: 0, b: 0 });
    assert.equal(cell.markCode, 'A1');
    assert.equal(cell.markHex, '#ffffff');
    assert.equal(cell.width, 10);
  });

  it('浅拷贝不共享引用', () => {
    const grid = makeGrid();
    const result = applyCustomCrop(grid, 0, 0, 1, 1);
    result.gridData[0][0].markCode = 'MODIFIED';
    assert.equal(grid[0][0].markCode, 'A1'); // 原图不变
  });
});

describe('computeCropStartCell', () => {
  // 测试参数：100×100 原图，gridSize=10，canvas 300×300
  // baseScale = min(300/1000, 300/1000, 1) = 0.3
  // cssCellSize = 10 * 0.3 * 1 = 3
  // cssGridOffsetX = (300 - 100*3) / 2 = 0
  const baseOpts = {
    canvasW: 300, canvasH: 300, userScale: 1,
    origCols: 100, origRows: 100, gridSize: 10,
    targetCols: 50, targetRows: 50
  };

  it('非镜像：cropWinX=0 → startCol=0', () => {
    const { startCol, startRow } = computeCropStartCell({
      ...baseOpts, cropWinX: 0, cropWinY: 0, mirrorImage: false
    });
    assert.equal(startCol, 0);
    assert.equal(startRow, 0);
  });

  it('非镜像：cropWinX=75 → startCol=25（75/3=25）', () => {
    const { startCol } = computeCropStartCell({
      ...baseOpts, cropWinX: 75, cropWinY: 0, mirrorImage: false
    });
    assert.equal(startCol, 25);
  });

  it('镜像：startCol 翻转', () => {
    // 非镜像 startCol=25 → 镜像 startCol = 100 - 50 - 25 = 25（碰巧相同）
    // 换一个值：cropWinX=30 → startCol=10 → 镜像 = 100-50-10 = 40
    const { startCol: normal } = computeCropStartCell({
      ...baseOpts, cropWinX: 30, cropWinY: 0, mirrorImage: false
    });
    const { startCol: mirrored } = computeCropStartCell({
      ...baseOpts, cropWinX: 30, cropWinY: 0, mirrorImage: true
    });
    assert.equal(normal, 10);
    assert.equal(mirrored, 40); // origCols - targetCols - normal = 100-50-10
  });

  it('镜像+非镜像对称：两者 startCol 之和 = origCols - targetCols', () => {
    for (const x of [0, 15, 30, 60, 90, 120]) {
      const n = computeCropStartCell({ ...baseOpts, cropWinX: x, cropWinY: 0, mirrorImage: false }).startCol;
      const m = computeCropStartCell({ ...baseOpts, cropWinX: x, cropWinY: 0, mirrorImage: true }).startCol;
      assert.equal(n + m, baseOpts.origCols - baseOpts.targetCols,
        `对称性失败 at x=${x}: ${n} + ${m} != ${baseOpts.origCols - baseOpts.targetCols}`);
    }
  });

  it('clamp：cropWinX 超出范围不越界', () => {
    const { startCol } = computeCropStartCell({
      ...baseOpts, cropWinX: 1000, cropWinY: 0, mirrorImage: false
    });
    assert.equal(startCol, 50); // origCols - targetCols = 50
  });
});

describe('getCropModeMaxScale', () => {
  it('裁剪框+2格≤canvas 时上限正确', () => {
    // 100×100 原图，52×52 预设，gridSize=10，canvas 300×300
    // baseScale = 0.3, availCols = min(100, 56) = 56
    // maxByW = 300 / (56 * 10 * 0.3) = 300/168 ≈ 1.786
    const maxScale = getCropModeMaxScale({
      origCols: 100, origRows: 100, gridSize: 10,
      canvasW: 300, canvasH: 300,
      targetCols: 52, targetRows: 52
    });
    assert.ok(maxScale >= 1);
    assert.ok(maxScale < 2);
  });

  it('原图格数不足时用原图格数限制', () => {
    // 原图只有 54 格，预设 52，availCols = min(54, 56) = 54
    const maxScale = getCropModeMaxScale({
      origCols: 54, origRows: 54, gridSize: 10,
      canvasW: 300, canvasH: 300,
      targetCols: 52, targetRows: 52
    });
    assert.ok(maxScale >= 1);
  });

  it('下限至少 1', () => {
    // 极端：原图非常大，预设也大
    const maxScale = getCropModeMaxScale({
      origCols: 500, origRows: 500, gridSize: 10,
      canvasW: 300, canvasH: 300,
      targetCols: 200, targetRows: 200
    });
    assert.ok(maxScale >= 1);
  });
});

describe('recalcCropWindow', () => {
  it('scale 变化后裁剪框尺寸正确', () => {
    // 100×100 原图，52×52 预设，gridSize=10，canvas 300×300
    // baseScale=0.3, userScale=2 → cellSize=6, cropWinW = 52*6 = 312
    const result = recalcCropWindow({
      canvasW: 300, canvasH: 300, userScale: 2,
      origCols: 100, origRows: 100, gridSize: 10,
      targetCols: 52, targetRows: 52,
      prevCropWinX: 0, prevCropWinY: 0, prevCropWinW: 156, prevCropWinH: 156
    });
    assert.equal(result.cropWinW, 52 * 10 * 0.3 * 2);
    assert.equal(result.cropWinH, 52 * 10 * 0.3 * 2);
  });

  it('保持中心点不变', () => {
    const prev = { prevCropWinX: 50, prevCropWinY: 50, prevCropWinW: 100, prevCropWinH: 100 };
    const result = recalcCropWindow({
      canvasW: 300, canvasH: 300, userScale: 1,
      origCols: 100, origRows: 100, gridSize: 10,
      targetCols: 50, targetRows: 50,
      ...prev
    });
    const prevCenterX = 50 + 100 / 2;
    const newCenterX = result.cropWinX + result.cropWinW / 2;
    assert.ok(Math.abs(prevCenterX - newCenterX) < 1, '中心点 X 应保持不变');
  });

  it('clamp 到 canvas 范围', () => {
    const result = recalcCropWindow({
      canvasW: 300, canvasH: 300, userScale: 1,
      origCols: 100, origRows: 100, gridSize: 10,
      targetCols: 80, targetRows: 80, // 大裁剪框
      prevCropWinX: 0, prevCropWinY: 0, prevCropWinW: 10, prevCropWinH: 10
    });
    assert.ok(result.cropWinX >= 0);
    assert.ok(result.cropWinY >= 0);
    assert.ok(result.cropWinX + result.cropWinW <= 300);
    assert.ok(result.cropWinY + result.cropWinH <= 300);
  });
});

describe('computeInitialCropWindow', () => {
  it('初始裁剪框居中', () => {
    const result = computeInitialCropWindow({
      canvasW: 300, canvasH: 300,
      origCols: 100, origRows: 100, gridSize: 10,
      targetCols: 52, targetRows: 52
    });
    // cropWinW = 52 * 10 * 0.3 = 156, cropWinX = (300-156)/2 = 72
    assert.equal(result.cropWinW, 52 * 10 * 0.3);
    assert.equal(result.cropWinX, (300 - result.cropWinW) / 2);
    assert.equal(result.cropWinY, (300 - result.cropWinH) / 2);
  });

  it('尺寸 = targetCols × cssCellSize', () => {
    const result = computeInitialCropWindow({
      canvasW: 300, canvasH: 300,
      origCols: 50, origRows: 50, gridSize: 10,
      targetCols: 20, targetRows: 20
    });
    // baseScale = min(300/500, 300/500, 1) = 0.6, cssCellSize = 10*0.6 = 6
    assert.equal(result.cropWinW, 20 * 6);
    assert.equal(result.cropWinH, 20 * 6);
  });
});
