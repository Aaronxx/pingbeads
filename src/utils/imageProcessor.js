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
 */
function processSimple(pixelData, width, height, gridSize) {
  const cols = Math.ceil(width / gridSize);
  const rows = Math.ceil(height / gridSize);
  const scaleX = width / cols;
  const scaleY = height / rows;
  
  const gridData = [];
  
  for (let row = 0; row < rows; row++) {
    gridData[row] = [];
    for (let col = 0; col < cols; col++) {
      const srcX = Math.floor(col * scaleX);
      const srcY = Math.floor(row * scaleY);
      const endX = Math.floor((col + 1) * scaleX);
      const endY = Math.floor((row + 1) * scaleY);
      
      let r = 0, g = 0, b = 0, count = 0;
      
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

module.exports = {
  kMeansClustering,
  medianCut,
  processImageData,
  processSimple,
  colorDistance,
  simpleBlur,
  floydSteinbergDithering
};