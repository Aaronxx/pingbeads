/**
 * 孤立区域过滤（去杂色）
 *
 * 消除空间孤立的杂色点：格子的 markCode 和周围邻居都不同，且颜色差异大的点，并入周围主色。
 *
 * 算法思路：
 * - 不做连通区域扫描（markRgb 量化导致连通性差）
 * - 直接检查每个格子的"孤立性"：和周围8个邻居比较
 * - 如果格子的 markCode 和所有邻居都不同，且颜色差异 > threshold，就改写为主色
 *
 * @param {Array} gridData - 二维网格数据
 * @param {number} rows - 行数
 * @param {number} cols - 列数
 * @param {number} colorThreshold - 颜色差异阈值（markRgb 欧氏距离 > 此值才认为是孤立）
 * @returns {number} 被修改的格子数量（0 表示无修改）
 */
function filterIsolatedRegions(gridData, rows, cols, colorThreshold) {
  if (!gridData || rows <= 0 || cols <= 0 || colorThreshold <= 0) return 0;

  const colorThresholdSq = colorThreshold * colorThreshold;
  let modifiedCount = 0;

  // 8 个方向的偏移量
  const offsets = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1]
  ];

  // 第一遍：收集需要修改的格子（避免边改边判导致邻居颜色漂移）
  const toModify = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = gridData[row] && gridData[row][col];
      // 跳过空格、isEdge 格、无 markCode 或无 markRgb 的格
      if (!cell || !cell.markCode || !cell.markRgb || cell.isEdge || cell.isEmpty) continue;

      const cellMarkRgb = cell.markRgb;

      // 统计周围 8 个邻居的 markCode 和颜色距离
      const neighborColors = {}; // { markCode: count }
      let sameCodeNeighborCount = 0;
      let maxColorDistSq = 0;

      for (const [dr, dc] of offsets) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;

        const neighbor = gridData[nr] && gridData[nr][nc];
        if (!neighbor || !neighbor.markCode || !neighbor.markRgb) continue;

        // 统计邻居 markCode
        const ncode = neighbor.markCode;
        neighborColors[ncode] = (neighborColors[ncode] || 0) + 1;

        // 如果有邻居和自己 markCode 相同，就不算孤立
        if (ncode === cell.markCode) {
          sameCodeNeighborCount++;
        }

        // 计算颜色距离
        const nMarkRgb = neighbor.markRgb;
        const dr2 = cellMarkRgb.r - nMarkRgb.r;
        const dg2 = cellMarkRgb.g - nMarkRgb.g;
        const db2 = cellMarkRgb.b - nMarkRgb.b;
        const distSq = dr2 * dr2 + dg2 * dg2 + db2 * db2;
        maxColorDistSq = Math.max(maxColorDistSq, distSq);
      }

      // 判定是否孤立：
      // 1. 没有任何邻居和自己 markCode 相同
      // 2. 和邻居的最大颜色差异 > colorThreshold
      if (sameCodeNeighborCount === 0 && maxColorDistSq > colorThresholdSq) {
        // 找邻居中出现次数最多的 markCode 作为主色
        let bestColor = null;
        let bestCount = 0;
        for (const code in neighborColors) {
          if (neighborColors[code] > bestCount) {
            bestCount = neighborColors[code];
            bestColor = code;
          }
        }

        if (bestColor) {
          // 找到主色的 hex/rgb 信息
          let replacementHex = null;
          let replacementRgb = null;
          for (const [dr, dc] of offsets) {
            const nr = row + dr;
            const nc = col + dc;
            const n = gridData[nr] && gridData[nr][nc];
            if (n && n.markCode === bestColor) {
              replacementHex = n.markHex;
              replacementRgb = n.markRgb;
              break;
            }
          }

          if (replacementHex) {
            toModify.push({ row, col, bestColor, replacementHex, replacementRgb });
          }
        }
      }
    }
  }

  // 第二遍：统一改写
  for (const { row, col, bestColor, replacementHex, replacementRgb } of toModify) {
    const cell = gridData[row][col];
    cell.markCode = bestColor;
    cell.markHex = replacementHex;
    cell.markRgb = replacementRgb ? { ...replacementRgb } : null;
    modifiedCount++;
  }

  return modifiedCount;
}

/**
 * 根据 spotCleanLevel 获取过滤参数
 * @param {number} level - 0=关, 1=轻度, 2=中度, 3=强度
 * @returns {{ colorThreshold: number } | null}
 */
function getSpotCleanParams(level) {
  switch (level) {
    case 1: return { colorThreshold: 80 };   // 轻度：只去最明显的杂色点
    case 2: return { colorThreshold: 50 };   // 中度：去更多杂色点
    case 3: return { colorThreshold: 30 };   // 强度：去大部分杂色点
    default: return null;
  }
}

module.exports = {
  filterIsolatedRegions,
  getSpotCleanParams
};
