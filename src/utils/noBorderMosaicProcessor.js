/**
 * 无边界色块马赛克图处理器
 *
 * 独立模块，处理没有明显边界线的马赛克图（像素色块直接相邻）。
 * 与有边界马赛克图处理逻辑完全隔离。
 *
 * 核心算法：
 * 1. 偏移检测：投票找第一个完整色块的起始像素
 * 2. 逐列边界确定：跳变投票法
 *    在预期边界 ±2px 窗口内，统计多条扫描线上的颜色跳变次数，
 *    跳变最多的位置就是真实色块边界
 *    利用"同一列在所有行上宽度一致"的特性，支持非均匀色块大小（7/8混合）
 */

const { fastFindClosestMarkColor } = require('./colorMapper');

// ========== 自包含工具函数（避免循环依赖） ==========

function fastMedian(arr) {
  const len = arr.length;
  if (len === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = len >> 1;
  return len % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function medianColor(colors) {
  if (!colors || colors.length === 0) return null;
  const rs = [], gs = [], bs = [];
  for (const c of colors) { rs.push(c.r); gs.push(c.g); bs.push(c.b); }
  return { r: fastMedian(rs), g: fastMedian(gs), b: fastMedian(bs) };
}

function extractDominantColor(colors) {
  if (!colors || colors.length === 0) return null;
  if (colors.length <= 4) return medianColor(colors);
  const median = medianColor(colors);
  if (!median) return null;
  const sigmaSq = 2 * 25 * 25;
  let sumW = 0, sumR = 0, sumG = 0, sumB = 0;
  for (const c of colors) {
    const dr = c.r - median.r;
    const dg = c.g - median.g;
    const db = c.b - median.b;
    const distSq = dr * dr + dg * dg + db * db;
    const w = Math.exp(-distSq / sigmaSq);
    sumW += w; sumR += c.r * w; sumG += c.g * w; sumB += c.b * w;
  }
  if (sumW === 0) return median;
  return { r: Math.round(sumR / sumW), g: Math.round(sumG / sumW), b: Math.round(sumB / sumW) };
}

class NoBorderMosaicProcessor {

  /**
   * 处理无边界马赛克图
   * @param {Uint8ClampedArray} pixelData
   * @param {number} width
   * @param {number} height
   * @param {number} cellSize - 推断的色块大小（整数基准）
   * @returns {{segments, cols, rows, gridSize, hasGridLines, width, height}}
   */
  process(pixelData, width, height, cellSize) {
    // 检测网格偏移
    const offset = this._detectGridOffset(pixelData, width, height, cellSize);
    const startX0 = offset.hasBoundary ? offset.offsetX : 0;
    const startY0 = offset.hasBoundary ? offset.offsetY : 0;

    // 逐列确定边界
    const colBoundaries = this._findBoundaries(pixelData, width, height, startX0, width, cellSize, true);
    const rowBoundaries = this._findBoundaries(pixelData, width, height, startY0, height, cellSize, false);
    const cols = colBoundaries.length - 1;
    const rows = rowBoundaries.length - 1;

    const colWidths = colBoundaries.slice(0, 8).map((v, i, a) => i > 0 ? v - a[i - 1] : 0).slice(1);
    const rowHeights = rowBoundaries.slice(0, 8).map((v, i, a) => i > 0 ? v - a[i - 1] : 0).slice(1);
    console.log('[noBorder] cellSize=' + cellSize + ' cols=' + cols + ' rows=' + rows
      + ' colWidths[0..6]=' + JSON.stringify(colWidths)
      + ' rowHeights[0..6]=' + JSON.stringify(rowHeights));

    // 逐色块取色
    const segments = [];
    let segId = 0;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const startX = colBoundaries[col];
        const endX = Math.min(colBoundaries[col + 1], width);
        const startY = rowBoundaries[row];
        const endY = Math.min(rowBoundaries[row + 1], height);

        const cellW = endX - startX;
        const cellH = endY - startY;
        if (cellW <= 0 || cellH <= 0) continue;

        // 取中心50%区域像素（排除边缘串色）
        const marginX = Math.floor(cellW * 0.25);
        const marginY = Math.floor(cellH * 0.25);
        const sx0 = startX + marginX;
        const sx1 = endX - marginX;
        const sy0 = startY + marginY;
        const sy1 = endY - marginY;

        const colors = [];
        for (let y = sy0; y < sy1; y++) {
          for (let x = sx0; x < sx1; x++) {
            const i = (y * width + x) * 4;
            colors.push({ r: pixelData[i], g: pixelData[i + 1], b: pixelData[i + 2] });
          }
        }

        if (colors.length === 0) continue;

        const finalColor = extractDominantColor(colors) || { r: 200, g: 200, b: 200 };
        const markColor = fastFindClosestMarkColor(finalColor);

        segments.push({
          id: segId++,
          x: startX, y: startY,
          width: cellW, height: cellH,
          col, row, avgColor: finalColor,
          markCode: markColor ? markColor.code : 'M001',
          markHex: markColor ? markColor.hex : '#CCCCCC',
          markRgb: markColor ? markColor.rgb : { r: 204, g: 204, b: 204 },
          pixelCount: colors.length
        });
      }
    }

    console.log('[noBorder] segments=' + segments.length);

    return {
      segments, segmentCount: segments.length,
      cols, rows, gridSize: cellSize, hasGridLines: false,
      width, height
    };
  }

  /**
   * 逐列确定边界：跳变投票法
   *
   * 在每个预期边界位置 ±2px 窗口内，
   * 统计多条扫描线上的颜色跳变次数，
   * 跳变最多的位置就是真实色块边界
   */
  _findBoundaries(pixelData, width, height, startPos, totalSize, gridSize, isHorizontal) {
    const boundaries = [startPos];
    let pos = startPos;

    const lineCount = 15;
    const scanLines = [];
    const lineDim = isHorizontal ? height : width;
    for (let i = 1; i <= lineCount; i++) {
      scanLines.push(Math.floor(lineDim * i / (lineCount + 1)));
    }

    const colorDistThresholdSq = 30 * 30;

    while (pos + 3 < totalSize) {
      let expectedEnd = pos + gridSize;
      if (expectedEnd >= totalSize) {
        boundaries.push(totalSize);
        break;
      }

      const windowStart = Math.max(pos + 3, expectedEnd - 2);
      const windowEnd = Math.min(totalSize - 1, expectedEnd + 2);
      const jumpCounts = {};

      for (const linePos of scanLines) {
        for (let p = windowStart; p <= windowEnd; p++) {
          const i1 = isHorizontal
            ? (linePos * width + p) * 4
            : (p * width + linePos) * 4;
          const i2 = isHorizontal
            ? (linePos * width + p + 1) * 4
            : ((p + 1) * width + linePos) * 4;

          const dr = pixelData[i1] - pixelData[i2];
          const dg = pixelData[i1 + 1] - pixelData[i2 + 1];
          const db = pixelData[i1 + 2] - pixelData[i2 + 2];

          if (dr * dr + dg * dg + db * db > colorDistThresholdSq) {
            jumpCounts[p] = (jumpCounts[p] || 0) + 1;
          }
        }
      }

      let bestEnd = expectedEnd;
      let maxJumps = 0;
      for (const p in jumpCounts) {
        if (jumpCounts[p] > maxJumps) {
          maxJumps = jumpCounts[p];
          bestEnd = Number(p);
        }
      }

      boundaries.push(bestEnd);
      pos = bestEnd;
    }

    if (boundaries[boundaries.length - 1] < totalSize) {
      boundaries.push(totalSize);
    }

    return boundaries;
  }

  /**
   * 检测网格偏移量（X 和 Y 两个方向）
   *
   * 两步检测：
   * 1. 颜色跳变点投票找候选偏移（取票数前3）
   * 2. 对每个候选偏移验证：格子内部颜色方差最小的是最佳偏移
   */
  _detectGridOffset(pixelData, width, height, gridSize) {
    const colorDistThreshold = 30;
    const scanRowCount = Math.min(9, Math.max(3, Math.floor(height / 30)));
    const scanColCount = Math.min(9, Math.max(3, Math.floor(width / 30)));

    // X 方向跳变投票
    const offsetVotesX = new Array(gridSize).fill(0);
    for (let s = 0; s < scanRowCount; s++) {
      const y = Math.floor(height * (s + 1) / (scanRowCount + 1));
      for (let x = 2; x < width - 2; x++) {
        const i1 = (y * width + x - 2) * 4;
        const i2 = (y * width + x + 2) * 4;
        const dr = pixelData[i1] - pixelData[i2];
        const dg = pixelData[i1 + 1] - pixelData[i2 + 1];
        const db = pixelData[i1 + 2] - pixelData[i2 + 2];
        if (dr * dr + dg * dg + db * db > colorDistThreshold * colorDistThreshold) {
          offsetVotesX[x % gridSize]++;
        }
      }
    }

    // Y 方向跳变投票
    const offsetVotesY = new Array(gridSize).fill(0);
    for (let s = 0; s < scanColCount; s++) {
      const x = Math.floor(width * (s + 1) / (scanColCount + 1));
      for (let y = 2; y < height - 2; y++) {
        const i1 = ((y - 2) * width + x) * 4;
        const i2 = ((y + 2) * width + x) * 4;
        const dr = pixelData[i1] - pixelData[i2];
        const dg = pixelData[i1 + 1] - pixelData[i2 + 1];
        const db = pixelData[i1 + 2] - pixelData[i2 + 2];
        if (dr * dr + dg * dg + db * db > colorDistThreshold * colorDistThreshold) {
          offsetVotesY[y % gridSize]++;
        }
      }
    }

    // 取票数前3的候选偏移
    const topCandidates = (votes) => {
      const indexed = votes.map((v, i) => ({ offset: i, votes: v }));
      return indexed.sort((a, b) => b.votes - a.votes).slice(0, 3);
    };

    const candidatesX = topCandidates(offsetVotesX);
    const candidatesY = topCandidates(offsetVotesY);

    // 验证：格子内部颜色方差最小的偏移 = 最佳
    const validateOffset = (offset, totalSize, isHorizontal) => {
      let totalVariance = 0;
      let cellCount = 0;
      const sampleLines = isHorizontal
        ? [Math.floor(height * 0.25), Math.floor(height * 0.5), Math.floor(height * 0.75)]
        : [Math.floor(width * 0.25), Math.floor(width * 0.5), Math.floor(width * 0.75)];

      for (let cellStart = offset; cellStart + gridSize <= totalSize; cellStart += gridSize) {
        for (const linePos of sampleLines) {
          const colors = [];
          for (let p = cellStart + 1; p < cellStart + gridSize - 1; p++) {
            const i = isHorizontal
              ? (linePos * width + p) * 4
              : (p * width + linePos) * 4;
            colors.push({ r: pixelData[i], g: pixelData[i + 1], b: pixelData[i + 2] });
          }
          if (colors.length < 2) continue;
          const avgR = colors.reduce((s, c) => s + c.r, 0) / colors.length;
          const avgG = colors.reduce((s, c) => s + c.g, 0) / colors.length;
          const avgB = colors.reduce((s, c) => s + c.b, 0) / colors.length;
          for (const c of colors) {
            totalVariance += (c.r - avgR) ** 2 + (c.g - avgG) ** 2 + (c.b - avgB) ** 2;
          }
          cellCount++;
        }
      }
      return cellCount > 0 ? totalVariance / cellCount : Infinity;
    };

    let bestOffsetX = 0, bestVarX = Infinity;
    for (const c of candidatesX) {
      const v = validateOffset(c.offset, width, true);
      if (v < bestVarX) { bestVarX = v; bestOffsetX = c.offset; }
    }

    let bestOffsetY = 0, bestVarY = Infinity;
    for (const c of candidatesY) {
      const v = validateOffset(c.offset, height, false);
      if (v < bestVarY) { bestVarY = v; bestOffsetY = c.offset; }
    }

    const minVotes = Math.min(scanRowCount, scanColCount) * 3;
    return {
      offsetX: bestOffsetX,
      offsetY: bestOffsetY,
      hasBoundary: (candidatesX[0] && candidatesX[0].votes > minVotes) || (candidatesY[0] && candidatesY[0].votes > minVotes)
    };
  }
}

module.exports = { NoBorderMosaicProcessor };
