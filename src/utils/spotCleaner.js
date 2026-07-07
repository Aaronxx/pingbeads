/**
 * 孤立区域过滤（去杂色）
 *
 * 消除空间孤立的杂色点：连通区域 ≤ minSize 个豆、且和邻居主色差异大的小色块，并入周围主色。
 *
 * 与 aggregateSimilarColors 互补：
 * - aggregateSimilarColors：按颜色相似度全局合并（K-means 聚类）
 * - filterIsolatedRegions：按空间连通性 + 颜色差异合并（连通区域扫描）
 *
 * 性能优化：
 * - 整数编码（row*cols+col）替代对象，减少内存分配
 * - Uint8Array 替代二维数组，减少 GC 压力
 * - 大区域 BFS 提前终止（超过 minSize 即停止收集）
 *
 * @param {Array} gridData - 二维网格数据
 * @param {number} rows - 行数
 * @param {number} cols - 列数
 * @param {number} minSize - 最小保留面积（连通块 ≤ 此值的才会被考虑合并）
 * @param {number} colorThreshold - 颜色差异阈值（连通判定用，markRgb 欧氏距离 < 此值的视为同色）
 * @returns {number} 被修改的色块数量（0 表示无修改）
 */
function filterIsolatedRegions(gridData, rows, cols, minSize, colorThreshold) {
  if (!gridData || rows <= 0 || cols <= 0 || minSize <= 0 || colorThreshold <= 0) return 0;

  const totalCells = rows * cols;
  const visited = new Uint8Array(totalCells);
  const directions = [-cols, cols, -1, 1]; // 上下左右偏移量
  const colorThresholdSq = colorThreshold * colorThreshold; // 用平方距离比较，避免 sqrt
  let modifiedCount = 0;

  // 预分配队列和区域缓冲区
  const maxQueueSize = minSize + 1;
  const queue = new Int32Array(maxQueueSize);
  const regionCellsBuf = new Int32Array(maxQueueSize);

  for (let idx = 0; idx < totalCells; idx++) {
    if (visited[idx]) continue;

    const row = (idx / cols) | 0;
    const col = idx % cols;

    const cell = gridData[row] && gridData[row][col];
    // 跳过空格、isEdge 格、无 markCode 的格
    if (!cell || !cell.markCode || cell.isEdge || cell.isEmpty) {
      visited[idx] = 1;
      continue;
    }

    // BFS 收集颜色相似的连通块（用 markRgb 距离判定）
    const regionMarkRgb = cell.markRgb;
    let regionSize = 0;
    let regionOverflow = false;
    const neighborColors = {}; // { markCode: count } 邻居主色统计

    let qHead = 0;
    let qTail = 0;
    queue[qTail++] = idx;
    visited[idx] = 1;

    while (qHead < qTail) {
      const curIdx = queue[qHead++];
      regionCellsBuf[regionSize++] = curIdx;

      // 如果已经收集够了，标记溢出但继续扫描邻居（用于统计邻居颜色）
      if (regionSize > minSize) {
        regionOverflow = true;
      }

      const curRow = (curIdx / cols) | 0;
      const curCol = curIdx % cols;
      const curCell = gridData[curRow][curCol];
      const curMarkRgb = curCell.markRgb;

      for (let d = 0; d < 4; d++) {
        const nIdx = curIdx + directions[d];
        // 边界检查
        if (nIdx < 0 || nIdx >= totalCells) continue;
        // 左右越界检查
        if (d === 2 && curCol === 0) continue; // 左
        if (d === 3 && curCol === cols - 1) continue; // 右

        if (visited[nIdx]) continue;

        const nRow = (nIdx / cols) | 0;
        const nCol = nIdx % cols;
        const neighbor = gridData[nRow] && gridData[nRow][nCol];
        if (!neighbor || !neighbor.markCode) {
          visited[nIdx] = 1;
          continue;
        }

        // 颜色相似度判定：markRgb 欧氏距离平方 < colorThresholdSq
        const nMarkRgb = neighbor.markRgb;
        const dr = curMarkRgb.r - nMarkRgb.r;
        const dg = curMarkRgb.g - nMarkRgb.g;
        const db = curMarkRgb.b - nMarkRgb.b;
        const distSq = dr * dr + dg * dg + db * db;

        if (distSq < colorThresholdSq) {
          // 颜色相似，加入连通块
          visited[nIdx] = 1;
          if (!regionOverflow) {
            queue[qTail++] = nIdx;
          }
        } else {
          // 颜色不同，统计为邻居主色候选
          const ncode = neighbor.markCode;
          neighborColors[ncode] = (neighborColors[ncode] || 0) + 1;
        }
      }
    }

    // 判定是否孤立：连通块 ≤ minSize 才考虑合并
    if (regionOverflow) continue;

    // 找邻居中出现次数最多的主色
    let bestColor = null;
    let bestCount = 0;
    for (const code in neighborColors) {
      if (neighborColors[code] > bestCount) {
        bestCount = neighborColors[code];
        bestColor = code;
      }
    }

    if (!bestColor) continue; // 无邻居（不应出现）

    // 找到主色的 hex/rgb 信息（从第一个该颜色的邻居格获取）
    let replacementHex = null;
    let replacementRgb = null;
    for (let i = 0; i < regionSize; i++) {
      const rIdx = regionCellsBuf[i];
      const rRow = (rIdx / cols) | 0;
      const rCol = rIdx % cols;
      for (let d = 0; d < 4; d++) {
        const nIdx = rIdx + directions[d];
        if (nIdx < 0 || nIdx >= totalCells) continue;
        if (d === 2 && rCol === 0) continue;
        if (d === 3 && rCol === cols - 1) continue;
        const nRow = (nIdx / cols) | 0;
        const nCol = nIdx % cols;
        const n = gridData[nRow] && gridData[nRow][nCol];
        if (n && n.markCode === bestColor) {
          replacementHex = n.markHex;
          replacementRgb = n.markRgb;
          break;
        }
      }
      if (replacementHex) break;
    }

    if (!replacementHex) continue;

    // 条件 B：和邻居主色的差异 > colorThreshold 才改写
    //（差异小说明可能是细节，不应改写）
    const regionRepRgb = regionMarkRgb; // 连通块代表色（第一个格子的 markRgb）
    const repDr = regionRepRgb.r - replacementRgb.r;
    const repDg = regionRepRgb.g - replacementRgb.g;
    const repDb = regionRepRgb.b - replacementRgb.b;
    const repDistSq = repDr * repDr + repDg * repDg + repDb * repDb;

    if (repDistSq <= colorThresholdSq) continue; // 和邻居颜色相近，不改写

    // 统一改写整块
    for (let i = 0; i < regionSize; i++) {
      const rIdx = regionCellsBuf[i];
      const rRow = (rIdx / cols) | 0;
      const rCol = rIdx % cols;
      const c = gridData[rRow][rCol];
      c.markCode = bestColor;
      c.markHex = replacementHex;
      c.markRgb = replacementRgb ? { ...replacementRgb } : null;
    }
    modifiedCount++;
  }

  return modifiedCount;
}

/**
 * 根据 spotCleanLevel 获取过滤参数
 * @param {number} level - 0=关, 1=轻度, 2=中度, 3=强度
 * @returns {{ minSize: number, colorThreshold: number } | null}
 */
function getSpotCleanParams(level) {
  switch (level) {
    case 1: return { minSize: 2, colorThreshold: 80 };   // 轻度：≤2豆、色差>80
    case 2: return { minSize: 5, colorThreshold: 40 };   // 中度：≤5豆、色差>40
    case 3: return { minSize: 15, colorThreshold: 30 };  // 强度：≤15豆、色差>30
    default: return null;
  }
}

module.exports = {
  filterIsolatedRegions,
  getSpotCleanParams
};
