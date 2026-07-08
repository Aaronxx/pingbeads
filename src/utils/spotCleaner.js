/**
 * 孤立区域过滤（去杂色）- 军队对抗模型
 *
 * 颜色越多的吞噬能力越强：
 * - 对于每个格子，统计周围8个邻居的 markCode 分布
 * - 如果邻居中某个颜色的格子数 > threshold，就改写为该颜色
 * - 这样大片颜色会吞噬小片颜色
 *
 * @param {Array} gridData - 二维网格数据
 * @param {number} rows - 行数
 * @param {number} cols - 列数
 * @param {number} spotThreshold - 邻居数量阈值（邻居中某个颜色的格子数 > 此值才考虑吞噬）
 * @param {number} protectThreshold - 色差保护阈值（当前格子和主色的 markRgb 欧氏距离 < 此值则不吞噬，保护细节）
 * @returns {number} 被修改的格子数量（0 表示无修改）
 */
function filterIsolatedRegions(gridData, rows, cols) {
  if (!gridData || rows <= 0 || cols <= 0) return 0;

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

      // 统计周围 8 个邻居的 markCode 分布
      const neighborColors = {}; // { markCode: count }
      let totalNeighbors = 0;

      for (const [dr, dc] of offsets) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;

        const neighbor = gridData[nr] && gridData[nr][nc];
        if (!neighbor || !neighbor.markCode || !neighbor.markRgb || neighbor.isEdge || neighbor.isEmpty) continue;

        const ncode = neighbor.markCode;
        neighborColors[ncode] = (neighborColors[ncode] || 0) + 1;
        totalNeighbors++;
      }

      // 如果没有邻居，跳过
      if (totalNeighbors === 0) continue;

      // 找邻居中出现次数最多的 markCode
      let bestColor = null;
      let bestCount = 0;
      for (const code in neighborColors) {
        if (neighborColors[code] > bestCount) {
          bestCount = neighborColors[code];
          bestColor = code;
        }
      }

      // 新逻辑：
      // 1. 有同色邻居 → 保护（主体细节）
      // 2. 没有同色邻居 → 吞噬为色差最小的邻居（杂色点）
      const hasSameCodeNeighbor = (neighborColors[cell.markCode] || 0) > 0;

      // DEBUG: 打印所有 H5/E16 的状态
      if (cell.markCode === 'H5' || cell.markCode === 'E16') {
        console.log('[spotClean] cell status:', {
          row, col,
          markCode: cell.markCode,
          hasSameCode: hasSameCodeNeighbor,
          totalNeighbors,
          neighborCounts: neighborColors,
          isEdge: cell.isEdge,
          isEmpty: cell.isEmpty
        });
      }

      if (!hasSameCodeNeighbor && totalNeighbors > 0) {
        const cellRgb = cell.markRgb;

        // 遍历所有邻居，找色差最小的那个
        let minDistColor = null;
        let minDistSq = Infinity;
        let minDistHex = null;
        let minDistRgb = null;

        for (const [dr, dc] of offsets) {
          const nr = row + dr;
          const nc = col + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          const n = gridData[nr] && gridData[nr][nc];
          if (!n || !n.markCode || !n.markRgb) continue;
          if (n.markCode === cell.markCode) continue;

          const dr2 = cellRgb.r - n.markRgb.r;
          const dg2 = cellRgb.g - n.markRgb.g;
          const db2 = cellRgb.b - n.markRgb.b;
          const distSq = dr2 * dr2 + dg2 * dg2 + db2 * db2;
          if (distSq < minDistSq) {
            minDistSq = distSq;
            minDistColor = n.markCode;
            minDistHex = n.markHex;
            minDistRgb = n.markRgb;
          }
        }

        if (minDistColor) {
          // DEBUG 日志：找所有H5
          if (cell.markCode === 'H5' || cell.markCode === 'E16') {
            console.log('[spotClean] modify:', {
              row, col,
              from: cell.markCode,
              to: minDistColor,
              minDistSq: Math.round(minDistSq),
              neighbors: Object.keys(neighborColors),
              fromRgb: cellRgb,
              toRgb: minDistRgb
            });
          }
          toModify.push({ row, col, bestColor: minDistColor, replacementHex: minDistHex, replacementRgb: minDistRgb });
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

  console.log('[spotClean] done, modified=', modifiedCount, 'totalCells=', rows * cols);

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
        if (!neighbor || !neighbor.rawRgb || neighbor.isEdge || neighbor.isEmpty) {
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

    // 只对小区域执行合并（≤5个格子），大区域保持不变
    // 避免大区域内的颜色被强制统一
    if (regionCells.length > 5) continue;

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
 * 形态学线条重建：少数派颜色膨胀
 *
 * 对数量偏少的颜色（被切碎的线条）做8方向断裂检测，填充断裂，保持线条连续性。
 *
 * 算法流程：
 * 1. 统计所有 markCode 的数量（排除 isEdge/isEmpty 格子）
 * 2. 找出数量偏少的颜色（< 总格子数的 5%）
 * 3. 对这些少数派颜色的格子，沿8个方向各走 1~maxGap 格
 * 4. 如果找到同类格子（markRgb 距离 < colorThreshold），填充中间断裂
 * 5. 两遍式改写：先收集所有改写，再统一应用
 *
 * @param {Array} gridData - 二维网格数据
 * @param {number} rows - 行数
 * @param {number} cols - 列数
 * @param {number} colorThreshold - 颜色距离阈值（markRgb 欧氏距离 < 此值的视为同类）
 * @param {number} maxGap - 最大断裂宽度（1~5格）
 * @returns {number} 被修改的格子数量（0 表示无修改）
 */
function morphologicalLineRepair(gridData, rows, cols, colorThreshold, maxGap) {
  if (!gridData || rows <= 0 || cols <= 0 || colorThreshold <= 0 || maxGap <= 0) return 0;

  const colorThresholdSq = colorThreshold * colorThreshold;
  const totalCells = rows * cols;
  const minorityThreshold = Math.max(5, Math.floor(totalCells * 0.05)); // 少数派阈值

  // 8个方向：上、下、左、右、左上、右上、左下、右下
  const directions = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [-1, 1], [1, -1], [1, 1]
  ];

  // 第1步：统计 markCode 数量（排除 isEdge/isEmpty）
  const markCodeCounts = {};
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = gridData[row] && gridData[row][col];
      if (!cell || !cell.markCode || !cell.markRgb || cell.isEdge || cell.isEmpty) continue;
      markCodeCounts[cell.markCode] = (markCodeCounts[cell.markCode] || 0) + 1;
    }
  }

  // 第2步：找出需要膨胀的格子（少数派颜色 + 深色）
  const minorityCells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = gridData[row] && gridData[row][col];
      if (!cell || !cell.markCode || !cell.markRgb || cell.isEdge || cell.isEmpty) continue;

      // 深色：RGB 各通道最大值 < 80（黑/深灰/深棕/深蓝等轮廓线颜色）
      const brightness = Math.max(cell.markRgb.r, cell.markRgb.g, cell.markRgb.b);

      // 少数派颜色（< 5%）或深色（maxRGB < 80）都参与膨胀
      if (markCodeCounts[cell.markCode] < minorityThreshold || brightness < 80) {
        minorityCells.push({ row, col });
      }
    }
  }

  // 第3步：对少数派格子做8方向断裂检测，收集需要改写的格子
  const toModify = []; // { row, col, markCode, markHex, markRgb }

  for (const { row, col } of minorityCells) {
    const cell = gridData[row][col];
    const cellMarkRgb = cell.markRgb;

    // 对8个方向分别检查
    for (const [dr, dc] of directions) {
      // 沿方向走 1~maxGap 格，找第一个同类格子
      let foundRow = -1, foundCol = -1;
      let foundCode = null, foundHex = null, foundRgb = null;

      for (let step = 1; step <= maxGap; step++) {
        const nr = row + dr * step;
        const nc = col + dc * step;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) break;

        const neighbor = gridData[nr] && gridData[nr][nc];
        if (!neighbor || !neighbor.markCode || !neighbor.markRgb || neighbor.isEdge || neighbor.isEmpty) continue;

        // 检查是否同类（markRgb 距离 < colorThreshold）
        const nMarkRgb = neighbor.markRgb;
        const dr2 = cellMarkRgb.r - nMarkRgb.r;
        const dg2 = cellMarkRgb.g - nMarkRgb.g;
        const db2 = cellMarkRgb.b - nMarkRgb.b;
        const distSq = dr2 * dr2 + dg2 * dg2 + db2 * db2;

        if (distSq < colorThresholdSq) {
          // 找到同类格子
          foundRow = nr;
          foundCol = nc;
          foundCode = neighbor.markCode;
          foundHex = neighbor.markHex;
          foundRgb = neighbor.markRgb;
          break;
        }
      }

      if (foundRow >= 0) {
        // 填充 cell 和同类格子之间的所有断裂格子
        for (let step = 1; step < Math.abs(foundRow - row) + Math.abs(foundCol - col); step++) {
          const fillRow = row + dr * step;
          const fillCol = col + dc * step;
          if (fillRow === foundRow && fillCol === foundCol) break;
          if (fillRow < 0 || fillRow >= rows || fillCol < 0 || fillCol >= cols) continue;

          const fillCell = gridData[fillRow] && gridData[fillRow][fillCol];
          if (!fillCell || fillCell.isEdge || fillCell.isEmpty) continue;

          // 如果中间格子的 markCode 和同类格子不同，需要改写
          if (fillCell.markCode !== foundCode) {
            const exists = toModify.some(m => m.row === fillRow && m.col === fillCol);
            if (!exists) {
              toModify.push({ row: fillRow, col: fillCol, newCode: foundCode, newHex: foundHex, newRgb: foundRgb });
            }
          }
        }
      }
    }
  }

  // 第4步：统一改写
  let modifiedCount = 0;
  for (const { row, col, newCode, newHex, newRgb } of toModify) {
    const cell = gridData[row][col];
    cell.markCode = newCode;
    cell.markHex = newHex;
    cell.markRgb = newRgb ? { ...newRgb } : null;
    modifiedCount++;
  }

  return modifiedCount;
}

/**
 * 根据 spotCleanLevel 获取过滤参数
 * @param {number} level - 0=关, 1=轻度, 2=中度, 3=强度
 * @returns {{ edgeThreshold: number, spotThreshold: number, morphColorThreshold: number, morphMaxGap: number } | null}
 */
function getSpotCleanParams(level) {
  switch (level) {
    case 1: return { edgeThreshold: 0, morphColorThreshold: 30, morphMaxGap: 2 };
    case 2: return { edgeThreshold: 40, morphColorThreshold: 30, morphMaxGap: 3 };
    case 3: return { edgeThreshold: 50, morphColorThreshold: 30, morphMaxGap: 5 };
    default: return null;
  }
}

module.exports = {
  filterIsolatedRegions,
  preserveEdgeQuantization,
  morphologicalLineRepair,
  getSpotCleanParams
};
