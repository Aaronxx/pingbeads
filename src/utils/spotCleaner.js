/**
 * 孤立区域过滤（去杂色）
 *
 * 消除空间孤立的杂色点：连通区域 ≤ minSize 个豆的小色块，并入周围主色。
 * 与 aggregateSimilarColors 互补——后者按颜色相似度全局合并，本函数按空间连通性合并。
 *
 * 性能优化：
 * - 整数编码（row*cols+col）替代对象，减少内存分配
 * - Uint8Array 替代二维数组，减少 GC 压力
 * - 大区域 BFS 提前终止（超过 minSize 即停止收集）
 */

/**
 * 过滤孤立的小色块
 * @param {Array} gridData - 二维网格数据
 * @param {number} rows - 行数
 * @param {number} cols - 列数
 * @param {number} minSize - 最小保留面积（连通块 ≤ 此值的会被合并）
 * @returns {number} 被修改的色块数量（0 表示无修改）
 */
function filterIsolatedRegions(gridData, rows, cols, minSize) {
  if (!gridData || rows <= 0 || cols <= 0 || minSize <= 0) return 0;

  const totalCells = rows * cols;
  // Uint8Array 比二维数组快得多，内存占用也更小
  const visited = new Uint8Array(totalCells);
  const directions = [-cols, cols, -1, 1]; // 上下左右的偏移量
  let modifiedCount = 0;

  // 预分配队列（避免动态扩容），最大容量 = minSize + 1（超过即停止）
  const maxQueueSize = minSize + 1;
  const queue = new Int32Array(maxQueueSize);

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

    const regionColor = cell.markCode;

    // BFS 收集同色连通块（使用整数编码）
    let regionSize = 0;
    let regionOverflow = false; // 是否超过 minSize
    const regionCellsBuf = new Int32Array(maxQueueSize); // 存储区域内的格子索引
    const neighborColors = {}; // { markCode: count }

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
        // 不 break，继续扫描剩余邻居以统计邻居颜色（后面不再改写，但需要 visited 标记）
      }

      const curRow = (curIdx / cols) | 0;
      const curCol = curIdx % cols;

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

        if (neighbor.markCode === regionColor) {
          visited[nIdx] = 1;
          if (!regionOverflow) {
            queue[qTail++] = nIdx;
          }
        } else {
          // 不同色邻居，统计为主色候选
          const ncode = neighbor.markCode;
          neighborColors[ncode] = (neighborColors[ncode] || 0) + 1;
        }
      }
    }

    // 判定是否孤立
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

module.exports = {
  filterIsolatedRegions
};
