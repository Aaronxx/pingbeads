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

// ========== 工具函数 ==========

/** 快速中位数 */
function fastMedian(arr) {
  const len = arr.length;
  if (len === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = len >> 1;
  return len % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** 计算一组颜色的中位数颜色 */
function medianColor(colors) {
  if (!colors || colors.length === 0) return null;
  const rs = [], gs = [], bs = [];
  for (const c of colors) {
    rs.push(c.r); gs.push(c.g); bs.push(c.b);
  }
  return { r: fastMedian(rs), g: fastMedian(gs), b: fastMedian(bs) };
}

/**
 * 改进的颜色提取：中位数引导的加权平均
 * 1. 先找中位数作为参考中心
 * 2. 对接近中位数的像素赋予更高权重（高斯权重）
 * 3. 计算加权平均作为最终颜色
 * 这样既抗噪又准确代表主色调
 */
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
    sumW += w;
    sumR += c.r * w;
    sumG += c.g * w;
    sumB += c.b * w;
  }

  if (sumW === 0) return median;
  return {
    r: Math.round(sumR / sumW),
    g: Math.round(sumG / sumW),
    b: Math.round(sumB / sumW)
  };
}

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
 * 验证分界线是否有双跳变特征（真正的边界线 vs JPG过渡带）
 *
 * 真正的边界线：色块A → 跳变 → 边界线颜色（稳定N像素）→ 跳变 → 色块B
 * JPG过渡带：色块A → 渐变 → 色块B（只有一次连续变化，没有中间稳定区）
 *
 * 检查方法：在每个聚类分界线的宽度范围内，采样像素看中间区域是否颜色稳定
 * @returns {boolean} true=有双跳变特征（真正边界线）
 */
function hasDoubleJump(data, width, height, direction, pos, line, colorDistThreshold) {
  const start = line.start;
  const end = line.end;
  if (end - start < 2) return false; // 太窄不可能有双跳变

  // 采样边界线中间区域的像素颜色
  const midStart = start + Math.floor((end - start) * 0.3);
  const midEnd = start + Math.floor((end - start) * 0.7);
  if (midEnd <= midStart) return false;

  const samples = [];
  if (direction === 'horizontal') {
    const y = pos;
    for (let x = midStart; x <= midEnd && x < width; x++) {
      const i = (y * width + x) * 4;
      samples.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
    }
  } else {
    const x = pos;
    for (let y = midStart; y <= midEnd && y < height; y++) {
      const i = (y * width + x) * 4;
      samples.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
    }
  }

  if (samples.length < 2) return false;

  // 检查中间区域颜色是否稳定（方差小 = 真正的边界线颜色带）
  const med = medianColor(samples);
  let maxDeviation = 0;
  for (const s of samples) {
    const dev = Math.sqrt((s.r - med.r) ** 2 + (s.g - med.g) ** 2 + (s.b - med.b) ** 2);
    if (dev > maxDeviation) maxDeviation = dev;
  }

  // 中间区域颜色稳定（最大偏差 < 阈值）= 有双跳变 = 真正的边界线
  return maxDeviation < colorDistThreshold * 0.7;
}

/**
 * 统计一组扫描线中有双跳变特征的分界线比例
 * 用于区分真正的边界线马赛克图 vs 无边界线马赛克图的JPG过渡带
 */
function countDoubleJumpLines(data, width, height, allLines, direction, colorDistThreshold) {
  let total = 0, doubleJump = 0;
  for (const lineGroup of allLines) {
    const pos = direction === 'horizontal'
      ? Math.floor(height * 0.5)  // 近似位置
      : Math.floor(width * 0.5);
    for (const line of lineGroup) {
      total++;
      // 需要找到对应的扫描线位置，但这里简化用第一条扫描线的pos
      // 实际验证应该在原始扫描线上做
    }
  }
  return { total, doubleJump: 0 }; // 占位，实际在 process() 中用
}

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

  // 强制网格大小：跳过扫描线检测，直接均匀切割
    if (forceGridSize && forceGridSize > 0) {
      return this._processNoGridLines(pixelData, width, height, forceGridSize, minCellArea);
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

    // ===== 步骤2b: 黑白像素占比检测（参考 7ec2bc4 的 extremeRatio 检测） =====
    let darkPixelCount = 0, lightPixelCount = 0, sampleCount = 0;
    const sampleStepX = Math.max(5, Math.floor(width / 30));
    const sampleStepY = Math.max(5, Math.floor(height / 30));
    for (let y = 0; y < height; y += sampleStepY) {
      for (let x = 0; x < width; x += sampleStepX) {
        const idx = (y * width + x) * 4;
        const r = pixelData[idx], g = pixelData[idx + 1], b = pixelData[idx + 2];
        if (r < 50 && g < 50 && b < 50) darkPixelCount++;
        else if (r > 200 && g > 200 && b > 200) lightPixelCount++;
        sampleCount++;
      }
    }

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
      // 无边界马赛克图：委托给独立的 NoBorderMosaicProcessor 处理
      const noBorderProcessor = new NoBorderMosaicProcessor();
      return noBorderProcessor.process(pixelData, width, height, cellSize);
    }

    console.log('[mosaic process] 有边界, cellSize=' + cellSize + ' lineThickness=' + lineThickness
      + ' confidence=' + confidence
      + ' hBorder=' + JSON.stringify(hBorderCheck)
      + ' vBorder=' + JSON.stringify(vBorderCheck));


    // ===== 步骤3: 精确定位所有分界线 =====
    // 合并所有扫描线的分界线，找到全局一致的分界线位置
    const hLineCenters = this._mergeLineCenters(hLines, cellSize, 3);
    const vLineCenters = this._mergeLineCenters(vLines, cellSize, 3);

    // 检查网格线数量是否充足（对于无网格线的马赛克图，检测到的线可能不够）
    const expectedHLines = Math.round(height / cellSize);
    const expectedVLines = Math.round(width / cellSize);
    const hLineRatio = expectedHLines > 0 ? hLineCenters.length / expectedHLines : 0;
    const vLineRatio = expectedVLines > 0 ? vLineCenters.length / expectedVLines : 0;
    const minLineRatio = 0.4; // 至少达到预期的40%

    if (hLineRatio < minLineRatio || vLineRatio < minLineRatio) {
      // 网格线数量不足，但cellSize已检测到，用检测到的cellSize做均匀切割
      return this._processNoGridLines(pixelData, width, height, cellSize);
    }

    // 推断分界线颜色（用于识别哪些像素属于分界线）
    const lineColor = inferLineColor(pixelData, width, height, hLines, vLines);

    // ===== 步骤4: 构建网格 =====
    // 从分界线位置推断色块边界
    const cellBounds = this._buildCellBounds(hLineCenters, vLineCenters, width, height, lineThickness);

    const cols = cellBounds.hCells.length;
    const rows = cellBounds.vCells.length;


    if (cols === 0 || rows === 0) {
      // 网格构建失败，回退
      return this._processNoGridLines(pixelData, width, height, cellSize);
    }

    // ===== 步骤5: 提取每个色块的颜色 =====
    // borderSkip: 只排除分界线的一半宽度，保留更多有效像素
    const borderSkip = borderMargin !== undefined ? borderMargin : Math.max(1, Math.ceil(lineThickness / 2));

    const segments = [];
    let segId = 0;
    let skippedSmall = 0, skippedNoColor = 0;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cellX = cellBounds.hCells[col];
        const cellY = cellBounds.vCells[row];

        // 提取色块内像素（排除边界）
        const colors = [];
        const startX = cellX.start + borderSkip;
        const endX = cellX.end - borderSkip;
        const startY = cellY.start + borderSkip;
        const endY = cellY.end - borderSkip;

        if (startX >= endX || startY >= endY) {
          // 色块太小，用全区域
          for (let y = cellY.start; y < cellY.end && y < height; y++) {
            for (let x = cellX.start; x < cellX.end && x < width; x++) {
              const i = (y * width + x) * 4;
              colors.push({ r: pixelData[i], g: pixelData[i + 1], b: pixelData[i + 2] });
            }
          }
        } else {
          for (let y = startY; y < endY && y < height; y++) {
            for (let x = startX; x < endX && x < width; x++) {
              const i = (y * width + x) * 4;
              colors.push({ r: pixelData[i], g: pixelData[i + 1], b: pixelData[i + 2] });
            }
          }
        }

        if (colors.length < minCellArea) {
          // 色块太小，跳过
          skippedSmall++;
          continue;
        }

        // 中位数引导的加权平均取色（抗噪 + 准确代表主色调）
        const avgColor = extractDominantColor(colors);
        if (!avgColor) {
          skippedNoColor++;
          continue;
        }

        const markColor = fastFindClosestMarkColor(avgColor);

        segments.push({
          id: segId++,
          x: cellX.start,
          y: cellY.start,
          width: cellX.end - cellX.start,
          height: cellY.end - cellY.start,
          col,
          row,
          avgColor,
          markCode: markColor.code,
          markHex: markColor.hex,
          markRgb: markColor.rgb,
          pixelCount: colors.length
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

  /**
   * 检测网格偏移量（X 和 Y 两个方向）
   *
   * 两步检测：
   * 1. 颜色跳变点投票找候选偏移（取票数前3）
   * 2. 对每个候选偏移验证：用该偏移切分后，格子内部颜色方差最小的就是最佳偏移
   *    （正确的偏移会让格子边界落在色块交界处，格子内部颜色最均匀）
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

    // 验证：用候选偏移切分后，计算格子内部的平均颜色方差
    // 方差最小的偏移 = 格子边界对齐最好 = 正确偏移
    const validateOffset = (offset, gridSize, totalSize, pixelData, width, height, isHorizontal) => {
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
          // 计算方差
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

    // 对 X 方向候选验证
    let bestOffsetX = 0, bestVarX = Infinity;
    for (const c of candidatesX) {
      const v = validateOffset(c.offset, gridSize, width, pixelData, width, height, true);
      if (v < bestVarX) { bestVarX = v; bestOffsetX = c.offset; }
    }

    // 对 Y 方向候选验证
    let bestOffsetY = 0, bestVarY = Infinity;
    for (const c of candidatesY) {
      const v = validateOffset(c.offset, gridSize, height, pixelData, width, height, false);
      if (v < bestVarY) { bestVarY = v; bestOffsetY = c.offset; }
    }

    const minVotes = Math.min(scanRowCount, scanColCount) * 3;
    return {
      offsetX: bestOffsetX,
      offsetY: bestOffsetY,
      hasBoundary: (candidatesX[0] && candidatesX[0].votes > minVotes) || (candidatesY[0] && candidatesY[0].votes > minVotes)
    };
  }

  /**
   * 无分界线模式：偏移对齐 + 边缘裁剪 + 均匀切分
   *
   * 改进：
   * 1. 检测网格偏移，对齐到实际色块边界
   * 2. 裁掉四周不完整色块（只裁碎片，不裁完整色块）
   */
  /**
   * 用扫描线检测到的分界线位置精确切分色块
   * 不依赖均匀切分，直接用实际颜色跳变位置作为色块边界
   */
  _processByDetectedLines(pixelData, width, height, cellSize, hLineCenters, vLineCenters) {
    // 构建行列边界（在分界线之间插入均匀网格线填补空缺）
    const buildBoundaries = (lineCenters, totalSize, cellSize) => {
      if (lineCenters.length === 0) {
        // 没有检测到分界线，均匀切分
        const lines = [];
        for (let i = 0; i <= totalSize; i += cellSize) lines.push(i);
        return lines;
      }

      // 排序
      const sorted = [...lineCenters].sort((a, b) => a - b);

      // 在首尾和分界线之间补充缺失的网格线
      const result = [0];

      for (let i = 0; i < sorted.length; i++) {
        const gap = sorted[i] - result[result.length - 1];

        if (gap > cellSize * 1.5) {
          // 间距太大（同色块跨了多个cell），在中间插入均匀线
          let pos = result[result.length - 1] + cellSize;
          while (pos < sorted[i] - cellSize * 0.5) {
            result.push(pos);
            pos += cellSize;
          }
        }
        result.push(sorted[i]);
      }

      // 尾部补充
      while (result[result.length - 1] + cellSize < totalSize) {
        result.push(result[result.length - 1] + cellSize);
      }
      result.push(totalSize);

      return result;
    };

    const colBoundaries = buildBoundaries(hLineCenters, width, cellSize);
    const rowBoundaries = buildBoundaries(vLineCenters, height, cellSize);

    const cols = colBoundaries.length - 1;
    const rows = rowBoundaries.length - 1;

    console.log('[mosaic detectedLines] cols=' + cols + ' rows=' + rows
      + ' colBounds[0..5]=' + JSON.stringify(colBoundaries.slice(0, 6))
      + ' rowBounds[0..5]=' + JSON.stringify(rowBoundaries.slice(0, 6)));

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

        // 收集格子内像素
        const colors = [];
        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            const i = (y * width + x) * 4;
            colors.push({ r: pixelData[i], g: pixelData[i + 1], b: pixelData[i + 2] });
          }
        }

        if (colors.length === 0) continue;

        // 中位数引导加权平均取色
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

    return {
      segments, segmentCount: segments.length,
      cols, rows, gridSize: cellSize, hasGridLines: false,
      width, height
    };
  }

  /**
   * 跳变追踪切分（无边界马赛克图）
   *
   * 通过多线扫描收集颜色跳变位置，投票合并出全局色块边界。
   * 间距大于 cellSize*1.5 的地方（同色块跨多格）用逐格追踪补充：
   * 从上一个实际跳变出发，预期下一个在 cellSize±1 处。
   */
  _processByEdgeTracking(pixelData, width, height, cellSize) {
    const colorDistThreshold = 30;
    const scanCount = Math.min(31, Math.max(15, Math.floor(Math.min(width, height) / 30)));
    const bucketSize = Math.max(2, Math.floor(cellSize / 2));

    // 步骤1：多线扫描收集跳变位置
    // X 方向（横向扫描线，记录 x 坐标的跳变）
    const xJumpVotes = {};
    const yJumpVotes = {};

    for (let i = 0; i < scanCount; i++) {
      // 横向扫描
      const y = Math.floor(height * i / (scanCount - 1));
      for (let x = 2; x < width - 2; x++) {
        const i1 = (y * width + x - 2) * 4;
        const i2 = (y * width + x + 2) * 4;
        const dr = pixelData[i1] - pixelData[i2];
        const dg = pixelData[i1 + 1] - pixelData[i2 + 1];
        const db = pixelData[i1 + 2] - pixelData[i2 + 2];
        if (dr * dr + dg * dg + db * db > colorDistThreshold * colorDistThreshold) {
          const bucket = Math.round(x / bucketSize) * bucketSize;
          xJumpVotes[bucket] = (xJumpVotes[bucket] || 0) + 1;
        }
      }

      // 纵向扫描
      const x = Math.floor(width * i / (scanCount - 1));
      for (let y2 = 2; y2 < height - 2; y2++) {
        const i1 = ((y2 - 2) * width + x) * 4;
        const i2 = ((y2 + 2) * width + x) * 4;
        const dr = pixelData[i1] - pixelData[i2];
        const dg = pixelData[i1 + 1] - pixelData[i2 + 1];
        const db = pixelData[i1 + 2] - pixelData[i2 + 2];
        if (dr * dr + dg * dg + db * db > colorDistThreshold * colorDistThreshold) {
          const bucket = Math.round(y2 / bucketSize) * bucketSize;
          yJumpVotes[bucket] = (yJumpVotes[bucket] || 0) + 1;
        }
      }
    }

    // 步骤2：筛选高频跳变位置（出现次数 ≥ 扫描线数 × 30%）
    const minVotes = Math.max(2, Math.floor(scanCount * 0.3));
    const filterJumps = (votes, minVotes, minGap) => {
      const sorted = Object.entries(votes)
        .filter(([_, count]) => count >= minVotes)
        .map(([pos]) => Number(pos))
        .sort((a, b) => a - b);
      // 移除间距过小的（噪声）
      const result = [];
      for (const pos of sorted) {
        if (result.length === 0 || pos - result[result.length - 1] >= minGap) {
          result.push(pos);
        }
      }
      return result;
    };

    // 步骤2.5：聚合连续跳变 — JPG过渡带产生的连续跳变合并成一个边界
    const clusterJumps = (jumps, minGap) => {
      if (jumps.length === 0) return [];
      const clusters = [];
      let current = [jumps[0]];
      for (let i = 1; i < jumps.length; i++) {
        if (jumps[i] - jumps[i - 1] <= minGap) {
          current.push(jumps[i]);
        } else {
          clusters.push(current);
          current = [jumps[i]];
        }
      }
      clusters.push(current);
      // 每个聚类取中位数作为边界位置
      return clusters.map(c => Math.round(c.reduce((s, v) => s + v, 0) / c.length));
    };

    // 过滤掉间距过小的噪声 + 聚合连续跳变
    const minGap = Math.floor(cellSize * 0.6);
    const xJumps = clusterJumps(
      filterJumps(xJumpVotes, minVotes, minGap),
      minGap
    );
    const yJumps = clusterJumps(
      filterJumps(yJumpVotes, minVotes, minGap),
      minGap
    );

    console.log('[mosaic edgeTrack] xJumps(' + xJumps.length + '): ' + JSON.stringify(xJumps.slice(0, 10))
      + ' yJumps(' + yJumps.length + '): ' + JSON.stringify(yJumps.slice(0, 10)));

    // 步骤3：构建完整边界线
    const buildBoundaries = (jumps, totalSize, cellSize) => {
      if (jumps.length === 0) {
        const lines = [];
        for (let i = 0; i <= totalSize; i += cellSize) lines.push(i);
        return lines;
      }

      const result = [0];

      // 第一个跳变之前补充
      let firstExpected = jumps[0] % cellSize; // 偏移
      while (firstExpected + cellSize < jumps[0] - cellSize * 0.3) {
        result.push(firstExpected);
        firstExpected += cellSize;
      }
      if (result[result.length - 1] !== jumps[0]) result.push(jumps[0]);

      // 逐个跳变追踪
      for (let i = 1; i < jumps.length; i++) {
        const gap = jumps[i] - jumps[i - 1];
        if (gap > cellSize * 1.5) {
          // 同色块跨多格：按 cellSize 间距补充
          let pos = jumps[i - 1] + cellSize;
          while (pos < jumps[i] - cellSize * 0.5) {
            result.push(pos);
            pos += cellSize;
          }
        }
        result.push(jumps[i]);
      }

      // 尾部补充
      const last = result[result.length - 1];
      let pos = last + cellSize;
      while (pos < totalSize) {
        result.push(pos);
        pos += cellSize;
      }
      if (result[result.length - 1] < totalSize) result.push(totalSize);

      return result.filter((v, i, arr) => i === 0 || v !== arr[i - 1]);
    };

    const colBoundaries = buildBoundaries(xJumps, width, cellSize);
    const rowBoundaries = buildBoundaries(yJumps, height, cellSize);
    const cols = colBoundaries.length - 1;
    const rows = rowBoundaries.length - 1;

    console.log('[mosaic edgeTrack] cols=' + cols + ' rows=' + rows
      + ' colBounds[0..6]=' + JSON.stringify(colBoundaries.slice(0, 7)));

    // 步骤4：逐色块取色
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

        const colors = [];
        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
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

    console.log('[mosaic edgeTrack] segments=' + segments.length);

    return {
      segments, segmentCount: segments.length,
      cols, rows, gridSize: cellSize, hasGridLines: false,
      width, height
    };
  }

  _processNoGridLines(pixelData, width, height, gridSize) {
    // 检测网格偏移
    const offset = this._detectGridOffset(pixelData, width, height, gridSize);
    const startX0 = offset.hasBoundary ? offset.offsetX : 0;
    const startY0 = offset.hasBoundary ? offset.offsetY : 0;

    /**
     * 逐列确定边界：跳变投票法
     *
     * 利用"同一列在所有行上宽度一致"的特性：
     * 在每个预期边界位置附近 ±2px 窗口内，
     * 统计所有扫描线上的颜色跳变次数，
     * 跳变最多的位置就是真实色块边界
     */
    const findBoundaries = (startPos, totalSize, gridSize, isHorizontal) => {
      const boundaries = [startPos];
      let pos = startPos;

      // 扫描线位置
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

        // 在 expectedEnd ±2px 窗口内统计跳变
        const windowStart = Math.max(pos + 3, expectedEnd - 2);
        const windowEnd = Math.min(totalSize - 1, expectedEnd + 2);
        const jumpCounts = {};

        for (const linePos of scanLines) {
          for (let p = windowStart; p <= windowEnd; p++) {
            // 检查 p 和 p+1 之间是否有跳变
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

        // 选跳变次数最多的位置作为边界
        let bestEnd = expectedEnd;
        let maxJumps = 0;
        for (const p in jumpCounts) {
          if (jumpCounts[p] > maxJumps) {
            maxJumps = jumpCounts[p];
            bestEnd = Number(p);
          }
        }

        // 如果窗口内没有任何跳变（同色块跨多格），用预期位置
        boundaries.push(bestEnd);
        pos = bestEnd;
      }

      if (boundaries[boundaries.length - 1] < totalSize) {
        boundaries.push(totalSize);
      }

      return boundaries;
    };

    const colBoundaries = findBoundaries(startX0, width, gridSize, true);
    const rowBoundaries = findBoundaries(startY0, height, gridSize, false);
    const cols = colBoundaries.length - 1;
    const rows = rowBoundaries.length - 1;

    // 打印前几列/行的实际宽度
    const colWidths = colBoundaries.slice(0, 8).map((v, i, a) => i > 0 ? v - a[i - 1] : 0).slice(1);
    const rowHeights = rowBoundaries.slice(0, 8).map((v, i, a) => i > 0 ? v - a[i - 1] : 0).slice(1);
    console.log('[mosaic noGridLines] gridSize=' + gridSize + ' cols=' + cols + ' rows=' + rows
      + ' colWidths[0..6]=' + JSON.stringify(colWidths)
      + ' rowHeights[0..6]=' + JSON.stringify(rowHeights));

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

        const colors = [];
        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
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

    console.log('[mosaic noGridLines] segments=' + segments.length);

    return {
      segments, segmentCount: segments.length,
      cols, rows, gridSize, hasGridLines: false,
      width, height
    };
  }

  /**
   * 无网格线马赛克图：均匀切割 + 动态插入窄边界网格线
   * 扫描图片检测主要颜色边界，在边界位置插入额外网格线
   */
  _processWithDetectedBoundaries(pixelData, width, height, gridSize, minCellArea) {
    const colorDistThreshold = 30; // 降低阈值检测更多边界
    const scanRowCount = Math.min(15, Math.max(5, Math.floor(height / 20)));
    const scanColCount = Math.min(15, Math.max(5, Math.floor(width / 20)));

    // 扫描多行收集垂直边界位置
    const halfGrid = Math.max(2, Math.floor(gridSize / 2));
    const vBoundaryVotes = {};
    for (let s = 0; s < scanRowCount; s++) {
      const y = Math.floor(height * (s + 1) / (scanRowCount + 1));
      let prevChangeX = -100;
      for (let x = 2; x < width - 2; x++) {
        const i1 = (y * width + x - 2) * 4;
        const i2 = (y * width + x + 2) * 4;
        const dist = Math.sqrt(
          (pixelData[i1] - pixelData[i2]) ** 2 +
          (pixelData[i1 + 1] - pixelData[i2 + 1]) ** 2 +
          (pixelData[i1 + 2] - pixelData[i2 + 2]) ** 2
        );
        if (dist > colorDistThreshold && x - prevChangeX > halfGrid) {
          const bucket = Math.round(x / halfGrid) * halfGrid;
          vBoundaryVotes[bucket] = (vBoundaryVotes[bucket] || 0) + 1;
          prevChangeX = x;
        }
      }
    }

    // 扫描多列收集水平边界位置
    const hBoundaryVotes = {};
    for (let s = 0; s < scanColCount; s++) {
      const x = Math.floor(width * (s + 1) / (scanColCount + 1));
      let prevChangeY = -100;
      for (let y = 2; y < height - 2; y++) {
        const i1 = ((y - 2) * width + x) * 4;
        const i2 = ((y + 2) * width + x) * 4;
        const dist = Math.sqrt(
          (pixelData[i1] - pixelData[i2]) ** 2 +
          (pixelData[i1 + 1] - pixelData[i2 + 1]) ** 2 +
          (pixelData[i1 + 2] - pixelData[i2 + 2]) ** 2
        );
        if (dist > colorDistThreshold && y - prevChangeY > halfGrid) {
          const bucket = Math.round(y / halfGrid) * halfGrid;
          hBoundaryVotes[bucket] = (hBoundaryVotes[bucket] || 0) + 1;
          prevChangeY = y;
        }
      }
    }

    // 过滤：只保留最显著的边界（按票数排序，每方向最多3条）
    const maxBoundaries = 3;
    const sortedV = Object.entries(vBoundaryVotes).sort((a, b) => b[1] - a[1]).slice(0, maxBoundaries * 2);
    const sortedH = Object.entries(hBoundaryVotes).sort((a, b) => b[1] - a[1]).slice(0, maxBoundaries * 2);

    // 进一步过滤：边界之间距离至少 gridSize/2，避免太密集
    const filterClose = (entries, minDist) => {
      const result = [];
      for (const [pos, count] of entries) {
        const p = Number(pos);
        const tooClose = result.some(r => Math.abs(r[0] - p) < minDist);
        if (!tooClose) result.push([p, count]);
      }
      return result;
    };

    const minDist = Math.floor(gridSize / 2);
    const filteredV = filterClose(sortedV, minDist).slice(0, maxBoundaries);
    const filteredH = filterClose(sortedH, minDist).slice(0, maxBoundaries);

    const detectedVBoundaries = filteredV.map(e => e[0]).sort((a, b) => a - b);
    const detectedHBoundaries = filteredH.map(e => e[0]).sort((a, b) => a - b);

    // 生成常规网格位置
    const regularVLines = [];
    for (let x = 0; x <= width; x += gridSize) regularVLines.push(x);
    const regularHLines = [];
    for (let y = 0; y <= height; y += gridSize) regularHLines.push(y);

    // 合并检测到的边界和常规网格
    // 如果检测到的边界距离常规网格线很近（< gridSize/2），替换该线而不是添加
    const mergeLines = (regular, detected) => {
      const merged = [...regular];
      for (const b of detected) {
        // 找最近的常规网格线
        let closestIdx = -1, closestDist = Infinity;
        for (let i = 0; i < merged.length; i++) {
          const dist = Math.abs(merged[i] - b);
          if (dist < closestDist) {
            closestDist = dist;
            closestIdx = i;
          }
        }
        // 如果距离 < gridSize/2，替换；否则添加
        if (closestDist < gridSize / 2 && closestIdx >= 0) {
          merged[closestIdx] = b;
        } else {
          merged.push(b);
        }
      }
      merged.sort((a, b) => a - b);
      return merged.filter((v, i, arr) => i === 0 || v !== arr[i - 1]);
    };

    const allVLines = mergeLines(regularVLines, detectedVBoundaries);
    const allHLines = mergeLines(regularHLines, detectedHBoundaries);


    // 构建格子
    const segments = [];
    let segId = 0;
    let skippedSmall = 0;
    let skippedPositions = [];

    for (let row = 0; row < allHLines.length - 1; row++) {
      for (let col = 0; col < allVLines.length - 1; col++) {
        const startX = allVLines[col];
        const startY = allHLines[row];
        const endX = Math.min(allVLines[col + 1], width);
        const endY = Math.min(allHLines[row + 1], height);

        const cellW = endX - startX;
        const cellH = endY - startY;
        if (cellW <= 1 || cellH <= 1) continue;

        // 采样收集格子内像素
        const colors = [];
        const step = Math.max(1, Math.floor(Math.max(cellW, cellH) / 8));
        for (let y = startY; y < endY; y += step) {
          for (let x = startX; x < endX; x += step) {
            const i = (y * width + x) * 4;
            colors.push({ r: pixelData[i], g: pixelData[i + 1], b: pixelData[i + 2] });
          }
        }

        if (colors.length < minCellArea) {
          skippedSmall++;
          if (skippedPositions.length < 10) skippedPositions.push('(' + col + ',' + row + '):' + cellW + 'x' + cellH);
          continue;
        }

        // 主导色（16级量化众数）
        const colorCount = {};
        for (const c of colors) {
          const key = `${Math.round(c.r / 16) * 16},${Math.round(c.g / 16) * 16},${Math.round(c.b / 16) * 16}`;
          colorCount[key] = (colorCount[key] || 0) + 1;
        }
        let maxCount = 0, dominantKey = '208,208,208';
        for (const key in colorCount) {
          if (colorCount[key] > maxCount) {
            maxCount = colorCount[key];
            dominantKey = key;
          }
        }
        const [r, g, b] = dominantKey.split(',').map(Number);
        const finalColor = { r, g, b };
        const markColor = fastFindClosestMarkColor(finalColor);

        segments.push({
          id: segId++,
          x: startX, y: startY,
          width: cellW, height: cellH,
          col, row, avgColor: finalColor,
          markCode: markColor.code,
          markHex: markColor.hex,
          markRgb: markColor.rgb,
          pixelCount: colors.length
        });
      }
    }


    const cols = allVLines.length - 1;
    const rows = allHLines.length - 1;

    return {
      segments, segmentCount: segments.length,
      cols, rows, gridSize, hasGridLines: false,
      width, height
    };
  }
}

module.exports = {
  MosaicProcessor,
  scanLineForGridLines,
  inferCellSize,
  medianColor,
  extractDominantColor
};
