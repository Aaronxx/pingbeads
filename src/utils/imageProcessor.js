/**
 * 图像处理模块 - 网格化 + 主导色识别
 *
 * 主要功能：
 * 1. processSimple: 简化版网格处理
 * 2. processWithSmartRegions: 智能区域处理（自动检测格子大小）
 * 3. 边缘检测与裁剪
 */

const { fastFindClosestMarkColor } = require('../utils/colorMapper');
const { isSpecialColor } = require('../utils/colorMapper');

/**
 * 计算颜色距离 (欧氏距离)
 */
function colorDistance(c1, c2) {
  if (!c1 || !c2) return Infinity;
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
    Math.pow(c1.g - c2.g, 2) +
    Math.pow(c1.b - c2.b, 2)
  );
}

/**
 * 简化版处理 - 逐像素映射
 * 适合直接使用，不需要预处理
 * 优化：使用分片处理避免阻塞
 * @param {Uint8ClampedArray} pixelData - 像素数据
 * @param {number} width - 图像宽度
 * @param {number} height - 图像高度
 * @param {number} gridSize - 网格大小
 * @param {number} mergeThreshold - 颜色聚合阈值 (0-30)
 * @param {number} vibrantScale - 鲜艳度增强系数 (0-1)，0 表示不增强，默认 0.3
 */
function processSimple(pixelData, width, height, gridSize, mergeThreshold = 0, vibrantScale = 0) {
  const cols = Math.ceil(width / gridSize);
  const rows = Math.ceil(height / gridSize);
  const scaleX = width / cols;
  const scaleY = height / rows;

  const gridData = [];

  // 预先计算每个网格区域的像素范围
  const gridRegions = [];
  for (let row = 0; row < rows; row++) {
    gridRegions[row] = [];
    for (let col = 0; col < cols; col++) {
      const srcX = Math.floor(col * scaleX);
      const srcY = Math.floor(row * scaleY);
      const endX = Math.floor((col + 1) * scaleX);
      const endY = Math.floor((row + 1) * scaleY);
      gridRegions[row][col] = { srcX, srcY, endX, endY };
    }
  }
  // 主循环

  // 如果没有像素数据，使用简单算法
  if (!pixelData || pixelData.length === 0) {
    return generatePlaceholderGrid(cols, rows, gridSize);
  }

  // 鲜艳度预处理
  let processedPixelData = pixelData;

  let enhanceCount = 0;
  let findCount = 0;

  // 缓存 fastFindClosestMarkColor 的结果
  const markCache = new Map();
  const MARK_CACHE_MAX = 8192;

  for (let row = 0; row < rows; row++) {
    gridData[row] = [];
    for (let col = 0; col < cols; col++) {
      const { srcX, srcY, endX, endY } = gridRegions[row][col];

      let r = 0, g = 0, b = 0, count = 0;

      // 遍历网格内所有像素
      for (let y = srcY; y < endY && y < height; y++) {
        for (let x = srcX; x < endX && x < width; x++) {
          const idx = (y * width + x) * 4;
          r += processedPixelData[idx];
          g += processedPixelData[idx + 1];
          b += processedPixelData[idx + 2];
          count++;
        }
      }

      const dominantColor = count > 0 ? {
        r: Math.round(r / count),
        g: Math.round(g / count),
        b: Math.round(b / count)
      } : { r: 0, g: 0, b: 0 };

      // 鲜艳度增强/降低：饱和度 + 亮度 + 对比度 组合调整
      // vibrantScale 范围：-10 到 10
      let vibrantColor = dominantColor;
      if (vibrantScale !== 0) {
        if (vibrantScale > 0) {
          // 正数：增强鲜艳度
          vibrantColor = cachedEnhanceVibrant(dominantColor, vibrantScale / 10);
          enhanceCount++;
        } else {
          // 负数：降低鲜艳度
          vibrantColor = cachedReduceVibrant(dominantColor, Math.abs(vibrantScale) / 10);
        }
      }

      // 使用快速查找（带缓存）
      const rq = Math.floor(vibrantColor.r / 4);
      const gq = Math.floor(vibrantColor.g / 4);
      const bq = Math.floor(vibrantColor.b / 4);
      const cacheKeyV = (rq << 12) | (gq << 6) | bq;
      let markColor;
      if (markCache.has(cacheKeyV)) {
        markColor = markCache.get(cacheKeyV);
      } else {
        markColor = fastFindClosestMarkColor(vibrantColor);
        if (markCache.size < MARK_CACHE_MAX) {
          markCache.set(cacheKeyV, markColor);
        }
      }
      findCount++;

      gridData[row][col] = {
        x: col * gridSize,
        y: row * gridSize,
        width: gridSize,
        height: gridSize,
        rawRgb: dominantColor,
        originalRgb: dominantColor,
        markCode: markColor.code,
        markHex: markColor.hex,
        markRgb: markColor.rgb
      };

    }
  }
  // 颜色聚合 - 将相近的原始 RGB 颜色映射到相同的 Mark 色号
  if (mergeThreshold > 0) {
    aggregateSimilarColors(gridData, rows, cols, mergeThreshold);
  }

  return { gridData, cols, rows, gridSize };
}

/**
 * 生成占位网格（无图片数据时使用）
 */
function generatePlaceholderGrid(cols, rows, gridSize) {
  
  const gridData = [];
  
  for (let row = 0; row < rows; row++) {
    gridData[row] = [];
    for (let col = 0; col < cols; col++) {
      // 生成渐变占位色
      const r = Math.floor(128 + 127 * Math.sin(col / cols * Math.PI));
      const g = Math.floor(128 + 127 * Math.sin(row / rows * Math.PI));
      const b = 150;
      
      const markColor = fastFindClosestMarkColor({ r, g, b });
      
      gridData[row][col] = {
        x: col * gridSize,
        y: row * gridSize,
        width: gridSize,
        height: gridSize,
        rawRgb: { r, g, b },
        originalRgb: { r, g, b },
        markCode: markColor.code,
        markHex: markColor.hex,
        markRgb: markColor.rgb,
        merged: false
      };
    }
  }
  
  return { gridData, cols, rows, gridSize };
}

/**
 * 颜色聚合 - 基于目标色块数量的 K-means 聚类（优化版）
 * @param {Array} gridData - 网格数据
 * @param {number} rows - 行数
 * @param {number} cols - 列数
 * @param {number} targetCount - 目标色块数量 (1-30)
 */
function aggregateSimilarColors(gridData, rows, cols, targetCount) {
  if (!gridData || targetCount <= 0) return gridData;

  
  

  // 收集所有格子的主导色 RGB
  const allColors = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = gridData[row] && gridData[row][col];
      if (cell && cell.originalRgb) {
        allColors.push({
          row,
          col,
          rgb: cell.originalRgb
        });
      }
    }
  }

  if (allColors.length === 0) return gridData;

  

  // 如果格子数量已经小于目标数量，不需要聚类
  if (allColors.length <= targetCount) {
    
    return gridData;
  }

  // K-means 聚类优化：只对唯一颜色进行聚类
  // 1. 收集唯一的 RGB 颜色，并统计每个唯一颜色的数量
  const colorCountMap = new Map();
  for (const c of allColors) {
    const key = `${c.rgb.r},${c.rgb.g},${c.rgb.b}`;
    if (!colorCountMap.has(key)) {
      colorCountMap.set(key, { rgb: c.rgb, count: 0 });
    }
    colorCountMap.get(key).count++;
  }

  const uniqueColors = Array.from(colorCountMap.values());
  

  // 如果唯一颜色数量已经小于等于目标，不需要聚类
  if (uniqueColors.length <= targetCount) {
    
    return gridData;
  }

  // 2. 简化：直接对唯一颜色进行聚类（减少计算量）
  // 使用加权采样选择初始中心
  const centers = [];
  const step = Math.max(1, Math.floor(uniqueColors.length / targetCount));
  for (let i = 0; i < targetCount && i * step < uniqueColors.length; i++) {
    centers.push({ ...uniqueColors[i * step].rgb });
  }

  // 确保至少有 targetCount 个中心
  while (centers.length < targetCount && centers.length < uniqueColors.length) {
    centers.push({ ...uniqueColors[centers.length].rgb });
  }

  

  // 3. 简化距离计算：使用曼哈顿距离（比欧氏距离快）
  const fastDistance = (c1, c2) => {
    return Math.abs(c1.r - c2.r) + Math.abs(c1.g - c2.g) + Math.abs(c1.b - c2.b);
  };

  // 4. 减少迭代次数
  const maxIterations = 5;
  let iterCount = 0;

  // 记录每次迭代的分配结果，用于最终映射
  let lastAssign = new Array(uniqueColors.length);
  let lastDist = new Array(uniqueColors.length);

  for (let iter = 0; iter < maxIterations; iter++) {
    iterCount++;
    // 分配每个唯一颜色到最近的中心
    const clusters = Array.from({ length: centers.length }, () => []);

    for (let ci = 0; ci < uniqueColors.length; ci++) {
      const colorInfo = uniqueColors[ci];
      const cr = colorInfo.rgb.r;
      const cg = colorInfo.rgb.g;
      const cb = colorInfo.rgb.b;

      let minDist = Infinity;
      let minIdx = 0;

      for (let i = 0; i < centers.length; i++) {
        const dist = Math.abs(centers[i].r - cr) + Math.abs(centers[i].g - cg) + Math.abs(centers[i].b - cb);
        if (dist < minDist) {
          minDist = dist;
          minIdx = i;
        }
      }

      lastAssign[ci] = minIdx;
      lastDist[ci] = minDist;
      clusters[minIdx].push(colorInfo);
    }

    // 更新中心（使用内联距离计算避免函数调用）
    let changed = false;
    for (let i = 0; i < centers.length; i++) {
      if (clusters[i].length === 0) continue;

      let sumR = 0, sumG = 0, sumB = 0;
      for (const c of clusters[i]) {
        sumR += c.rgb.r * c.count;
        sumG += c.rgb.g * c.count;
        sumB += c.rgb.b * c.count;
      }

      const totalWeight = clusters[i].reduce((sum, c) => sum + c.count, 0);
      const newCenter = {
        r: Math.round(sumR / totalWeight),
        g: Math.round(sumG / totalWeight),
        b: Math.round(sumB / totalWeight)
      };

      // 使用内联曼哈顿距离
      const dist = Math.abs(centers[i].r - newCenter.r) + Math.abs(centers[i].g - newCenter.g) + Math.abs(centers[i].b - newCenter.b);
      if (dist > 3) {
        centers[i] = newCenter;
        changed = true;
      }
    }

    if (!changed) break;
  }

  // 5. 为每个聚类中心找到最接近的 Mark 色号
  const centerMarkColors = centers.map(center => fastFindClosestMarkColor(center));

  

  // 6. 将每个唯一颜色映射到其所属聚类的 Mark 色号
  // 使用上次迭代的结果，避免重复计算
  const rgbToCenterIdx = new Map();

  for (let ci = 0; ci < uniqueColors.length; ci++) {
    const colorInfo = uniqueColors[ci];
    const key = (colorInfo.rgb.r << 16) | (colorInfo.rgb.g << 8) | colorInfo.rgb.b;
    rgbToCenterIdx.set(key, lastAssign[ci]);
  }

  // 7. 应用到所有格子
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = gridData[row] && gridData[row][col];
      if (!cell || !cell.originalRgb) continue;

      const key = (cell.originalRgb.r << 16) | (cell.originalRgb.g << 8) | cell.originalRgb.b;
      const centerIdx = rgbToCenterIdx.get(key);

      if (centerIdx !== undefined) {
        const markColor = centerMarkColors[centerIdx];
        cell.markCode = markColor.code;
        cell.markHex = markColor.hex;
        cell.markRgb = markColor.rgb;
      }
    }
  }

  // 统计实际使用的色号数量
  const usedCodes = new Set();
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = gridData[row] && gridData[row][col];
      if (cell && cell.markCode) {
        usedCodes.add(cell.markCode);
      }
    }
  }

  return gridData;
}

/**
 * 智能色块处理 - 保留黑色边界 + 区域合并
 * 适用于马赛克原图，识别色块并合并相近颜色
 */

/**
 * 智能处理图像 - 保留边界 + 区域合并
 * @param {Uint8ClampedArray} pixelData - 像素数据
 * @param {number} width - 图像宽度
 * @param {number} height - 图像高度
 * @param {number} gridSize - 网格大小
 * @param {object} options - 选项
 *   - mergeThreshold: 颜色相似度阈值 (10-50)，越小越严格
 *   - preserveBlack: 是否保留黑色边界，默认true
 *   - blackThreshold: 黑色判定阈值，默认50
 */
/**
 * 自动检测图像的色块大小
 * 扫描图像的多条水平线和垂直线（舍弃最外圈），记录颜色变化点
 * 计算相邻变化点之间的距离，取众数得到色块大小
 * @param {Uint8ClampedArray} pixelData - 像素数据
 * @param {number} width - 图像宽度
 * @param {number} height - 图像高度
 * @param {object} options - 选项
 *   - tolerance: 颜色相似度容差，默认25
 * @returns {object} 检测结果，包含色块大小和有效范围
 */
function autoDetectBlockSize(pixelData, width, height, options = {}) {
  const defaultTolerance = options.tolerance !== undefined ? options.tolerance : 25;
  try {
  // 辅助函数：获取像素颜色
  function getPixelColor(x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return null;
    const idx = (y * width + x) * 4;
    return { r: pixelData[idx], g: pixelData[idx + 1], b: pixelData[idx + 2] };
  }

  // 辅助函数：判断两个颜色是否相似（使用欧氏距离，更准确）
  // 容差越小，对颜色变化越敏感
  // 容差25：适合大多数马赛克图（包括有/无分界线）
  // 容差50：适合有明显黑色分界线的马赛克原图
  function isSameColor(c1, c2, tolerance = defaultTolerance) {
    if (!c1 || !c2) return false;
    const dist = Math.sqrt(
      Math.pow(c1.r - c2.r, 2) +
      Math.pow(c1.g - c2.g, 2) +
      Math.pow(c1.b - c2.b, 2)
    );
    return dist <= tolerance;
  }

  // 辅助函数：找中位数
  function findMedian(arr) {
    if (!arr || arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  // 辅助函数：找众数
  function findMode(arr) {
    if (!arr || arr.length === 0) return 0;
    const counts = {};
    let maxCount = 0;
    let mode = arr[0];
    for (const v of arr) {
      counts[v] = (counts[v] || 0) + 1;
      if (counts[v] > maxCount) {
        maxCount = counts[v];
        mode = v;
      }
    }
    return mode;
  }

  // 判断是否有分界线：采样检测是否有大量接近黑色的像素（分界线通常是黑色）
  let darkPixelCount = 0;
  let sampleCount = 0;
  for (let y = 0; y < Math.min(height, 50); y += 5) {
    for (let x = 0; x < Math.min(width, 100); x += 5) {
      const idx = (y * width + x) * 4;
      const r = pixelData[idx];
      const g = pixelData[idx + 1];
      const b = pixelData[idx + 2];
      // 检测接近黑色的像素（RGB都小于50）
      if (r < 50 && g < 50 && b < 50) {
        darkPixelCount++;
      }
      sampleCount++;
    }
  }
  const darkPixelRatio = sampleCount > 0 ? darkPixelCount / sampleCount : 0;
  // 如果有大量黑色像素，说明有分界线
  const hasGridLines = darkPixelRatio > 0.05; // 超过5%的黑色像素

  // 收集所有距离值和变化点数量
  const hDistances = [];
  const vDistances = [];
  const hChangesCounts = []; // 每条水平线的变化点数量
  const vChangesCounts = []; // 每条垂直线的变化点数量

  // 扫描多条水平线（扫描整行，从0到width-1）
  // 扫描15条水平线，提高检测准确性
  const hScanCount = 15;
  for (let i = 0; i < hScanCount; i++) {
    const y = Math.floor(height * i / (hScanCount - 1));
    const changes = [];

    // 从左到右扫描整行
    let prevColor = getPixelColor(0, y);
    for (let x = 1; x < width; x++) {
      const currColor = getPixelColor(x, y);
      if (!isSameColor(prevColor, currColor)) {
        changes.push(x);
        prevColor = currColor;
      }
    }

    // 记录变化点数量（用于计算网格数）
    hChangesCounts.push(changes.length);

    // 计算相邻变化点之间的距离
    for (let i = 1; i < changes.length; i++) {
      const dist = changes[i] - changes[i - 1];
      // 扩大范围以适应不同大小的格子（3-50像素）
      if (dist >= 3 && dist <= 50) {
        hDistances.push(dist);
      }
    }
  }

  // 扫描多条垂直线（扫描整列，从0到height-1）
  const vScanCount = 15;
  for (let i = 0; i < vScanCount; i++) {
    const x = Math.floor(width * i / (vScanCount - 1));
    const changes = [];

    // 从上到下扫描整列
    let prevColor = getPixelColor(x, 0);
    for (let y = 1; y < height; y++) {
      const currColor = getPixelColor(x, y);
      if (!isSameColor(prevColor, currColor)) {
        changes.push(y);
        prevColor = currColor;
      }
    }

    // 记录变化点数量
    vChangesCounts.push(changes.length);

    // 计算相邻变化点之间的距离
    for (let i = 1; i < changes.length; i++) {
      const dist = changes[i] - changes[i - 1];
      // 扩大范围以适应不同大小的格子（3-50像素）
      if (dist >= 3 && dist <= 50) {
        vDistances.push(dist);
      }
    }
  }

  // 取众数作为色块大小
  const hMode = findMode(hDistances) || 10;
  const vMode = findMode(vDistances) || 10;

  // 限制色块大小在合理范围（5-30像素）
  // 限制色块大小在合理范围（8-30像素）
  const primarySize = Math.max(8, Math.min(30, Math.round((hMode + vMode) / 2)));

  // 网格数 = 变化点数量 + 1（直接数出来！）
  // 取多条扫描线的中位数并取整
  let hColsMode = Math.floor(findMedian(hChangesCounts)) || 100;
  let vRowsMode = Math.floor(findMedian(vChangesCounts)) || 100;

  const cols = hColsMode + 1;
  const rows = vRowsMode + 1;

  // 有效范围：整张图
  const validStartX = 0;
  const validStartY = 0;
  const validEndX = width;
  const validEndY = height;

  const validWidth = validEndX - validStartX;
  const validHeight = validEndY - validStartY;

  return {
    primarySize: primarySize,
    secondarySize: null,
    // 原始检测值
    rawBlockSize: (hMode + vMode) / 2,
    hMode,
    vMode,
    hColsMode,
    vRowsMode,
    hasGridLines,
    validRange: {
      startX: validStartX,
      endX: validEndX,
      startY: validStartY,
      endY: validEndY,
      width: validWidth,
      height: validHeight,
      cols,
      rows
    },
    debug: {
      hDistancesCount: hDistances.length,
      vDistancesCount: vDistances.length,
      hChangesCounts,
      vChangesCounts,
      hMode,
      vMode,
      hColsMode,
      vRowsMode,
      cols: cols,
      rows: rows
    }
  };
  } catch (e) {
    // 返回默认值
    return {
      primarySize: 10,
      secondarySize: null,
      rawBlockSize: 10,
      hMode: 10,
      vMode: 10,
      hColsMode: 136,
      vRowsMode: 148,
      hasGridLines: false,
      validRange: {
        startX: 0,
        endX: width,
        startY: 0,
        endY: height,
        width: width,
        height: height,
        cols: 136,
        rows: 148
      },
      debug: {}
    };
  }
}

/**
 * 从网格数据中检测边缘底色
 * 基于马赛克化后的网格数据进行检测，避免网格线干扰
 * @param {Array} gridData - 马赛克网格数据
 * @param {number} rows - 行数
 * @param {number} cols - 列数
 * @param {number} gridSize - 网格大小
 * @param {number} threshold - 颜色占比阈值，默认50%
 * @returns {object} 边缘底色信息 { edgeColor: {r,g,b}, hasEdge: boolean }
 */
function detectEdgeColorFromGrid(gridData, rows, cols, gridSize, threshold = 50) {
  // 统计边缘格子颜色
  const countEdgeCellColor = (isHorizontal, isStart) => {
    const colorCounts = {};
    let total = 0;

    // 扫描边缘的格子
    const edgeCount = isHorizontal ? cols : rows;
    const scanCount = isHorizontal ? Math.min(3, rows) : Math.min(3, cols);

    for (let i = 0; i < edgeCount; i++) {
      const row = isHorizontal ? (isStart ? i : rows - 1 - i) : i;
      const col = isHorizontal ? i : (isStart ? i : cols - 1 - i);

      // 扫描边缘附近的几个格子
      for (let j = 0; j < scanCount; j++) {
        const scanRow = isHorizontal ? (isStart ? j : rows - 1 - j) : row;
        const scanCol = isHorizontal ? col : (isStart ? j : cols - 1 - j);

        if (scanRow >= 0 && scanRow < rows && scanCol >= 0 && scanCol < cols) {
          const cell = gridData[scanRow] && gridData[scanRow][scanCol];
          if (cell && cell.originalRgb) {
            const color = cell.originalRgb;
            const key = `${color.r},${color.g},${color.b}`;
            colorCounts[key] = (colorCounts[key] || 0) + 1;
            total++;
          }
        }
      }
    }

    // 找最常见的颜色
    let maxCount = 0;
    let dominantColor = null;
    for (const key in colorCounts) {
      const count = colorCounts[key];
      if (count > maxCount) {
        maxCount = count;
        const [r, g, b] = key.split(',').map(Number);
        dominantColor = { r, g, b };
      }
    }

    const ratio = total > 0 ? (maxCount / total) * 100 : 0;
    return { color: dominantColor, ratio };
  };

  // 扫描四边
  const top = countEdgeCellColor(true, true);
  const bottom = countEdgeCellColor(true, false);
  const left = countEdgeCellColor(false, true);
  const right = countEdgeCellColor(false, false);

  const edges = [
    { name: 'top', data: top },
    { name: 'bottom', data: bottom },
    { name: 'left', data: left },
    { name: 'right', data: right }
  ];

  // 优先选择超过阈值的边缘
  const validEdges = edges.filter(e => e.data.ratio >= threshold && e.data.color);
  if (validEdges.length === 0) {
    return { edgeColor: null, hasEdge: false };
  }

  // 选择比例最高的
  validEdges.sort((a, b) => b.data.ratio - a.data.ratio);
  const bestEdge = validEdges[0];

  return {
    edgeColor: bestEdge.data.color,
    hasEdge: true,
    edgeRatios: {
      top: top.ratio,
      bottom: bottom.ratio,
      left: left.ratio,
      right: right.ratio
    }
  };
}

/**
 * 基于 segments 检测边缘底色（用于马赛克模式）
 * @param {Array} segments - 色块数组
 * @param {number} cols - 列数
 * @param {number} rows - 行数
 * @param {number} threshold - 颜色占比阈值，默认50%
 * @returns {object} 边缘底色信息 { edgeColor: {r,g,b}, hasEdge: boolean }
 */
function detectEdgeColorFromSegments(segments, cols, rows, threshold = 50) {
  if (!segments || segments.length === 0) {
    return { edgeColor: null, hasEdge: false };
  }

  // 统计边缘 segment 的颜色
  const countEdgeSegmentColor = (isHorizontal, isStart) => {
    const colorCounts = {};
    let total = 0;

    // 收集边缘的 segments
    for (const seg of segments) {
      if (seg.col === undefined || seg.row === undefined) continue;

      const isEdge = isHorizontal
        ? (isStart ? seg.row < 2 : seg.row >= rows - 2)
        : (isStart ? seg.col < 2 : seg.col >= cols - 2);

      if (isEdge && seg.avgColor) {
        const color = seg.avgColor;
        const key = `${Math.round(color.r / 8) * 8},${Math.round(color.g / 8) * 8},${Math.round(color.b / 8) * 8}`;
        colorCounts[key] = (colorCounts[key] || 0) + 1;
        total++;
      }
    }

    // 找最常见的颜色
    let maxCount = 0;
    let dominantColor = null;
    for (const key in colorCounts) {
      const count = colorCounts[key];
      if (count > maxCount) {
        maxCount = count;
        const [r, g, b] = key.split(',').map(Number);
        dominantColor = { r, g, b };
      }
    }

    const ratio = total > 0 ? (maxCount / total) * 100 : 0;
    return { color: dominantColor, ratio };
  };

  // 扫描四边
  const top = countEdgeSegmentColor(true, true);
  const bottom = countEdgeSegmentColor(true, false);
  const left = countEdgeSegmentColor(false, true);
  const right = countEdgeSegmentColor(false, false);

  const edges = [
    { name: 'top', data: top },
    { name: 'bottom', data: bottom },
    { name: 'left', data: left },
    { name: 'right', data: right }
  ];

  // 优先选择超过阈值的边缘
  const validEdges = edges.filter(e => e.data.ratio >= threshold && e.data.color);
  if (validEdges.length === 0) {
    return { edgeColor: null, hasEdge: false };
  }

  // 选择比例最高的
  validEdges.sort((a, b) => b.data.ratio - a.data.ratio);
  const bestEdge = validEdges[0];

  return {
    edgeColor: bestEdge.data.color,
    hasEdge: true,
    edgeRatios: {
      top: top.ratio,
      bottom: bottom.ratio,
      left: left.ratio,
      right: right.ratio
    }
  };
}

/**
 * 裁剪 segments 并标记边缘色块（用于马赛克模式）
 * @param {Array} segments - 色块数组
 * @param {number} cols - 列数
 * @param {number} rows - 行数
 * @param {object} edgeColor - 边缘底色
 * @param {number} diffThreshold - 颜色差异阈值，默认25
 * @returns {object} 裁剪后的结果 { segments, cols, rows, cropped: boolean }
 */
function filterEdgeSegments(segments, cols, rows, edgeColor, diffThreshold = 25) {
  if (!segments || !edgeColor) {
    return { segments, cols, rows, cropped: false, marked: false };
  }

  // 将 segments 转换为 2D 数组
  const segGrid = [];
  for (let r = 0; r < rows; r++) {
    segGrid[r] = [];
    for (let c = 0; c < cols; c++) {
      segGrid[r][c] = null;
    }
  }

  for (const seg of segments) {
    if (seg.col !== undefined && seg.row !== undefined) {
      segGrid[seg.row][seg.col] = seg;
    }
  }

  // 使用连通性判断：只有通过边缘颜色连接到图片边缘的 segments 才标记为 isEdge
  // 1. 找出所有在边缘上且与边缘颜色相同的 segments 作为起点
  // 2. 使用 BFS 找到所有连通的与边缘颜色相同的 segments
  // 3. 只有这些连通的 segments 才标记为 isEdge

  // 创建访问标记数组
  const visited = [];
  for (let r = 0; r < rows; r++) {
    visited[r] = [];
    for (let c = 0; c < cols; c++) {
      visited[r][c] = false;
    }
  }

  // BFS 队列
  const queue = [];

  // 将所有边缘上与边缘颜色相同的 segments 加入队列
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // 只检查边缘行和列
      if (row !== 0 && row !== rows - 1 && col !== 0 && col !== cols - 1) continue;

      const seg = segGrid[row] && segGrid[row][col];
      if (!seg || !seg.avgColor) continue;

      const isSameAsEdge = colorDistance(seg.avgColor, edgeColor) <= diffThreshold;

      if (isSameAsEdge && !visited[row][col]) {
        visited[row][col] = true;
        queue.push({ row, col });
      }
    }
  }

  // BFS 遍历所有连通的与边缘颜色相同的 segments
  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  while (queue.length > 0) {
    const { row, col } = queue.shift();

    for (const [dr, dc] of directions) {
      const newRow = row + dr;
      const newCol = col + dc;

      if (newRow < 0 || newRow >= rows || newCol < 0 || newCol >= cols) continue;
      if (visited[newRow][newCol]) continue;

      const seg = segGrid[newRow] && segGrid[newRow][newCol];
      if (!seg || !seg.avgColor) continue;

      const isSameAsEdge = colorDistance(seg.avgColor, edgeColor) <= diffThreshold;

      if (isSameAsEdge) {
        visited[newRow][newCol] = true;
        queue.push({ row: newRow, col: newCol });
      }
    }
  }

  // 标记所有连通的 segments 为 isEdge
  let hasMarked = false;
  for (const seg of segments) {
    if (seg.row !== undefined && seg.col !== undefined) {
      seg.isEdge = visited[seg.row][seg.col];
      if (seg.isEdge) hasMarked = true;
    }
  }

  return { segments, cols, rows, cropped: false, marked: hasMarked };
}

/**
 * 标记边缘底色色块
 * @param {Array} gridData - 马赛克网格数据
 * @param {number} rows - 行数
 * @param {number} cols - 列数
 * @param {number} gridSize - 网格大小
 * @param {object} edgeColor - 边缘底色 {r,g,b}
 * @param {object} boundary - 裁剪边界 { top, bottom, left, right }
 * @param {number} diffThreshold - 颜色差异阈值
 * @returns {object} 裁剪后的结果 { gridData, rows, cols, cropped: boolean }
 */
function filterEdgeBlocks(gridData, rows, cols, gridSize, edgeColor, boundary, diffThreshold = 25) {
  if (!edgeColor || !boundary || !boundary.hasEdge) {
    return { gridData, rows, cols, cropped: false };
  }

  // 检查是否有完整的边界坐标
  const hasBoundaryCoords = boundary.top !== undefined && boundary.bottom !== undefined &&
                            boundary.left !== undefined && boundary.right !== undefined;

  if (!hasBoundaryCoords) {
    // 没有边界坐标，使用简化逻辑：标记外层格子
    const outerRing = 2; // 检查外圈2层
    let minCol = cols, maxCol = 0, minRow = rows, maxRow = 0;

    // 第一遍：找出主体内容范围
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = gridData[row] && gridData[row][col];
        if (!cell || !cell.originalRgb) continue;

        const isInOuterRing = row < outerRing || row >= rows - outerRing ||
                              col < outerRing || col >= cols - outerRing;

        if (!isInOuterRing) {
          // 这可能是主体内容
          const color = cell.originalRgb;
          const isSameAsEdge = colorDistance(color, edgeColor) <= diffThreshold;
          if (!isSameAsEdge) {
            minCol = Math.min(minCol, col);
            maxCol = Math.max(maxCol, col);
            minRow = Math.min(minRow, row);
            maxRow = Math.max(maxRow, row);
          }
        }
      }
    }

    // 如果没有找到主体内容，不处理
    if (minCol > maxCol || minRow > maxRow) {
      return { gridData, rows, cols, cropped: false };
    }

    // 不裁剪，只标记边缘格子
    // 使用连通性判断：只有通过边缘颜色连接到图片边缘的格子才不显示色号
    // 创建访问标记数组
    const visited = [];
    for (let r = 0; r < rows; r++) {
      visited[r] = [];
      for (let c = 0; c < cols; c++) {
        visited[r][c] = false;
      }
    }

    // BFS 队列
    const queue = [];

    // 将所有边缘上与边缘颜色相同的格子加入队列
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // 只检查边缘行和列
        if (row !== 0 && row !== rows - 1 && col !== 0 && col !== cols - 1) continue;

        const cell = gridData[row] && gridData[row][col];
        if (!cell || !cell.originalRgb) continue;

        const color = cell.originalRgb;
        const isSameAsEdge = colorDistance(color, edgeColor) <= diffThreshold;

        if (isSameAsEdge && !visited[row][col]) {
          visited[row][col] = true;
          queue.push({ row, col });
        }
      }
    }

    // BFS 遍历所有连通的与边缘颜色相同的格子
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    while (queue.length > 0) {
      const { row, col } = queue.shift();

      for (const [dr, dc] of directions) {
        const newRow = row + dr;
        const newCol = col + dc;

        if (newRow < 0 || newRow >= rows || newCol < 0 || newCol >= cols) continue;
        if (visited[newRow][newCol]) continue;

        const cell = gridData[newRow] && gridData[newRow][newCol];
        if (!cell || !cell.originalRgb) continue;

        const color = cell.originalRgb;
        const isSameAsEdge = colorDistance(color, edgeColor) <= diffThreshold;

        if (isSameAsEdge) {
          visited[newRow][newCol] = true;
          queue.push({ row: newRow, col: newCol });
        }
      }
    }

    // 标记所有连通的格子为 isEdge
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = gridData[row] && gridData[row][col];
        if (!cell) continue;

        gridData[row][col].isEdge = visited[row][col];
      }
    }

    return { gridData, rows, cols, cropped: false, marked: true };
  }

  // 有边界坐标（卡通模式），使用完整逻辑
  // 不裁剪，只标记边缘格子
  // 使用连通性判断：只有通过边缘颜色连接到图片边缘的格子才不显示色号
  // 1. 找出所有在边缘上且与边缘颜色相同的格子作为起点
  // 2. 使用 BFS 找到所有连通的与边缘颜色相同的格子
  // 3. 只有这些连通的格子才标记为 isEdge

  // 创建访问标记数组
  const visited = [];
  for (let r = 0; r < rows; r++) {
    visited[r] = [];
    for (let c = 0; c < cols; c++) {
      visited[r][c] = false;
    }
  }

  // BFS 队列
  const queue = [];

  // 2. 将所有边缘上与边缘颜色相同的格子加入队列
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // 只检查边缘行和列
      if (row !== 0 && row !== rows - 1 && col !== 0 && col !== cols - 1) continue;

      const cell = gridData[row] && gridData[row][col];
      if (!cell || !cell.originalRgb) continue;

      const color = cell.originalRgb;
      const isSameAsEdge = colorDistance(color, edgeColor) <= diffThreshold;

      if (isSameAsEdge && !visited[row][col]) {
        visited[row][col] = true;
        queue.push({ row, col });
      }
    }
  }

  // 3. BFS 遍历所有连通的与边缘颜色相同的格子
  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // 上下左右
  while (queue.length > 0) {
    const { row, col } = queue.shift();

    for (const [dr, dc] of directions) {
      const newRow = row + dr;
      const newCol = col + dc;

      // 检查边界
      if (newRow < 0 || newRow >= rows || newCol < 0 || newCol >= cols) continue;
      if (visited[newRow][newCol]) continue;

      const cell = gridData[newRow] && gridData[newRow][newCol];
      if (!cell || !cell.originalRgb) continue;

      const color = cell.originalRgb;
      const isSameAsEdge = colorDistance(color, edgeColor) <= diffThreshold;

      if (isSameAsEdge) {
        visited[newRow][newCol] = true;
        queue.push({ row: newRow, col: newCol });
      }
    }
  }

  // 4. 标记所有连通的格子为 isEdge
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = gridData[row] && gridData[row][col];
      if (!cell) continue;

      gridData[row][col].isEdge = visited[row][col];
    }
  }

  return { gridData, rows, cols, cropped: false, marked: true };
}

/**
 * 从 isEdge 标记查找主体内容的边界
 * 从四边向中心扫描，找到第一行/列包含非 isEdge 格子位置
 * @param {Array} gridData - 网格数据 2D 数组
 * @param {number} rows - 行数
 * @param {number} cols - 列数
 * @returns {object} 主体边界 { top, bottom, left, right, hasContent }
 */
function findCropBoundaryFromGrid(gridData, rows, cols) {
  // 1. 从上往下扫描，找到第一行包含非 isEdge 格子
  let top = -1;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = gridData[row] && gridData[row][col];
      if (cell && !cell.isEdge) {
        top = row;
        break;
      }
    }
    if (top >= 0) break;
  }

  // 2. 从下往上扫描，找到最后一行包含非 isEdge 格子
  let bottom = -1;
  for (let row = rows - 1; row >= 0; row--) {
    for (let col = 0; col < cols; col++) {
      const cell = gridData[row] && gridData[row][col];
      if (cell && !cell.isEdge) {
        bottom = row;
        break;
      }
    }
    if (bottom >= 0) break;
  }

  // 3. 从左往右扫描，找到第一列包含非 isEdge 格子
  let left = -1;
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const cell = gridData[row] && gridData[row][col];
      if (cell && !cell.isEdge) {
        left = col;
        break;
      }
    }
    if (left >= 0) break;
  }

  // 4. 从右往左扫描，找到最后一列包含非 isEdge 格子
  let right = -1;
  for (let col = cols - 1; col >= 0; col--) {
    for (let row = 0; row < rows; row++) {
      const cell = gridData[row] && gridData[row][col];
      if (cell && !cell.isEdge) {
        right = col;
        break;
      }
    }
    if (right >= 0) break;
  }

  // 检查是否找到主体内容
  if (top < 0 || bottom < 0 || left < 0 || right < 0) {
    return { top: 0, bottom: rows, left: 0, right: cols, hasContent: false };
  }

  // 确保边界有效
  if (top > bottom || left > right) {
    return { top: 0, bottom: rows, left: 0, right: cols, hasContent: false };
  }

  // 返回裁剪边界（+1 是因为 bottom 和 right 是闭区间）
  return { top, bottom: bottom + 1, left, right: right + 1, hasContent: true };
}

/**
 * 裁剪马赛克数据
 * @param {object} mosaicData - 马赛克数据 { gridData, rows, cols, gridSize }
 * @param {object} boundary - 裁剪边界 { top, bottom, left, right, hasContent }
 * @returns {object} 裁剪后的马赛克数据
 */
function cropMosaicData(mosaicData, boundary) {
  if (!boundary.hasContent) {
    return mosaicData;
  }

  const { gridData, rows, cols, gridSize } = mosaicData;
  const { top, bottom, left, right } = boundary;

  // 判断 boundary 是像素坐标还是单元格索引
  // 如果 right <= cols 且 bottom <= rows，说明是单元格索引
  // 注意：right = cols 表示第 cols 列（最后一列+1），也是有效的单元格索引
  const isCellIndex = right <= cols && bottom <= rows;

  let cropCols, cropRows, startCol, startRow;

  if (isCellIndex) {
    // 单元格索引（来自 findCropBoundaryFromGrid）
    startCol = left;
    startRow = top;
    cropCols = right - left;
    cropRows = bottom - top;
  } else {
    // 像素坐标（原有逻辑）
    cropCols = Math.ceil(right / gridSize) - Math.floor(left / gridSize);
    cropRows = Math.ceil(bottom / gridSize) - Math.floor(top / gridSize);
    startCol = Math.floor(left / gridSize);
    startRow = Math.floor(top / gridSize);
  }

  // 边界检查
  if (startCol < 0) startCol = 0;
  if (startRow < 0) startRow = 0;
  if (cropCols <= 0 || cropRows <= 0) {
    return mosaicData;
  }

  const newGridData = [];

  for (let row = 0; row < cropRows; row++) {
    newGridData[row] = [];
    for (let col = 0; col < cropCols; col++) {
      const srcRow = startRow + row;
      const srcCol = startCol + col;

      if (gridData[srcRow] && gridData[srcRow][srcCol]) {
        const cell = { ...gridData[srcRow][srcCol] };
        // 更新坐标为裁剪后的位置
        cell.x = col * gridSize;
        cell.y = row * gridSize;
        // 更新行列索引
        cell.col = col;
        cell.row = row;
        newGridData[row][col] = cell;
      }
    }
  }

  return {
    gridData: newGridData,
    rows: cropRows,
    cols: cropCols,
    gridSize,
    originalBoundary: boundary
  };
}

/**
 * 智能处理图像 - 网格化 + 主导色识别
 * 使用网格划分图像，每个网格识别主导色
 * 智能判断是否为纯色区域，不过滤黑色（保留原色）
 * @param {Uint8ClampedArray} pixelData - 像素数据
 * @param {number} width - 图像宽度
 * @param {number} height - 图像高度
 * @param {number} gridSize - 网格大小
 */
function processWithSmartRegions(pixelData, width, height, gridSize) {

  // 导入颜色查找函数

  // 如果没有像素数据，返回空结果
  if (!pixelData || pixelData.length === 0) {
    return {
      segments: [],
      segmentCount: 0,
      gridData: [],
      cols: 1,
      rows: 1,
      gridSize: 1,
      width,
      height
    };
  }

  // 自动检测色块大小和有效范围
  const { primarySize, hasGridLines, validRange } = autoDetectBlockSize(pixelData, width, height);
  const actualGridSize = primarySize || gridSize; // 使用检测值或回退到预设值


  // 根据是否有分界线选择不同的计算方法
  let cols, rows;
  if (hasGridLines) {
    // 有分界线：使用扫描线算法检测到的格子数量
    cols = validRange.cols;
    rows = validRange.rows;
  } else {
    // 无分界线：直接用格子大小除图像尺寸
    cols = Math.ceil(width / actualGridSize);
    rows = Math.ceil(height / actualGridSize);
  }

  // 使用检测到的有效范围
  const startX = validRange.startX;
  const startY = validRange.startY;


  // 大区检测暂时禁用，等采样方法稳定后再启用
  let largeRegionSize = null;

  // 获取指定像素的颜色
  function getPixelColor(x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return null;
    const idx = (y * width + x) * 4;
    return {
      r: pixelData[idx],
      g: pixelData[idx + 1],
      b: pixelData[idx + 2]
    };
  }

  // 存储色块数据
  const segments = [];
  let segmentId = 0;

  // 遍历每个网格（从有效范围开始）
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // 计算网格在原图上的位置（使用有效范围偏移）
      const cellStartX = startX + col * actualGridSize;
      const cellStartY = startY + row * actualGridSize;
      const endX = Math.min(cellStartX + actualGridSize, startX + cols * actualGridSize);
      const endY = Math.min(cellStartY + actualGridSize, startY + rows * actualGridSize);

      // 边界检查
      if (cellStartX >= width || cellStartY >= height) {
        continue;
      }

      // 收集网格内所有像素的颜色
      const colors = [];
      let totalCount = 0;

      for (let y = cellStartY; y < endY; y++) {
        for (let x = cellStartX; x < endX; x++) {
          const color = getPixelColor(x, y);
          if (color) {
            colors.push(color);
            totalCount++;
          }
        }
      }

      // 如果没有有效颜色，使用默认灰色
      if (colors.length === 0) {
      let markColor = fastFindClosestMarkColor({ r: 128, g: 128, b: 128 });
        if (!markColor || !markColor.code) {
          markColor = { code: 'M001', hex: '#CCCCCC', rgb: { r: 204, g: 204, b: 204 } };
        }
        segments.push({
          id: segmentId++,
          x: cellStartX,
          y: cellStartY,
          width: endX - cellStartX,
          height: endY - cellStartY,
          col: col,
          row: row,
          avgColor: { r: 128, g: 128, b: 128 },
          markCode: markColor.code,
          markHex: markColor.hex,
          markRgb: markColor.rgb
        });
        continue;
      }

      // 计算平均颜色
      let sumR = 0, sumG = 0, sumB = 0;
      for (const c of colors) {
        sumR += c.r;
        sumG += c.g;
        sumB += c.b;
      }

      const avgColor = {
        r: Math.round(sumR / colors.length),
        g: Math.round(sumG / colors.length),
        b: Math.round(sumB / colors.length)
      };

      // 判断是否为纯色区域（计算颜色方差）
      let maxDist = 0;
      for (const c of colors) {
        const dist = colorDistance(c, avgColor);
        if (dist > maxDist) maxDist = dist;
      }

      // 如果颜色变化太大，可能是混合区域，使用主导色
      let finalColor = avgColor;
      if (maxDist > 30) {
        // 找到主导色（出现最多的颜色）
        const colorCount = {};
        for (const c of colors) {
          // 将颜色量化到 16 级，减少噪声
          const key = `${Math.round(c.r / 16) * 16},${Math.round(c.g / 16) * 16},${Math.round(c.b / 16) * 16}`;
          colorCount[key] = (colorCount[key] || 0) + 1;
        }

        // 找到出现最多的颜色
        let maxCount = 0;
        for (const key in colorCount) {
          if (colorCount[key] > maxCount) {
            maxCount = colorCount[key];
            const [r, g, b] = key.split(',').map(Number);
            finalColor = { r, g, b };
          }
        }
      }

      // 映射到 MARD 色号
        let markColor = fastFindClosestMarkColor(finalColor);
      // 防御：如果找不到颜色，使用默认值
      if (!markColor || !markColor.code) {
        markColor = { code: 'M001', hex: '#CCCCCC', rgb: { r: 204, g: 204, b: 204 } };
      }

      segments.push({
        id: segmentId++,
        x: cellStartX,
        y: cellStartY,
        width: endX - cellStartX,
        height: endY - cellStartY,
        col: col,
        row: row,
        avgColor: finalColor,
        markCode: markColor.code,
        markHex: markColor.hex,
        markRgb: markColor.rgb
      });
    }
  }

  // 返回网格化的色块数据
  return {
    segments: segments,
    segmentCount: segments.length,
    // 兼容旧代码
    gridData: [],
    cols: cols,
    rows: rows,
    gridSize: actualGridSize,
    // 双层分界线检测结果
    detectedBlockSize: primarySize, // 小色块大小
    largeRegionSize: largeRegionSize, // 8*8 或 10*10 的大区尺寸
    hasLargeRegions: false,
    width,
    height
  };
}

/**
 * 将 segments 数组转换为 2D 网格 gridData
 * 用于马赛克模式复用卡通模式的渲染代码
 * @param {Array} segments - 色段数组
 * @param {number} cols - 列数
 * @param {number} rows - 行数
 * @returns {Array} 2D 网格数据
 */
function convertSegmentsToGridData(segments, cols, rows) {
  // 创建空的 2D 网格
  const gridData = [];
  for (let r = 0; r < rows; r++) {
    gridData[r] = [];
    for (let c = 0; c < cols; c++) {
      gridData[r][c] = null;
    }
  }

  // 将 segments 转换为 gridData
  for (const seg of segments) {
    if (seg.col !== undefined && seg.row !== undefined) {
      const col = seg.col;
      const row = seg.row;

      if (row >= 0 && row < rows && col >= 0 && col < cols) {
        gridData[row][col] = {
          x: seg.x,
          y: seg.y,
          width: seg.width,
          height: seg.height,
          col: col,
          row: row,
          rawRgb: seg.avgColor,
          originalRgb: seg.avgColor,
          markCode: seg.markCode,
          markHex: seg.markHex,
          markRgb: seg.markRgb,
          isEdge: seg.isEdge || false
        };
      }
    }
  }

  return gridData;
}

/**
 * 鲜艳度增强：饱和度 + 亮度 + 对比度 组合调整
 * @param {Object} rgb - RGB颜色对象 {r, g, b}
 * @param {number} scale - 增强强度 0-1
 * @returns {Object} 增强后的RGB颜色对象 {r, g, b}
 */
function enhanceVibrant(rgb, scale) {
  if (!rgb || scale <= 0) return rgb;

  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  // RGB 转 HSV
  let h = 0, s = max === 0 ? 0 : d / max, v = max;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  // 增强饱和度 (+10% 到 +50%)
  s = Math.min(1, s * (1 + scale * 0.5));
  // 增强亮度 (+5% 到 +25%)
  v = Math.min(1, v * (1 + scale * 0.2));

  // HSV 转 RGB
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let rn, gn, bn;

  switch (i % 6) {
    case 0: rn = v; gn = t; bn = p; break;
    case 1: rn = q; gn = v; bn = p; break;
    case 2: rn = p; gn = v; bn = t; break;
    case 3: rn = p; gn = q; bn = v; break;
    case 4: rn = t; gn = p; bn = v; break;
    case 5: rn = v; gn = p; bn = q; break;
  }

  // 对比度增强
  const contrast = 1.0 + scale * 0.5; // 1.0 到 1.5
  return {
    r: Math.max(0, Math.min(255, Math.round(128 + (rn * 255 - 128) * contrast))),
    g: Math.max(0, Math.min(255, Math.round(128 + (gn * 255 - 128) * contrast))),
    b: Math.max(0, Math.min(255, Math.round(128 + (bn * 255 - 128) * contrast)))
  };
}

// enhanceVibrant 缓存
const enhanceCache = new Map();
const ENHANCE_CACHE_MAX = 4096;

function cachedEnhanceVibrant(rgb, scale) {
  if (!rgb || scale <= 0) return rgb;

  // 使用量化的 rgb 作为缓存键（number 类型）
  const rq = Math.floor(rgb.r / 4);
  const gq = Math.floor(rgb.g / 4);
  const bq = Math.floor(rgb.b / 4);
  const cacheKey = (rq << 12) | (gq << 6) | bq | (Math.floor(scale * 100) << 18);
  if (enhanceCache.has(cacheKey)) {
    return enhanceCache.get(cacheKey);
  }

  const result = enhanceVibrant(rgb, scale);
  if (enhanceCache.size < ENHANCE_CACHE_MAX) {
    enhanceCache.set(cacheKey, result);
  }
  return result;
}

// 降低鲜艳度（让颜色更灰/暗淡）
function reduceVibrant(rgb, scale) {
  if (!rgb) return rgb;

  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  // RGB 转 HSV
  let h = 0, s = max === 0 ? 0 : d / max, v = max;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  // 降低饱和度
  s = Math.max(0, s * (1 - scale * 0.5));
  // 略微降低亮度
  v = Math.max(0, v * (1 - scale * 0.2));

  // HSV 转 RGB
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let rn, gn, bn;

  switch (i % 6) {
    case 0: rn = v; gn = t; bn = p; break;
    case 1: rn = q; gn = v; bn = p; break;
    case 2: rn = p; gn = v; bn = t; break;
    case 3: rn = p; gn = q; bn = v; break;
    case 4: rn = t; gn = p; bn = v; break;
    case 5: rn = v; gn = p; bn = q; break;
  }

  // 对比度降低
  const contrast = 1.0 - scale * 0.3; // 1.0 到 0.7
  return {
    r: Math.max(0, Math.min(255, Math.round(128 + (rn * 255 - 128) * contrast))),
    g: Math.max(0, Math.min(255, Math.round(128 + (gn * 255 - 128) * contrast))),
    b: Math.max(0, Math.min(255, Math.round(128 + (bn * 255 - 128) * contrast)))
  };
}

// reduceVibrant 缓存
const reduceCache = new Map();
const REDUCE_CACHE_MAX = 4096;

function cachedReduceVibrant(rgb, scale) {
  if (!rgb || scale <= 0) return rgb;

  // 使用量化的 rgb 作为缓存键（number 类型）
  const rq = Math.floor(rgb.r / 4);
  const gq = Math.floor(rgb.g / 4);
  const bq = Math.floor(rgb.b / 4);
  const cacheKey = (rq << 12) | (gq << 6) | bq | (Math.floor(scale * 100) << 18);
  if (reduceCache.has(cacheKey)) {
    return reduceCache.get(cacheKey);
  }

  const result = reduceVibrant(rgb, scale);
  if (reduceCache.size < REDUCE_CACHE_MAX) {
    reduceCache.set(cacheKey, result);
  }
  return result;
}

module.exports = {
  processSimple,
  processWithSmartRegions,
  colorDistance,
  detectEdgeColorFromGrid,
  detectEdgeColorFromSegments,
  filterEdgeSegments,
  filterEdgeBlocks,
  cropMosaicData,
  findCropBoundaryFromGrid,
  convertSegmentsToGridData,
  aggregateSimilarColors,
  enhanceVibrant: cachedEnhanceVibrant,
  reduceVibrant: cachedReduceVibrant
};
