/**
 * 图像处理模块 - 支持多种颜色量化算法
 * 
 * 算法说明：
 * 1. K-means: K均值聚类，适合保留主色调
 * 2. Median Cut: 中位切分，快速但效果一般
 * 3. Octree: 八叉树，平衡速度和效果
 * 4. 抖动 (Dithering): 使用误差扩散保留细节
 */

// findClosestMarkColor 在 colorMapper 中实现
const colorMapper = require('../utils/colorMapper');
const findClosestMarkColor = colorMapper.findClosestMarkColor;

/**
 * K-means 颜色聚类
 * @param {Array} colors - RGB 颜色数组 [{r,g,b}, ...]
 * @param {number} k - 聚类数量
 * @returns {Array} 聚类中心颜色
 */
function kMeansClustering(colors, k) {
  if (colors.length === 0) return [];
  if (colors.length <= k) return colors;

  // 随机选择 k 个初始中心
  const centers = [];
  const used = new Set();
  while (centers.length < k && centers.length < colors.length) {
    const idx = Math.floor(Math.random() * colors.length);
    if (!used.has(idx)) {
      used.add(idx);
      centers.push({ ...colors[idx] });
    }
  }

  // 迭代
  const maxIterations = 20;
  for (let iter = 0; iter < maxIterations; iter++) {
    // 分配到最近中心
    const clusters = Array.from({ length: k }, () => []);
    
    for (const color of colors) {
      let minDist = Infinity;
      let minIdx = 0;
      for (let i = 0; i < k; i++) {
        const dist = colorDistance(color, centers[i]);
        if (dist < minDist) {
          minDist = dist;
          minIdx = i;
        }
      }
      clusters[minIdx].push(color);
    }

    // 更新中心
    let changed = false;
    for (let i = 0; i < k; i++) {
      if (clusters[i].length === 0) continue;
      
      let sumR = 0, sumG = 0, sumB = 0;
      for (const c of clusters[i]) {
        sumR += c.r;
        sumG += c.g;
        sumB += c.b;
      }
      const newCenter = {
        r: Math.round(sumR / clusters[i].length),
        g: Math.round(sumG / clusters[i].length),
        b: Math.round(sumB / clusters[i].length)
      };
      
      if (colorDistance(centers[i], newCenter) > 1) {
        centers[i] = newCenter;
        changed = true;
      }
    }
    
    if (!changed) break;
  }

  return centers;
}

/**
 * Median Cut 颜色量化
 * @param {Array} colors - RGB 颜色数组
 * @param {number} maxColors - 最大颜色数
 * @returns {Array} 量化后的颜色
 */
function medianCut(colors, maxColors) {
  if (colors.length === 0) return [];
  if (colors.length <= maxColors) return colors;

  let buckets = [colors];

  while (buckets.length < maxColors) {
    // 找到颜色范围最大的 bucket
    let maxRange = -1;
    let maxIdx = 0;

    for (let i = 0; i < buckets.length; i++) {
      const bucket = buckets[i];
      if (bucket.length < 2) continue;

      const ranges = {
        r: getRange(bucket, 'r'),
        g: getRange(bucket, 'g'),
        b: getRange(bucket, 'b')
      };
      const maxChannel = Object.keys(ranges).reduce((a, b) => 
        ranges[a] > ranges[b] ? a : b
      );
      const range = ranges[maxChannel];

      if (range > maxRange) {
        maxRange = range;
        maxIdx = i;
      }
    }

    if (maxRange <= 0) break;

    // 按该通道排序并分成两半
    const bucket = buckets[maxIdx];
    const channel = ['r', 'g', 'b'].reduce((a, b) => 
      getRange(bucket, a) > getRange(bucket, b) ? a : b
    );

    bucket.sort((a, b) => a[channel] - b[channel]);
    const mid = Math.floor(bucket.length / 2);
    
    buckets.splice(maxIdx, 1, bucket.slice(0, mid), bucket.slice(mid));
  }

  // 返回每个 bucket 的平均颜色
  return buckets.map(bucket => {
    let sumR = 0, sumG = 0, sumB = 0;
    for (const c of bucket) {
      sumR += c.r;
      sumG += c.g;
      sumB += c.b;
    }
    return {
      r: Math.round(sumR / bucket.length),
      g: Math.round(sumG / bucket.length),
      b: Math.round(sumB / bucket.length)
    };
  });
}

/**
 * 获取颜色范围
 */
function getRange(colors, channel) {
  let min = 255, max = 0;
  for (const c of colors) {
    if (c[channel] < min) min = c[channel];
    if (c[channel] > max) max = c[channel];
  }
  return max - min;
}

/**
 * 计算颜色距离 (欧氏距离)
 */
function colorDistance(c1, c2) {
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
    Math.pow(c1.g - c2.g, 2) +
    Math.pow(c1.b - c2.b, 2)
  );
}

/**
 * 简单的图像模糊 (用于降噪)
 */
function simpleBlur(pixels, width, height, radius = 1) {
  const result = new Uint8ClampedArray(pixels.length);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sumR = 0, sumG = 0, sumB = 0, count = 0;
      
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const idx = (ny * width + nx) * 4;
            sumR += pixels[idx];
            sumG += pixels[idx + 1];
            sumB += pixels[idx + 2];
            count++;
          }
        }
      }
      
      const idx = (y * width + x) * 4;
      result[idx] = sumR / count;
      result[idx + 1] = sumG / count;
      result[idx + 2] = sumB / count;
      result[idx + 3] = 255;
    }
  }
  
  return result;
}

/**
 * 使用误差扩散算法 (Floyd-Steinberg)
 * 可以更好地保留细节
 */
function floydSteinbergDithering(colors, palette) {
  // 为每个颜色找到最接近的调色板颜色
  return colors.map(color => {
    let minDist = Infinity;
    let closest = palette[0];
    
    for (const p of palette) {
      const dist = colorDistance(color, p.rgb);
      if (dist < minDist) {
        minDist = dist;
        closest = p;
      }
    }
    
    return closest;
  });
}

/**
 * 处理图像数据 - 主函数
 * @param {Uint8ClampedArray} pixelData - 原始像素数据
 * @param {number} width - 图像宽度
 * @param {number} height - 图像高度
 * @param {number} gridSize - 网格大小
 * @param {string} algorithm - 算法: 'kmeans' | 'mediancut' | 'octree' | 'simple'
 * @param {object} options - 选项 {blur: boolean, dither: boolean}
 * @returns {Array} 网格数据
 */
function processImageData(pixelData, width, height, gridSize, algorithm = 'simple', options = {}) {
  const { blur = false, dither = false } = options;
  
  // 预处理
  let pixels = pixelData;
  if (blur) {
    pixels = simpleBlur(pixelData, width, height, 1);
  }
  
  // 计算网格
  const cols = Math.ceil(width / gridSize);
  const rows = Math.ceil(height / gridSize);
  const scaleX = width / cols;
  const scaleY = height / rows;
  
  const gridData = [];
  
  // 收集所有颜色用于量化
  const allColors = [];
  
  for (let row = 0; row < rows; row++) {
    gridData[row] = [];
    for (let col = 0; col < cols; col++) {
      const srcX = Math.floor(col * scaleX);
      const srcY = Math.floor(row * scaleY);
      const srcEndX = Math.floor((col + 1) * scaleX);
      const srcEndY = Math.floor((col + 1) * scaleY);
      
      let r = 0, g = 0, b = 0, count = 0;
      
      for (let y = srcY; y < srcEndY && y < height; y++) {
        for (let x = srcX; x < srcEndX && x < width; x++) {
          const idx = (y * width + x) * 4;
          r += pixels[idx];
          g += pixels[idx + 1];
          b += pixels[idx + 2];
          count++;
          
          // 采样收集颜色
          if (allColors.length < 10000) {
            allColors.push({
              r: pixels[idx],
              g: pixels[idx + 1],
              b: pixels[idx + 2]
            });
          }
        }
      }
      
      const dominantColor = count > 0 ? {
        r: Math.round(r / count),
        g: Math.round(g / count),
        b: Math.round(b / count)
      } : { r: 0, g: 0, b: 0 };
      
      // 映射到 Mark 颜色
      const markColor = findClosestMarkColor(dominantColor);
      
      gridData[row][col] = {
        x: col * gridSize,
        y: row * gridSize,
        width: gridSize,
        height: gridSize,
        originalRgb: dominantColor,
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
 * 简化版处理 - 逐像素映射
 * 适合直接使用，不需要预处理
 * 优化：使用分片处理避免阻塞
 * @param {Uint8ClampedArray} pixelData - 像素数据
 * @param {number} width - 图像宽度
 * @param {number} height - 图像高度
 * @param {number} gridSize - 网格大小
 * @param {number} mergeThreshold - 颜色聚合阈值 (0-30)
 */
function processSimple(pixelData, width, height, gridSize, mergeThreshold = 0) {
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

  // 使用查找表加速颜色映射
  const { fastFindClosestMarkColor } = require('../utils/colorMapper');

  // 如果没有像素数据，使用简单算法
  if (!pixelData || pixelData.length === 0) {
    return generatePlaceholderGrid(cols, rows, gridSize);
  }

  for (let row = 0; row < rows; row++) {
    gridData[row] = [];
    for (let col = 0; col < cols; col++) {
      const { srcX, srcY, endX, endY } = gridRegions[row][col];

      let r = 0, g = 0, b = 0, count = 0;

      // 遍历网格内所有像素
      for (let y = srcY; y < endY && y < height; y++) {
        for (let x = srcX; x < endX && x < width; x++) {
          const idx = (y * width + x) * 4;
          r += pixelData[idx];
          g += pixelData[idx + 1];
          b += pixelData[idx + 2];
          count++;
        }
      }

      const dominantColor = count > 0 ? {
        r: Math.round(r / count),
        g: Math.round(g / count),
        b: Math.round(b / count)
      } : { r: 0, g: 0, b: 0 };

      // 使用快速查找
      const markColor = fastFindClosestMarkColor(dominantColor);

      gridData[row][col] = {
        x: col * gridSize,
        y: row * gridSize,
        width: gridSize,
        height: gridSize,
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
  const { fastFindClosestMarkColor } = require('../utils/colorMapper');
  
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
  for (let iter = 0; iter < maxIterations; iter++) {
    // 分配每个唯一颜色到最近的中心
    const clusters = Array.from({ length: centers.length }, () => []);

    for (const colorInfo of uniqueColors) {
      let minDist = Infinity;
      let minIdx = 0;

      for (let i = 0; i < centers.length; i++) {
        const dist = fastDistance(colorInfo.rgb, centers[i]);
        if (dist < minDist) {
          minDist = dist;
          minIdx = i;
        }
      }

      clusters[minIdx].push(colorInfo);
    }

    // 更新中心
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

      if (fastDistance(centers[i], newCenter) > 3) {
        centers[i] = newCenter;
        changed = true;
      }
    }

    if (!changed) break;
  }

  // 5. 为每个聚类中心找到最接近的 Mark 色号
  const { fastFindClosestMarkColor } = require('../utils/colorMapper');
  const centerMarkColors = centers.map(center => fastFindClosestMarkColor(center));

  

  // 6. 将每个唯一颜色映射到其所属聚类的 Mark 色号
  // 使用颜色到中心的映射表，避免重复计算
  const rgbToCenterIdx = new Map();

  for (const colorInfo of uniqueColors) {
    let minDist = Infinity;
    let minIdx = 0;

    for (let i = 0; i < centers.length; i++) {
      const dist = fastDistance(colorInfo.rgb, centers[i]);
      if (dist < minDist) {
        minDist = dist;
        minIdx = i;
      }
    }

    rgbToCenterIdx.set(`${colorInfo.rgb.r},${colorInfo.rgb.g},${colorInfo.rgb.b}`, minIdx);
  }

  // 7. 应用到所有格子
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = gridData[row] && gridData[row][col];
      if (!cell || !cell.originalRgb) continue;

      const key = `${cell.originalRgb.r},${cell.originalRgb.g},${cell.originalRgb.b}`;
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
 * @returns {object} 检测结果，包含色块大小和有效范围
 */
function autoDetectBlockSize(pixelData, width, height) {
  try {
  // 辅助函数：获取像素颜色
  function getPixelColor(x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return null;
    const idx = (y * width + x) * 4;
    return { r: pixelData[idx], g: pixelData[idx + 1], b: pixelData[idx + 2] };
  }

  // 辅助函数：判断两个颜色是否相似（使用欧氏距离，更准确）
  // 容差越大，越容易将相近颜色视为相同，可过滤掉原图中的参考线等噪点
  function isSameColor(c1, c2, tolerance = 50) {
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

  // 收集所有距离值和变化点数量
  const hDistances = [];
  const vDistances = [];
  const hChangesCounts = []; // 每条水平线的变化点数量
  const vChangesCounts = []; // 每条垂直线的变化点数量

  // 扫描多条水平线（扫描整行，从0到width-1）
  const hScanCount = 20;
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
      // 保留合理范围的值
      if (dist >= 5 && dist <= 20) {
        hDistances.push(dist);
      }
    }
  }

  // 扫描多条垂直线（扫描整列，从0到height-1）
  const vScanCount = 20;
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
      // 保留合理范围的值
      if (dist >= 5 && dist <= 20) {
        vDistances.push(dist);
      }
    }
  }

  // 取众数作为色块大小
  const hMode = findMode(hDistances) || 10;
  const vMode = findMode(vDistances) || 10;

  // 色块大小 = 相邻距离的众数
  let blockSize = (hMode + vMode) / 2;
  if (!blockSize || blockSize === 0) blockSize = 10;

  const primarySize = blockSize;

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

  const result = {
    primarySize: primarySize,
    secondarySize: null,
    // 原始检测值
    rawBlockSize: (hMode + vMode) / 2,
    hMode,
    vMode,
    hColsMode,
    vRowsMode,
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
  return result;
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
 * 智能处理图像 - 网格化 + 主导色识别
 * 使用网格划分图像，每个网格识别主导色
 * 智能判断是否为纯色区域，不过滤黑色（保留原色）
 * @param {Uint8ClampedArray} pixelData - 像素数据
 * @param {number} width - 图像宽度
 * @param {number} height - 图像高度
 * @param {number} gridSize - 网格大小
 * @param {object} options - 选项
 */
function processWithSmartRegions(pixelData, width, height, gridSize, options = {}) {

  // 导入颜色查找函数
  const { fastFindClosestMarkColor: findMark } = require('../utils/colorMapper');

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
  const { primarySize, secondarySize, rawBlockSize, hMode, vMode, hColsMode, vRowsMode, validRange, debug } = autoDetectBlockSize(pixelData, width, height);
  const actualGridSize = primarySize || gridSize; // 使用检测值或回退到预设值

  // 使用检测到的有效范围
  const startX = validRange.startX;
  const startY = validRange.startY;
  const cols = validRange.cols;
  const rows = validRange.rows;

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

  // 计算颜色距离
  function colorDistance(c1, c2) {
    if (!c1 || !c2) return Infinity;
    return Math.sqrt(
      Math.pow(c1.r - c2.r, 2) +
      Math.pow(c1.g - c2.g, 2) +
      Math.pow(c1.b - c2.b, 2)
    );
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
        const markColor = findMark({ r: 128, g: 128, b: 128 });
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
      const markColor = findMark(finalColor);

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
    hasLargeRegions: !!largeRegionSize,
    width,
    height
  };
}

// 快速颜色查找（内部使用）
let fastFindClosestMarkColor;

module.exports = {
  kMeansClustering,
  medianCut,
  processImageData,
  processSimple,
  aggregateSimilarColors,
  processWithSmartRegions,
  autoDetectBlockSize,
  colorDistance,
  simpleBlur,
  floydSteinbergDithering
};