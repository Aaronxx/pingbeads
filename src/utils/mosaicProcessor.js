/**
 * mosaicProcessor.js — 马赛克图智能色块识别（V2 重写版）
 *
 * 针对问题：JPG 压缩伪影导致色块边界模糊、颜色提取不准
 *
 * 新方案：
 *   1. 多线扫描 + 变化点聚类 → 精确定位分界线和色块大小
 *   2. 自适应识别分界线颜色（黑/白/米色均可）
 *   3. 网格化 + 排除分界线污染区域 → 提取纯净色块颜色
 *   4. 中位数取色 → 抗 JPG 伪影
 */

const { fastFindClosestMarkColor } = require('./colorMapper');
const { NoBorderMosaicProcessor } = require('./noBorderMosaicProcessor');
const { extractCellColor, medianColor } = require('./mosaicColorUtils');

/**
 * 验证图片是否为马赛克图（无网格线类型）
 *
 * 核心原理：马赛克图的单元格内部颜色平坦（组内方差小），
 * 单元格之间颜色差异大（组间方差大）。
 * 非马赛克图单元格内部颜色杂乱，组内/组间方差比值接近 1。
 *
 * @param {Uint8ClampedArray} pixelData
 * @param {number} width
 * @param {number} height
 * @param {number} cellSize - 候选色块大小
 * @returns {boolean} true 表示是马赛克图，false 表示非马赛克图
 */
function validateGridPattern(pixelData, width, height, cellSize) {
  if (cellSize < 3 || width < cellSize * 2 || height < cellSize * 2) return false;

  const cols = Math.floor(width / cellSize);
  const rows = Math.floor(height / cellSize);
  if (cols < 3 || rows < 3) return false;

  // 辅助：获取像素颜色
  function getPixel(x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return null;
    const idx = (y * width + x) * 4;
    return { r: pixelData[idx], g: pixelData[idx + 1], b: pixelData[idx + 2] };
  }

  // 辅助：颜色距离平方
  function distSq(a, b) {
    const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
    return dr * dr + dg * dg + db * db;
  }

  // 采样单元格：均匀选取最多 20 个
  const sampleCount = Math.min(20, cols * rows);
  const stepC = Math.max(1, Math.floor(cols / Math.ceil(Math.sqrt(sampleCount))));
  const stepR = Math.max(1, Math.floor(rows / Math.ceil(Math.sqrt(sampleCount))));

  const cellAvgs = []; // 每个采样单元格的平均色
  const withinVariances = []; // 每个采样单元格的组内方差

  for (let row = 0; row < rows; row += stepR) {
    for (let col = 0; col < cols; col += stepC) {
      if (cellAvgs.length >= sampleCount) break;

      const cx = col * cellSize;
      const cy = row * cellSize;
      // 采样单元格中心 3×3 区域
      const halfCell = Math.floor(cellSize / 2);
      const sx = cx + halfCell;
      const sy = cy + halfCell;

      const samples = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const p = getPixel(sx + dx, sy + dy);
          if (p) samples.push(p);
        }
      }
      if (samples.length < 3) continue;

      // 计算平均值
      const avg = { r: 0, g: 0, b: 0 };
      for (const s of samples) { avg.r += s.r; avg.g += s.g; avg.b += s.b; }
      avg.r /= samples.length; avg.g /= samples.length; avg.b /= samples.length;

      // 计算组内方差（到平均值的平均距离平方）
      let withinVar = 0;
      for (const s of samples) { withinVar += distSq(s, avg); }
      withinVar /= samples.length;

      cellAvgs.push({ avg, col, row });
      withinVariances.push(withinVar);
    }
  }

  if (cellAvgs.length < 4) return false;

  // 计算组间方差：相邻单元格平均色之间的距离
  const betweenDistances = [];
  for (let i = 0; i < cellAvgs.length; i++) {
    for (let j = i + 1; j < cellAvgs.length; j++) {
      // 只比较相邻的单元格
      const dc = Math.abs(cellAvgs[i].col - cellAvgs[j].col);
      const dr = Math.abs(cellAvgs[i].row - cellAvgs[j].row);
      if (dc + dr === 1) { // 直接相邻
        betweenDistances.push(distSq(cellAvgs[i].avg, cellAvgs[j].avg));
      }
    }
  }

  if (betweenDistances.length < 3) return false;

  // 平均组内方差
  const avgWithinVar = withinVariances.reduce((s, v) => s + v, 0) / withinVariances.length;
  // 平均组间方差
  const avgBetweenVar = betweenDistances.reduce((s, v) => s + v, 0) / betweenDistances.length;

  // 马赛克图：组内方差远小于组间方差 -> 比值 << 1
  // 非马赛克图：组内方差接近组间方差 -> 比值 ≈ 1
  if (avgBetweenVar < 1) return false; // 组间方差极小，可能是纯色图
  const ratio = avgWithinVar / avgBetweenVar;

  return ratio < 0.3;
}

// ========== 工具函数 ==========

/** 找数组众数 */
function findMode(arr) {
  if (!arr || arr.length === 0) return 0;
  const counts = {};
  let maxCount = 0, mode = arr[0];
  for (const v of arr) {
    const q = Math.round(v);
    counts[q] = (counts[q] || 0) + 1;
    if (counts[q] > maxCount) { maxCount = counts[q]; mode = q; }
  }
  return mode;
}

/** 找中位数 */
function findMedian(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ========== 核心：多线扫描聚类检测网格 ==========

/**
 * 扫描单条线，找颜色变化点，然后聚类成分界线
 * @param {Uint8ClampedArray} data - 像素数据
 * @param {number} width - 图像宽度
 * @param {number} height - 图像高度
 * @param {string} direction - 'horizontal' 或 'vertical'
 * @param {number} pos - 扫描线位置（水平线的y或垂直线的x）
 * @param {number} colorDistThreshold - 颜色距离阈值，默认 30
 * @param {number} clusterGap - 聚类间距阈值，默认 5
 * @returns {Array} 分界线数组 [{ center, start, end, pixels }]
 */
/**
 * 扫描单条线，找颜色变化点，然后聚类成分界线
 */
function scanLineForGridLines(data, width, height, direction, pos, colorDistThreshold = 30, clusterGap = 5) {
  const changes = [];

  if (direction === 'horizontal') {
    const y = pos;
    if (y < 0 || y >= height) return [];
    for (let x = 1; x < width; x++) {
      const i1 = (y * width + x - 1) * 4;
      const i2 = (y * width + x) * 4;
      const dist = Math.sqrt(
        (data[i1] - data[i2]) ** 2 +
        (data[i1 + 1] - data[i2 + 1]) ** 2 +
        (data[i1 + 2] - data[i2 + 2]) ** 2
      );
      if (dist > colorDistThreshold) changes.push(x);
    }
  } else {
    const x = pos;
    if (x < 0 || x >= width) return [];
    for (let y = 1; y < height; y++) {
      const i1 = ((y - 1) * width + x) * 4;
      const i2 = (y * width + x) * 4;
      const dist = Math.sqrt(
        (data[i1] - data[i2]) ** 2 +
        (data[i1 + 1] - data[i2 + 1]) ** 2 +
        (data[i1 + 2] - data[i2 + 2]) ** 2
      );
      if (dist > colorDistThreshold) changes.push(y);
    }
  }

  if (changes.length === 0) return [];

  // 聚类：相邻变化点间距 <= clusterGap 视为同一条分界线
  const clusters = [];
  let current = [changes[0]];
  for (let i = 1; i < changes.length; i++) {
    if (changes[i] - changes[i - 1] <= clusterGap) {
      current.push(changes[i]);
    } else {
      clusters.push(current);
      current = [changes[i]];
    }
  }
  clusters.push(current);

  return clusters.map(pts => ({
    start: pts[0],
    end: pts[pts.length - 1],
    center: Math.round((pts[0] + pts[pts.length - 1]) / 2),
    width: pts[pts.length - 1] - pts[0] + 1
  }));
}

/**
 * 从分界线集合中推断色块大小
 *
 * 改进：排除同色块跨多个 cell 产生的大间距污染
 * 如果 cellSize=15，大片同色区域会产生 30/45/60 的间距
 * 这些是 cellSize 的整数倍，不应参与众数计算
 */
function inferCellSize(allLines, minSize = 5, maxSize = 80) {
  const allCenters = [];
  for (const lineGroup of allLines) {
    for (const line of lineGroup) {
      allCenters.push(line.center);
    }
  }

  if (allCenters.length < 4) return null;

  allCenters.sort((a, b) => a - b);

  // 收集所有间距
  const allGaps = [];
  for (let i = 1; i < allCenters.length; i++) {
    const gap = allCenters[i] - allCenters[i - 1];
    if (gap >= minSize && gap <= maxSize) allGaps.push(gap);
  }

  if (allGaps.length < 3) return null;

  // 第一次粗估：取所有间距的众数
  const roughCellSize = findMode(allGaps);

  // 筛选：只保留接近 cellSize 或 cellSize 整数倍的间距
  // 排除噪声间距（既不接近 cellSize 也不是整数倍）
  const cleanGaps = allGaps.filter(gap => {
    // 接近 cellSize（±2 容差）
    if (Math.abs(gap - roughCellSize) <= 2) return true;
    // 是 cellSize 的整数倍（±2 容差）
    const multiple = Math.round(gap / roughCellSize);
    if (multiple >= 2 && Math.abs(gap - roughCellSize * multiple) <= 2) return true;
    // 其他间距视为噪声，排除
    return false;
  });

  // 用筛选后的间距重新取众数（只用 cellSize 附近的间距，不用倍数间距）
  const baseGaps = cleanGaps.filter(gap => Math.abs(gap - roughCellSize) <= 2);
  const cellSize = baseGaps.length > 0 ? findMode(baseGaps) : roughCellSize;
  const lineThickness = findMode(allLines.flatMap(g => g.map(l => l.width)));

  // 置信度：接近 cellSize 的间距占清洁间距的比例
  let inRange = 0;
  for (const g of cleanGaps) {
    if (Math.abs(g - cellSize) <= 2) inRange++;
  }
  const confidence = cleanGaps.length > 0 ? inRange / cleanGaps.length : 0;

  return {
    cellSize,
    lineThickness: Math.max(1, lineThickness),
    confidence,
    totalLines: allCenters.length
  };
}

/**
 * 推断分界线颜色
 * 通过采样分界线位置的像素来判断
 */
function inferLineColor(data, width, height, hLines, vLines) {
  const linePixels = [];

  // 采样水平分界线
  for (const lineGroup of hLines.slice(0, 10)) { // 只采样前10条线
    for (const line of lineGroup) {
      const y = Math.floor(height / 2); // 在图像中间采样
      const x = line.center;
      if (x >= 0 && x < width && y >= 0 && y < height) {
        const i = (y * width + x) * 4;
        linePixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
      }
    }
  }

  // 采样垂直分界线
  for (const lineGroup of vLines.slice(0, 10)) {
    for (const line of lineGroup) {
      const x = Math.floor(width / 2);
      const y = line.center;
      if (x >= 0 && x < width && y >= 0 && y < height) {
        const i = (y * width + x) * 4;
        linePixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
      }
    }
  }

  if (linePixels.length === 0) return { r: 200, g: 200, b: 200 };

  // 返回中位数颜色（抗噪）
  return medianColor(linePixels);
}

// ========== 主处理类 ==========

class MosaicProcessor {
  /**
   * 处理马赛克图
   */
  process(pixelData, width, height, options = {}) {
    const fallbackGridSize = options.fallbackGridSize || 10;
    const forceGridSize = options.forceGridSize || null; // 强制使用的网格大小
    const colorDistThreshold = options.colorDistThreshold || 30;
    const clusterGap = options.clusterGap || 5;
    const borderMargin = options.borderMargin || undefined; // 自动计算
    const minCellArea = options.minCellArea || 4;

    if (!pixelData || pixelData.length === 0 || width <= 0 || height <= 0) {
      return { segments: [], segmentCount: 0, cols: 1, rows: 1, gridSize: 1, hasGridLines: false, width: width || 0, height: height || 0 };
    }

    // 强制网格大小：跳过扫描线检测，直接走无边界处理
    if (forceGridSize && forceGridSize > 0) {
      const noBorderProcessor = new NoBorderMosaicProcessor();
      return noBorderProcessor.process(pixelData, width, height, forceGridSize);
    }

    // ===== 步骤1: 多线扫描找分界线 =====
    const scanCount = Math.min(31, Math.max(15, Math.floor(Math.min(width, height) / 30)));

    const hLines = [];
    const vLines = [];

    for (let i = 0; i < scanCount; i++) {
      const y = Math.floor(height * i / (scanCount - 1));
      const lines = scanLineForGridLines(pixelData, width, height, 'horizontal', y, colorDistThreshold, clusterGap);
      if (lines.length > 2) hLines.push(lines);

      const x = Math.floor(width * i / (scanCount - 1));
      const vline = scanLineForGridLines(pixelData, width, height, 'vertical', x, colorDistThreshold, clusterGap);
      if (vline.length > 2) vLines.push(vline);
    }


    // ===== 步骤2: 推断色块大小 =====
    const hInference = inferCellSize(hLines, 5, 80);
    const vInference = inferCellSize(vLines, 5, 80);

    let cellSize, lineThickness, hasGridLines, confidence;

    // 边界线宽度一致性检测：真正的边界线宽度在整张图上一致，
    // JPG过渡带的"假边界"宽度因相邻色块颜色差异而忽大忽小
    const checkLineConsistency = (allLines) => {
      const widths = [];
      for (const group of allLines) {
        for (const line of group) widths.push(line.width);
      }
      if (widths.length < 5) return { consistent: false, avgWidth: 0 };
      const avg = widths.reduce((s, w) => s + w, 0) / widths.length;
      const variance = widths.reduce((s, w) => s + (w - avg) ** 2, 0) / widths.length;
      const stdDev = Math.sqrt(variance);
      // 真正的边界线：标准差 ≤ 1（宽度几乎一致）
      // JPG过渡带：标准差 > 1（宽度变化大）
      return { consistent: stdDev <= 1.5, avgWidth: avg };
    };

    const hConsistency = checkLineConsistency(hLines);
    const vConsistency = checkLineConsistency(vLines);

    // 双跳变检测：真正边界线的中间像素是独立的边界色，
    // 不是两侧色块的混合（JPG过渡带中间像素≈两侧混合色）
    const checkRealBorders = (pixelData, width, height, allLines, scanPositions, direction) => {
      let realCount = 0, totalChecked = 0;
      for (let li = 0; li < allLines.length && li < scanPositions.length; li++) {
        const pos = scanPositions[li];
        for (const line of allLines[li]) {
          // 采样：边界前一个像素（色块A）、边界中间（边界色）、边界后一个像素（色块B）
          let iA, iMid, iB;
          if (direction === 'horizontal') {
            const y = pos;
            if (line.start < 1 || line.end >= width - 1) continue;
            iA = (y * width + line.start - 1) * 4;
            iMid = (y * width + Math.round((line.start + line.end) / 2)) * 4;
            iB = (y * width + line.end + 1) * 4;
          } else {
            const x = pos;
            if (line.start < 1 || line.end >= height - 1) continue;
            iA = ((line.start - 1) * width + x) * 4;
            iMid = (Math.round((line.start + line.end) / 2) * width + x) * 4;
            iB = ((line.end + 1) * width + x) * 4;
          }
          const cA = { r: pixelData[iA], g: pixelData[iA + 1], b: pixelData[iA + 2] };
          const cMid = { r: pixelData[iMid], g: pixelData[iMid + 1], b: pixelData[iMid + 2] };
          const cB = { r: pixelData[iB], g: pixelData[iB + 1], b: pixelData[iB + 2] };

          // JPG过渡带：中间色 ≈ (A+B)/2
          const blendR = (cA.r + cB.r) / 2;
          const blendG = (cA.g + cB.g) / 2;
          const blendB = (cA.b + cB.b) / 2;
          const blendDist = Math.sqrt((cMid.r - blendR) ** 2 + (cMid.g - blendG) ** 2 + (cMid.b - blendB) ** 2);

          // 真正边界线：中间色偏离混合色（有独立的边界颜色）
          totalChecked++;
          if (blendDist > 20) realCount++;
        }
      }
      // 真正边界线：>50% 的线条有独立边界色
      // JPG过渡带：大部分线条中间色 ≈ 混合色
      return { realRatio: totalChecked > 0 ? realCount / totalChecked : 0, realCount, totalChecked };
    };

    // 记录扫描位置
    const hScanPositions = [];
    const vScanPositions = [];
    for (let i = 0; i < scanCount; i++) {
      hScanPositions.push(Math.floor(height * i / (scanCount - 1)));
      vScanPositions.push(Math.floor(width * i / (scanCount - 1)));
    }

    const hBorderCheck = checkRealBorders(pixelData, width, height, hLines, hScanPositions, 'horizontal');
    const vBorderCheck = checkRealBorders(pixelData, width, height, vLines, vScanPositions, 'vertical');
    const hasRealBorders = (hBorderCheck.realRatio > 0.5 || vBorderCheck.realRatio > 0.5)
      && (hConsistency.consistent || vConsistency.consistent);

    if (hInference && vInference && hInference.confidence > 0.3 && vInference.confidence > 0.3) {
      cellSize = Math.round((hInference.cellSize + vInference.cellSize) / 2);
      lineThickness = Math.round((hInference.lineThickness + vInference.lineThickness) / 2);
      confidence = (hInference.confidence + vInference.confidence) / 2;
      // 真正的边界线：宽度 ≥ 2 且整张图宽度一致（标准差 ≤ 1.5）
      // JPG过渡带：宽度变化大，一致性检测不通过
      hasGridLines = lineThickness >= 2 && cellSize >= 5 && hasRealBorders;
    } else if (hInference && hInference.confidence > 0.3 && hInference.lineThickness >= 2) {
      cellSize = hInference.cellSize;
      lineThickness = hInference.lineThickness;
      confidence = hInference.confidence;
      hasGridLines = cellSize >= 5 && hConsistency.consistent;
    } else if (vInference && vInference.confidence > 0.3 && vInference.lineThickness >= 2) {
      cellSize = vInference.cellSize;
      lineThickness = vInference.lineThickness;
      confidence = vInference.confidence;
      hasGridLines = cellSize >= 5 && vConsistency.consistent;
    } else {
      // 检测失败，回退到固定网格
      cellSize = fallbackGridSize;
      lineThickness = 0;
      confidence = 0;
      hasGridLines = false;
    }

    if (!hasGridLines) {
      // 验证是否为无网格线马赛克图：单元格内部颜色是否平坦
      const isMosaic = validateGridPattern(pixelData, width, height, cellSize);
      const finalCellSize = isMosaic ? cellSize : fallbackGridSize;
      const noBorderProcessor = new NoBorderMosaicProcessor();
      return noBorderProcessor.process(pixelData, width, height, finalCellSize);
    }

    // ===== 步骤3: 精确定位所有分界线 =====
    const hLineCenters = this._mergeLineCenters(hLines, cellSize, 3);
    const vLineCenters = this._mergeLineCenters(vLines, cellSize, 3);

    // 检查分界线数量是否充足 + 规律性
    // AI生成图的分界线可能数量少且间距不规律
    const expectedHLines = Math.round(height / cellSize);
    const expectedVLines = Math.round(width / cellSize);
    const hLineRatio = expectedHLines > 0 ? hLineCenters.length / expectedHLines : 0;
    const vLineRatio = expectedVLines > 0 ? vLineCenters.length / expectedVLines : 0;

    // 检查分界线间距是否规律（接近 cellSize 的整数倍）
    const checkLineRegularity = (lineCenters, cellSize) => {
      if (lineCenters.length < 3) return false;
      const gaps = [];
      for (let i = 1; i < lineCenters.length; i++) {
        gaps.push(lineCenters[i] - lineCenters[i - 1]);
      }
      let regular = 0;
      for (const gap of gaps) {
        const multiple = Math.round(gap / cellSize);
        if (multiple >= 1 && Math.abs(gap - cellSize * multiple) <= cellSize * 0.2) {
          regular++;
        }
      }
      return regular / gaps.length >= 0.5;
    };

    const hRegular = checkLineRegularity(hLineCenters, cellSize);
    const vRegular = checkLineRegularity(vLineCenters, cellSize);
    const hSufficient = hLineRatio >= 0.3;
    const vSufficient = vLineRatio >= 0.3;

    // 两个方向都不满足（数量不足或间距不规律）-> 走无边界处理
    if (!(hSufficient && hRegular) && !(vSufficient && vRegular)) {
      const noBorderProcessor = new NoBorderMosaicProcessor();
      return noBorderProcessor.process(pixelData, width, height, cellSize);
    }

    // 推断分界线颜色（用于识别哪些像素属于分界线）
    const lineColor = inferLineColor(pixelData, width, height, hLines, vLines);

    // ===== 步骤4: 构建网格 =====
    const cellBounds = this._buildCellBounds(hLineCenters, vLineCenters, width, height, lineThickness);

    const cols = cellBounds.hCells.length;
    const rows = cellBounds.vCells.length;

    if (cols === 0 || rows === 0) {
      // 网格构建失败，委托给无边界处理器
      const noBorderProcessor = new NoBorderMosaicProcessor();
      return noBorderProcessor.process(pixelData, width, height, cellSize);
    }

    // ===== 步骤5: 提取每个色块的颜色 =====
    // borderSkip: 排除分界线宽度，再用中心50%采样避免串色
    const borderSkip = borderMargin !== undefined ? borderMargin : Math.max(1, Math.ceil(lineThickness / 2));

    const segments = [];
    let segId = 0;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cellX = cellBounds.hCells[col];
        const cellY = cellBounds.vCells[row];

        // 色块区域（排除边界线）
        const startX = cellX.start + borderSkip;
        const endX = cellX.end - borderSkip;
        const startY = cellY.start + borderSkip;
        const endY = cellY.end - borderSkip;

        if (startX >= endX || startY >= endY) continue;

        // 共享取色：中心50%区域 + 中位数引导加权平均
        const colorResult = extractCellColor(pixelData, width, startX, endX, startY, endY);
        if (!colorResult) continue;

        segments.push({
          id: segId++,
          x: cellX.start,
          y: cellY.start,
          width: cellX.end - cellX.start,
          height: cellY.end - cellY.start,
          col,
          row,
          avgColor: colorResult.avgColor,
          markCode: colorResult.markCode,
          markHex: colorResult.markHex,
          markRgb: colorResult.markRgb,
          pixelCount: (endX - startX) * (endY - startY)
        });
      }
    }

    return {
      segments,
      segmentCount: segments.length,
      cols,
      rows,
      gridSize: cellSize,
      hasGridLines: true,
      width,
      height,
      detectionResult: {
        cellSize,
        lineThickness,
        lineColor,
        hLineCount: hLineCenters.length,
        vLineCount: vLineCenters.length,
        confidence
      }
    };
  }

  /**
   * 合并多个扫描线的分界线中心，找到全局一致的位置
   * 思路：将每条扫描线的分界线中心聚合，取中位数
   */
  _mergeLineCenters(allLines, expectedCellSize, tolerance) {
    if (allLines.length === 0) return [];

    // 收集所有分界线中心
    const allCenters = [];
    for (const lines of allLines) {
      for (const line of lines) {
        allCenters.push(line.center);
      }
    }

    if (allCenters.length === 0) return [];

    allCenters.sort((a, b) => a - b);

    // 聚类：间距 <= tolerance 的视为同一条分界线
    const clusters = [];
    let current = [allCenters[0]];
    for (let i = 1; i < allCenters.length; i++) {
      if (allCenters[i] - allCenters[i - 1] <= tolerance) {
        current.push(allCenters[i]);
      } else {
        clusters.push(current);
        current = [allCenters[i]];
      }
    }
    clusters.push(current);

    // 过滤：只保留在多条扫描线上都出现的分界线
    const minAppearances = Math.max(2, Math.ceil(allLines.length * 0.3));
    const globalLines = [];
    for (const cluster of clusters) {
      if (cluster.length >= minAppearances) {
        globalLines.push(Math.round(findMedian(cluster)));
      }
    }

    return globalLines;
  }

  /**
   * 从分界线位置构建色块边界
   */
  _buildCellBounds(hLineCenters, vLineCenters, width, height, lineThickness) {
    // 水平分界线将图像分为列
    const hCells = [];
    if (hLineCenters.length === 0) {
      // 没有分界线，整个宽度作为一个色块
      hCells.push({ start: 0, end: width });
    } else {
      const halfLine = Math.ceil(lineThickness / 2);
      let prev = 0;
      for (const center of hLineCenters) {
        const cellEnd = center - halfLine;
        if (cellEnd > prev) {
          hCells.push({ start: prev, end: cellEnd });
        }
        prev = center + halfLine;
      }
      // 最后一列
      if (prev < width) {
        hCells.push({ start: prev, end: width });
      }
    }

    // 垂直分界线将图像分为行
    const vCells = [];
    if (vLineCenters.length === 0) {
      vCells.push({ start: 0, end: height });
    } else {
      const halfLine = Math.ceil(lineThickness / 2);
      let prev = 0;
      for (const center of vLineCenters) {
        const cellEnd = center - halfLine;
        if (cellEnd > prev) {
          vCells.push({ start: prev, end: cellEnd });
        }
        prev = center + halfLine;
      }
      if (prev < height) {
        vCells.push({ start: prev, end: height });
      }
    }

    return { hCells, vCells };
  }
}

module.exports = {
  MosaicProcessor,
  scanLineForGridLines,
  inferCellSize
};
