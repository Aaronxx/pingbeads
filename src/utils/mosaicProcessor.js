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

// ========== 工具函数 ==========

/** 快速中位数（就地排序，调用方传入的数组若需保留请先 copy） */
function fastMedian(arr) {
  const len = arr.length;
  if (len === 0) return 0;
  arr.sort((a, b) => a - b);
  const mid = len >> 1;
  return len % 2 === 1 ? arr[mid] : Math.round((arr[mid - 1] + arr[mid]) / 2);
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

/** 找中位数（就地排序；调用方需保留原数组请先 copy） */
function findMedian(arr) {
  if (!arr || arr.length === 0) return 0;
  arr.sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
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
function scanLineForGridLines(data, width, height, direction, pos, colorDistThreshold = 30, clusterGap = 5) {
  const changes = [];
  // 性能：用平方阈值比较，避免每像素 Math.sqrt（扫描覆盖整行/整列像素）
  const thresholdSq = colorDistThreshold * colorDistThreshold;

  if (direction === 'horizontal') {
    const y = pos;
    if (y < 0 || y >= height) return [];
    for (let x = 1; x < width; x++) {
      const i1 = (y * width + x - 1) * 4;
      const i2 = (y * width + x) * 4;
      const dr = data[i1] - data[i2];
      const dg = data[i1 + 1] - data[i2 + 1];
      const db = data[i1 + 2] - data[i2 + 2];
      if (dr * dr + dg * dg + db * db > thresholdSq) changes.push(x);
    }
  } else {
    const x = pos;
    if (x < 0 || x >= width) return [];
    for (let y = 1; y < height; y++) {
      const i1 = ((y - 1) * width + x) * 4;
      const i2 = (y * width + x) * 4;
      const dr = data[i1] - data[i2];
      const dg = data[i1 + 1] - data[i2 + 1];
      const db = data[i1 + 2] - data[i2 + 2];
      if (dr * dr + dg * dg + db * db > thresholdSq) changes.push(y);
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
 * @param {Array} allLines - 所有扫描线的分界线集合
 * @param {number} minSize - 最小色块大小
 * @param {number} maxSize - 最大色块大小
 * @returns {object} { cellSize, lineThickness, confidence, linePositions }
 */
function inferCellSize(allLines, minSize = 5, maxSize = 60) {
  // 收集所有分界线中心
  const allCenters = [];
  for (const lineGroup of allLines) {
    for (const line of lineGroup) {
      allCenters.push(line.center);
    }
  }

  if (allCenters.length < 4) return null;

  // 排序
  allCenters.sort((a, b) => a - b);

  // 找中心间距的众数
  const gaps = [];
  for (let i = 1; i < allCenters.length; i++) {
    const gap = allCenters[i] - allCenters[i - 1];
    if (gap >= minSize && gap <= maxSize) gaps.push(gap);
  }

  if (gaps.length < 3) return null;

  const cellSize = findMode(gaps);
  const lineThickness = findMode(allLines.flatMap(g => g.map(l => l.width)));

  // 置信度：间距的集中度
  let inRange = 0;
  for (const g of gaps) {
    if (Math.abs(g - cellSize) <= 2) inRange++;
  }
  const confidence = inRange / gaps.length;

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

    if (hInference && vInference && hInference.confidence > 0.3 && vInference.confidence > 0.3) {
      // 双向检测都成功（降低阈值到0.3，但要求lineThickness>=2过滤JPG伪影）
      cellSize = Math.round((hInference.cellSize + vInference.cellSize) / 2);
      lineThickness = Math.round((hInference.lineThickness + vInference.lineThickness) / 2);
      confidence = (hInference.confidence + vInference.confidence) / 2;
      // lineThickness>=2 说明是真正的色块边界，不是JPG伪影
      hasGridLines = lineThickness >= 2 && cellSize >= 5;
      // 额外检查：线条数量合理性（卡通轮廓线会被误检，数量远超正常网格）
      // 只在线条很细（1px）且数量异常时才过滤，真正的网格线有一定宽度
      if (hasGridLines && lineThickness <= 1) {
        const expectedLines = (width + height) / cellSize;
        const actualLines = hInference.totalLines + vInference.totalLines;
        const lineRatio = actualLines / expectedLines;
        if (lineRatio > 3) {
          hasGridLines = false;
        }
      }
    } else if (hInference && hInference.confidence > 0.3 && hInference.lineThickness >= 2) {
      cellSize = hInference.cellSize;
      lineThickness = hInference.lineThickness;
      confidence = hInference.confidence;
      hasGridLines = cellSize >= 5;
      // 额外检查：线条数量合理性
      if (hasGridLines && lineThickness <= 1) {
        const expectedLines = (width + height) / cellSize;
        const actualLines = hInference.totalLines;
        const lineRatio = actualLines / expectedLines;
        if (lineRatio > 3) {
          hasGridLines = false;
        }
      }
    } else if (vInference && vInference.confidence > 0.3 && vInference.lineThickness >= 2) {
      cellSize = vInference.cellSize;
      lineThickness = vInference.lineThickness;
      confidence = vInference.confidence;
      hasGridLines = cellSize >= 5;
      // 额外检查：线条数量合理性
      if (hasGridLines && lineThickness <= 1) {
        const expectedLines = (width + height) / cellSize;
        const actualLines = vInference.totalLines;
        const lineRatio = actualLines / expectedLines;
        if (lineRatio > 3) {
          hasGridLines = false;
        }
      }
    } else {
      // 检测失败，回退到固定网格
      cellSize = fallbackGridSize;
      lineThickness = 0;
      confidence = 0;
      hasGridLines = false;
    }

    if (!hasGridLines) {
      return this._processNoGridLines(pixelData, width, height, cellSize, minCellArea);
    }


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
   * 检测最佳网格偏移量（用于均匀切割模式）
   * 扫描图片中的颜色边界，使网格线尽量对齐到颜色变化处
   */
  _detectGridOffset(pixelData, width, height, gridSize) {
    const colorDistThreshold = 30;
    const thresholdSq = colorDistThreshold * colorDistThreshold;
    // 扫描多行找垂直边界
    const scanRowCount = Math.min(9, Math.max(3, Math.floor(height / 30)));

    // 对每个变化点直接计算 offset 并投票
    const offsetVotes = new Array(gridSize).fill(0);

    for (let s = 0; s < scanRowCount; s++) {
      const y = Math.floor(height * (s + 1) / (scanRowCount + 1));
      for (let x = 2; x < width - 2; x++) {
        const i1 = (y * width + x - 2) * 4;
        const i2 = (y * width + x + 2) * 4;
        const dr = pixelData[i1] - pixelData[i2];
        const dg = pixelData[i1 + 1] - pixelData[i2 + 1];
        const db = pixelData[i1 + 2] - pixelData[i2 + 2];
        if (dr * dr + dg * dg + db * db > thresholdSq) {
          // 直接对 offset 投票
          offsetVotes[x % gridSize]++;
        }
      }
    }

    // 找票数最多的 offset
    let bestOffsetX = 0, maxVotes = 0;
    for (let i = 0; i < gridSize; i++) {
      if (offsetVotes[i] > maxVotes) {
        maxVotes = offsetVotes[i];
        bestOffsetX = i;
      }
    }


    return { offsetX: bestOffsetX, offsetY: 0, hasBoundary: maxVotes > scanRowCount * 5 };
  }

  /**
   * 无分界线模式：固定网格 + 平均取色（恢复 7ec2bc4 逻辑）
   */
  _processNoGridLines(pixelData, width, height, gridSize) {
    const cols = Math.ceil(width / gridSize);
    const rows = Math.ceil(height / gridSize);
    const segments = [];
    let segId = 0;
    const maxDistThresholdSq = 30 * 30;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const startX = col * gridSize;
        const startY = row * gridSize;
        const endX = Math.min(startX + gridSize, width);
        const endY = Math.min(startY + gridSize, height);

        // 性能：直接累加 RGB，避免每像素分配 {r,g,b} 对象
        let sumR = 0, sumG = 0, sumB = 0, count = 0;
        for (let y = startY; y < endY; y++) {
          const rowBase = y * width;
          for (let x = startX; x < endX; x++) {
            const i = (rowBase + x) * 4;
            sumR += pixelData[i];
            sumG += pixelData[i + 1];
            sumB += pixelData[i + 2];
            count++;
          }
        }

        // 如果没有有效颜色，使用默认灰色（7ec2bc4 逻辑）
        if (count === 0) {
          const markColor = fastFindClosestMarkColor({ r: 128, g: 128, b: 128 });
          segments.push({
            id: segId++,
            x: startX, y: startY,
            width: endX - startX, height: endY - startY,
            col, row, avgColor: { r: 128, g: 128, b: 128 },
            markCode: markColor ? markColor.code : 'M001',
            markHex: markColor ? markColor.hex : '#CCCCCC',
            markRgb: markColor ? markColor.rgb : { r: 204, g: 204, b: 204 }
          });
          continue;
        }

        const avgColor = {
          r: Math.round(sumR / count),
          g: Math.round(sumG / count),
          b: Math.round(sumB / count)
        };

        // 判断是否为纯色区域（计算最大颜色距离平方，避免 sqrt）
        let maxDistSq = 0;
        for (let y = startY; y < endY; y++) {
          const rowBase = y * width;
          for (let x = startX; x < endX; x++) {
            const i = (rowBase + x) * 4;
            const dr = pixelData[i] - avgColor.r;
            const dg = pixelData[i + 1] - avgColor.g;
            const db = pixelData[i + 2] - avgColor.b;
            const dSq = dr * dr + dg * dg + db * db;
            if (dSq > maxDistSq) maxDistSq = dSq;
          }
        }

        // 如果颜色变化太大，使用主导色（16级量化众数）
        let finalColor = avgColor;
        if (maxDistSq > maxDistThresholdSq) {
          // 性能：用整数 key 替代字符串拼接 + split 解析（量化等价于 Math.round(v/16)*16）
          // 用 Map 保留插入顺序，与原 {} + 字符串 key 在 count 平局时选中相同 bucket
          const colorCount = new Map();
          for (let y = startY; y < endY; y++) {
            const rowBase = y * width;
            for (let x = startX; x < endX; x++) {
              const i = (rowBase + x) * 4;
              const qr = (pixelData[i] + 8) >> 4;
              const qg = (pixelData[i + 1] + 8) >> 4;
              const qb = (pixelData[i + 2] + 8) >> 4;
              const key = (qr << 10) | (qg << 5) | qb;
              colorCount.set(key, (colorCount.get(key) || 0) + 1);
            }
          }
          let maxCount = 0;
          for (const [key, cnt] of colorCount) {
            if (cnt > maxCount) {
              maxCount = cnt;
              finalColor = {
                r: (key >> 10) << 4,
                g: ((key >> 5) & 0x1F) << 4,
                b: (key & 0x1F) << 4
              };
            }
          }
        }

        // 映射到 Mark 色号
        const markColor = fastFindClosestMarkColor(finalColor);

        segments.push({
          id: segId++,
          x: startX, y: startY,
          width: endX - startX, height: endY - startY,
          col, row, avgColor: finalColor,
          markCode: markColor ? markColor.code : 'M001',
          markHex: markColor ? markColor.hex : '#CCCCCC',
          markRgb: markColor ? markColor.rgb : { r: 204, g: 204, b: 204 }
        });
      }
    }

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
    const thresholdSq = colorDistThreshold * colorDistThreshold;
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
        const dr = pixelData[i1] - pixelData[i2];
        const dg = pixelData[i1 + 1] - pixelData[i2 + 1];
        const db = pixelData[i1 + 2] - pixelData[i2 + 2];
        if (dr * dr + dg * dg + db * db > thresholdSq && x - prevChangeX > halfGrid) {
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
        const dr = pixelData[i1] - pixelData[i2];
        const dg = pixelData[i1 + 1] - pixelData[i2 + 1];
        const db = pixelData[i1 + 2] - pixelData[i2 + 2];
        if (dr * dr + dg * dg + db * db > thresholdSq && y - prevChangeY > halfGrid) {
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
        // 性能：用整数 key 替代字符串拼接 + split 解析（量化等价于 Math.round(v/16)*16）
        // 用 Map 保留插入顺序，与原 {} + 字符串 key 在 count 平局时选中相同 bucket
        const colorCount = new Map();
        for (const c of colors) {
          const qr = (c.r + 8) >> 4;
          const qg = (c.g + 8) >> 4;
          const qb = (c.b + 8) >> 4;
          const key = (qr << 10) | (qg << 5) | qb;
          colorCount.set(key, (colorCount.get(key) || 0) + 1);
        }
        let maxCount = 0, dominantKey = -1;
        for (const [key, cnt] of colorCount) {
          if (cnt > maxCount) {
            maxCount = cnt;
            dominantKey = key;
          }
        }
        const finalColor = dominantKey < 0
          ? { r: 208, g: 208, b: 208 }
          : { r: (dominantKey >> 10) << 4, g: ((dominantKey >> 5) & 0x1F) << 4, b: (dominantKey & 0x1F) << 4 };
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
