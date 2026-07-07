/**
 * 孤立区域过滤（去杂色）
 *
 * 消除空间孤立的杂色点：连通区域 ≤ minSize 个豆的小色块，并入周围主色。
 * 与 aggregateSimilarColors 互补——后者按颜色相似度全局合并，本函数按空间连通性合并。
 */

/**
 * 创建 rows×cols 的二维访问标记数组（BFS 用）
 */
function createVisitedArray(rows, cols) {
  const visited = new Array(rows);
  for (let r = 0; r < rows; r++) {
    visited[r] = new Array(cols).fill(false);
  }
  return visited;
}

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

  const visited = createVisitedArray(rows, cols);
  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  let modifiedCount = 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (visited[row][col]) continue;

      const cell = gridData[row] && gridData[row][col];
      // 跳过空格、isEdge 格、无 markCode 的格
      if (!cell || !cell.markCode || cell.isEdge || cell.isEmpty) {
        visited[row][col] = true;
        continue;
      }

      const regionColor = cell.markCode;

      // BFS 收集同色连通块
      const regionCells = [];
      const neighborColors = {}; // { markCode: count }  邻居主色统计

      const queue = [{ row, col }];
      visited[row][col] = true;

      let head = 0;
      while (head < queue.length) {
        const cur = queue[head++];
        regionCells.push(cur);

        for (const [dr, dc] of directions) {
          const nr = cur.row + dr;
          const nc = cur.col + dc;

          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;

          const neighbor = gridData[nr] && gridData[nr][nc];
          if (!neighbor || !neighbor.markCode) continue;

          if (neighbor.markCode === regionColor && !visited[nr][nc]) {
            // 同色，加入连通块
            visited[nr][nc] = true;
            queue.push({ row: nr, col: nc });
          } else if (neighbor.markCode !== regionColor) {
            // 不同色邻居，统计为主色候选
            const ncode = neighbor.markCode;
            neighborColors[ncode] = (neighborColors[ncode] || 0) + 1;
          }
        }
      }

      // 判定是否孤立
      if (regionCells.length > minSize) continue;

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
      for (const [dr, dc] of directions) {
        for (const { row: rr, col: cc } of regionCells) {
          const nr = rr + dr;
          const nc = cc + dc;
          const n = gridData[nr] && gridData[nr][nc];
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
      for (const { row: rr, col: cc } of regionCells) {
        const c = gridData[rr][cc];
        c.markCode = bestColor;
        c.markHex = replacementHex;
        c.markRgb = replacementRgb ? { ...replacementRgb } : null;
      }
      modifiedCount++;
    }
  }

  return modifiedCount;
}

module.exports = {
  filterIsolatedRegions
};
