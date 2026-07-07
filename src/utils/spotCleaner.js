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
      } else if (sameCodeNeighborCount > 0) {
        // 有邻居和自己 markCode 相同，可能是保边量化导致的
        // 检查是否是杂色点（和邻居颜色差异大）
        const avgNeighborDistSq = maxColorDistSq; // 简化：用最大距离
        if (avgNeighborDistSq > colorThresholdSq * 4) {
          // 颜色差异很大，可能是杂色点被保边量化保护了
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
 * 保边量化（连通区域合并）
 *
 * 在 markCode 映射之后，用原始颜色（rawRgb）做连通区域扫描，
 * 对于连通区域内的格子，统一为出现次数最多的 markCode。
 *
 * 这样空间相邻、颜色相近的格子会被强制映射到同一个 markCode，
 * 避免连续的色块被切成不连续的碎片。
 *
 * @param {Array} gridData - 二维网格数据
 * @param {number} rows - 行数
 * @param {number} cols - 列数
 * @param {number} colorThreshold - 颜色差异阈值（rawRgb 欧氏距离 < 此值的视为同色）
 * @returns {number} 被修改的格子数量（0 表示无修改）
 */
function preserveEdgeQuantization(gridData, rows, cols, colorThreshold) {
  if (!gridData || rows <= 0 || cols <= 0 || colorThreshold <= 0) return 0;

  const totalCells = rows * cols;
  const visited = new Uint8Array(totalCells);
  const directions = [-cols, cols, -1, 1]; // 上下左右偏移量
  const colorThresholdSq = colorThreshold * colorThreshold;
  let modifiedCount = 0;

  for (let idx = 0; idx < totalCells; idx++) {
    if (visited[idx]) continue;

    const row = (idx / cols) | 0;
    const col = idx % cols;

    const cell = gridData[row] && gridData[row][col];
    // 跳过空格、isEdge 格、无 rawRgb 的格
    if (!cell || !cell.rawRgb || cell.isEdge || cell.isEmpty) {
      visited[idx] = 1;
      continue;
    }

    // BFS 收集颜色相似的连通块（用 rawRgb 距离判定）
    const regionRawRgb = cell.rawRgb;
    const regionCells = [];
    const markCodeCounts = {}; // { markCode: count }

    const queue = [idx];
    visited[idx] = 1;
    let head = 0;

    while (head < queue.length) {
      const curIdx = queue[head++];
      regionCells.push(curIdx);

      const curRow = (curIdx / cols) | 0;
      const curCol = curIdx % cols;

      // 统计当前格子的 markCode
      const curCell = gridData[curRow][curCol];
      if (curCell && curCell.markCode) {
        const code = curCell.markCode;
        markCodeCounts[code] = (markCodeCounts[code] || 0) + 1;
      }

      // 扩展邻居
      for (let d = 0; d < 4; d++) {
        const nIdx = curIdx + directions[d];
        if (nIdx < 0 || nIdx >= totalCells) continue;
        if (d === 2 && curCol === 0) continue; // 左
        if (d === 3 && curCol === cols - 1) continue; // 右

        if (visited[nIdx]) continue;

        const nRow = (nIdx / cols) | 0;
        const nCol = nIdx % cols;
        const neighbor = gridData[nRow] && gridData[nRow][nCol];
        if (!neighbor || !neighbor.rawRgb) {
          visited[nIdx] = 1;
          continue;
        }

        // 颜色相似度判定：rawRgb 欧氏距离平方 < colorThresholdSq
        const nRawRgb = neighbor.rawRgb;
        const dr = regionRawRgb.r - nRawRgb.r;
        const dg = regionRawRgb.g - nRawRgb.g;
        const db = regionRawRgb.b - nRawRgb.b;
        const distSq = dr * dr + dg * dg + db * db;

        if (distSq < colorThresholdSq) {
          visited[nIdx] = 1;
          queue.push(nIdx);
        }
      }
    }

    // 如果连通块只有 1 个格子，不需要合并
    if (regionCells.length <= 1) continue;

    // 找连通块中出现次数最多的 markCode
    let bestCode = null;
    let bestCount = 0;
    for (const code in markCodeCounts) {
      if (markCodeCounts[code] > bestCount) {
        bestCount = markCodeCounts[code];
        bestCode = code;
      }
    }

    if (!bestCode) continue;

    // 找到 bestCode 的 hex/rgb 信息
    let bestHex = null;
    let bestRgb = null;
    for (const cellIdx of regionCells) {
      const r = (cellIdx / cols) | 0;
      const c = cellIdx % cols;
      const cell = gridData[r][c];
      if (cell && cell.markCode === bestCode) {
        bestHex = cell.markHex;
        bestRgb = cell.markRgb;
        break;
      }
    }

    if (!bestHex) continue;

    // 统一改写连通块内所有格子的 markCode
    let changed = false;
    for (const cellIdx of regionCells) {
      const r = (cellIdx / cols) | 0;
      const c = cellIdx % cols;
      const cell = gridData[r][c];
      if (cell && cell.markCode !== bestCode) {
        cell.markCode = bestCode;
        cell.markHex = bestHex;
        cell.markRgb = bestRgb ? { ...bestRgb } : null;
        changed = true;
      }
    }

    if (changed) modifiedCount++;
  }

  return modifiedCount;
}

/**
 * 根据 spotCleanLevel 获取过滤参数
 * @param {number} level - 0=关, 1=轻度, 2=中度, 3=强度
 * @returns {{ edgeThreshold: number, spotThreshold: number } | null}
 */
/**
 * 根据 spotCleanLevel 获取过滤参数
 * @param {number} level - 0=关, 1=轻度, 2=中度, 3=强度
 * @returns {{ edgeThreshold: number, spotThreshold: number } | null}
 */
function getSpotCleanParams(level) {
  switch (level) {
    case 1: return { edgeThreshold: 0, spotThreshold: 80 };   // 轻度：只去杂色，不做保边量化
    case 2: return { edgeThreshold: 50, spotThreshold: 50 };   // 中度：保边50，去杂色50
    case 3: return { edgeThreshold: 80, spotThreshold: 30 };   // 强度：保边80，去杂色30
    default: return null;
  }
}

module.exports = {
  filterIsolatedRegions,
  preserveEdgeQuantization,
  getSpotCleanParams
};
