/**
 * 曼哈顿距离 K-means 颜色聚合（共享实现）
 *
 * 原 imageProcessor.js 与 classic.js 的 aggregateSimilarColors 算法本体逐句等价
 * （曼哈顿分配、均匀采样初始中心、频次加权更新、收敛阈值 >3、5 次迭代、无空间滤波），
 * 仅注入的 fastFindClosestMarkColor 来源不同，因此提取为共享函数。
 *
 * 依赖约束：本模块不 require imageProcessor / colorPipeline，避免循环依赖；
 * 唯一外部依赖是注入的 fastFind（调用方传入各自版本）。
 *
 * @param {Array} gridData - 网格数据（会就地修改 markCode/markHex/markRgb）
 * @param {number} rows
 * @param {number} cols
 * @param {number} targetCount - 目标色块数量
 * @param {Function} fastFind - (rgb) => { code, hex, rgb } 色号查找函数
 * @returns {Array} gridData
 */
function aggregateKMeansManhattan(gridData, rows, cols, targetCount, fastFind) {
  if (!gridData || targetCount <= 0) return gridData;

  const allColors = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = gridData[row] && gridData[row][col];
      if (cell && cell.originalRgb) {
        allColors.push({ row, col, rgb: cell.originalRgb });
      }
    }
  }
  if (allColors.length === 0) return gridData;
  if (allColors.length <= targetCount) return gridData;

  const colorCountMap = new Map();
  for (const c of allColors) {
    const key = `${c.rgb.r},${c.rgb.g},${c.rgb.b}`;
    if (!colorCountMap.has(key)) {
      colorCountMap.set(key, { rgb: c.rgb, count: 0 });
    }
    colorCountMap.get(key).count++;
  }
  const uniqueColors = Array.from(colorCountMap.values());
  if (uniqueColors.length <= targetCount) return gridData;

  // K-means 初始中心：均匀采样
  const centers = [];
  const step = Math.max(1, Math.floor(uniqueColors.length / targetCount));
  for (let i = 0; i < targetCount && i * step < uniqueColors.length; i++) {
    centers.push({ ...uniqueColors[i * step].rgb });
  }
  while (centers.length < targetCount && centers.length < uniqueColors.length) {
    centers.push({ ...uniqueColors[centers.length].rgb });
  }

  const maxIterations = 5;
  let lastAssign = new Array(uniqueColors.length);

  for (let iter = 0; iter < maxIterations; iter++) {
    const clusters = Array.from({ length: centers.length }, () => []);

    for (let ci = 0; ci < uniqueColors.length; ci++) {
      const colorInfo = uniqueColors[ci];
      const cr = colorInfo.rgb.r;
      const cg = colorInfo.rgb.g;
      const cb = colorInfo.rgb.b;
      let minDist = Infinity;
      let minIdx = 0;
      for (let i = 0; i < centers.length; i++) {
        // 曼哈顿距离分配
        const dist = Math.abs(centers[i].r - cr) + Math.abs(centers[i].g - cg) + Math.abs(centers[i].b - cb);
        if (dist < minDist) { minDist = dist; minIdx = i; }
      }
      lastAssign[ci] = minIdx;
      clusters[minIdx].push(colorInfo);
    }

    let changed = false;
    for (let i = 0; i < centers.length; i++) {
      if (clusters[i].length === 0) continue;
      let sumR = 0, sumG = 0, sumB = 0;
      for (const c of clusters[i]) {
        sumR += c.rgb.r * c.count;
        sumG += c.rgb.g * c.count;
        sumB += c.rgb.b * c.count;
      }
      const totalWeight = clusters[i].reduce((sum, c) => sum + c.count, 0);
      const newCenter = {
        r: Math.round(sumR / totalWeight),
        g: Math.round(sumG / totalWeight),
        b: Math.round(sumB / totalWeight)
      };
      const dist = Math.abs(centers[i].r - newCenter.r) + Math.abs(centers[i].g - newCenter.g) + Math.abs(centers[i].b - newCenter.b);
      if (dist > 3) { centers[i] = newCenter; changed = true; }
    }
    if (!changed) break;
  }

  // 映射中心到色板
  const centerMarkColors = centers.map(center => fastFind(center));

  // 构建 RGB → 簇索引映射
  const rgbToCenterIdx = new Map();
  for (let ci = 0; ci < uniqueColors.length; ci++) {
    const colorInfo = uniqueColors[ci];
    const key = (colorInfo.rgb.r << 16) | (colorInfo.rgb.g << 8) | colorInfo.rgb.b;
    rgbToCenterIdx.set(key, lastAssign[ci]);
  }

  // 应用到所有格子
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = gridData[row] && gridData[row][col];
      if (!cell || !cell.originalRgb) continue;
      const key = (cell.originalRgb.r << 16) | (cell.originalRgb.g << 8) | cell.originalRgb.b;
      const centerIdx = rgbToCenterIdx.get(key);
      if (centerIdx !== undefined) {
        const markColor = centerMarkColors[centerIdx];
        cell.markCode = markColor.code;
        cell.markHex = markColor.hex;
        cell.markRgb = markColor.rgb;
      }
    }
  }

  return gridData;
}

module.exports = { aggregateKMeansManhattan };
