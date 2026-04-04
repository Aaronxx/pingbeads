/**
 * 图像处理算法模块
 * 负责图片像素化处理和颜色映射
 */

const { rgbToMark } = require('./colorMapper');

/**
 * 从 Canvas 获取图像数据
 * @param {Object} canvas - 小程序 Canvas 上下文
 * @param {number} width - 宽度
 * @param {number} height - 高度
 * @returns {ImageData} 图像数据
 */
function getImageData(canvas, width, height) {
  return canvas.getImageData(0, 0, width, height);
}

/**
 * 计算网格中主导色（出现频率最高的颜色）
 * @param {Uint8ClampedArray} data - 图像 RGBA 数据
 * @param {number} startX - 起始 X 坐标
 * @param {number} startY - 起始 Y 坐标
 * @param {number} endX - 结束 X 坐标
 * @param {number} endY - 结束 Y 坐标
 * @param {number} width - 图像宽度
 * @returns {{r: number, g: number, b: number}} 主导色 RGB
 */
function getDominantColor(data, startX, startY, endX, endY, width) {
  const colorCounts = {};

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      // 跳过透明像素
      if (a < 128) continue;

      // 将颜色量化为 8 位精度，减少颜色数量
      const qr = Math.floor(r / 8) * 8;
      const qg = Math.floor(g / 8) * 8;
      const qb = Math.floor(b / 8) * 8;

      const key = `${qr},${qg},${qb}`;
      colorCounts[key] = (colorCounts[key] || 0) + 1;
    }
  }

  // 找到出现频率最高的颜色
  let maxCount = 0;
  let dominantKey = null;
  for (const [key, count] of Object.entries(colorCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantKey = key;
    }
  }

  if (!dominantKey) {
    return { r: 255, g: 255, b: 255 }; // 默认白色
  }

  const [qr, qg, qb] = dominantKey.split(',').map(Number);
  return { r: qr, g: qg, b: qb };
}

/**
 * 生成马赛克图像
 * @param {Object} options - 配置选项
 * @returns {Object} 处理结果
 */
function generateMosaic(options) {
  const {
    imageData,      // 图像数据 (Uint8ClampedArray)
    width,         // 图像宽度
    height,        // 图像高度
    gridSize = 10, // 网格大小（像素）
    mergeThreshold = 30 // 颜色合并阈值（欧氏距离）
  } = options;

  // 计算网格数量
  const cols = Math.ceil(width / gridSize);
  const rows = Math.ceil(height / gridSize);

  // 初始化网格数据
  const gridData = [];

  // 第一遍：提取主导色并映射到 Mark 色号
  for (let row = 0; row < rows; row++) {
    gridData[row] = [];
    for (let col = 0; col < cols; col++) {
      const startX = col * gridSize;
      const startY = row * gridSize;
      const endX = Math.min(startX + gridSize, width);
      const endY = Math.min(startY + gridSize, height);

      // 获取主导色
      const dominantColor = getDominantColor(
        imageData, startX, startY, endX, endY, width
      );

      // 映射到 Mark 色号
      const markColor = rgbToMark(dominantColor.r, dominantColor.g, dominantColor.b);

      gridData[row][col] = {
        x: startX,
        y: startY,
        width: endX - startX,
        height: endY - startY,
        originalRgb: dominantColor,
        markCode: markColor.code,
        markHex: markColor.hex,
        markRgb: markColor.rgb,
        merged: false
      };
    }
  }

  // 第二遍：区域颜色合并（BFS）
  const mergedGrid = mergeRegions(gridData, rows, cols, mergeThreshold);

  return {
    gridData: mergedGrid,
    cols,
    rows,
    gridSize
  };
}

/**
 * 区域颜色合并 - 使用 BFS 合并相似颜色区域
 * @param {Array} gridData - 网格数据
 * @param {number} rows - 行数
 * @param {number} cols - 列数
 * @param {number} threshold - 相似度阈值
 * @returns {Array} 合并后的网格数据
 */
function mergeRegions(gridData, rows, cols, threshold) {
  const visited = Array(rows).fill(null).map(() => Array(cols).fill(false));

  // 欧氏距离计算
  const distance = (c1, c2) => {
    return Math.sqrt(
      Math.pow(c1.markRgb.r - c2.markRgb.r, 2) +
      Math.pow(c1.markRgb.g - c2.markRgb.g, 2) +
      Math.pow(c1.markRgb.b - c2.markRgb.b, 2)
    );
  };

  // BFS 查找连通区域
  const findRegion = (startRow, startCol) => {
    const region = [];
    const queue = [[startRow, startCol]];
    const startColor = gridData[startRow][startCol];
    region.push({ row: startRow, col: startCol, color: startColor });

    visited[startRow][startCol] = true;

    while (queue.length > 0) {
      const [row, col] = queue.shift();

      // 检查四个方向
      const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of directions) {
        const newRow = row + dr;
        const newCol = col + dc;

        if (newRow >= 0 && newRow < rows &&
            newCol >= 0 && newCol < cols &&
            !visited[newRow][newCol]) {

          const newColor = gridData[newRow][newCol];

          // 如果颜色相似，加入区域
          if (distance(startColor, newColor) < threshold) {
            visited[newRow][newCol] = true;
            region.push({ row: newRow, col: newCol, color: newColor });
            queue.push([newRow, newCol]);
          }
        }
      }
    }

    return region;
  };

  // 遍历所有未访问的单元格
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!visited[row][col]) {
        const region = findRegion(row, col);

        // 如果区域大于 1 个单元格，进行合并
        if (region.length > 1) {
          // 找到区域内出现最多的颜色
          const colorCounts = {};
          for (const cell of region) {
            const code = cell.color.markCode;
            colorCounts[code] = (colorCounts[code] || 0) + 1;
          }

          let maxCount = 0;
          let dominantCode = null;
          for (const [code, count] of Object.entries(colorCounts)) {
            if (count > maxCount) {
              maxCount = count;
              dominantCode = code;
            }
          }

          // 获取主导色的完整信息
          const dominantCell = region.find(c => c.color.markCode === dominantCode);
          const dominantColor = dominantCell.color;

          // 更新区域内所有单元格的颜色
          for (const cell of region) {
            gridData[cell.row][cell.col].markCode = dominantColor.markCode;
            gridData[cell.row][cell.col].markHex = dominantColor.markHex;
            gridData[cell.row][cell.col].markRgb = dominantColor.markRgb;
            gridData[cell.row][cell.col].merged = true;
          }
        }
      }
    }
  }

  return gridData;
}

/**
 * 生成 Canvas 渲染数据
 * @param {Array} gridData - 网格数据
 * @param {string} highlightCode - 高亮显示的色号（可选）
 * @returns {Object} 渲染指令
 */
function generateRenderData(gridData, highlightCode = null) {
  const renderData = [];

  for (const row of gridData) {
    for (const cell of row) {
      let fillColor = cell.markHex;

      // 如果指定了高亮色号
      if (highlightCode) {
        if (cell.markCode === highlightCode) {
          // 高亮显示
          fillColor = cell.markHex;
        } else {
          // 其他颜色置灰
          fillColor = '#CCCCCC';
        }
      }

      renderData.push({
        x: cell.x,
        y: cell.y,
        width: cell.width,
        height: cell.height,
        fillColor: fillColor,
        markCode: cell.markCode
      });
    }
  }

  return renderData;
}

module.exports = {
  getImageData,
  getDominantColor,
  generateMosaic,
  mergeRegions,
  generateRenderData
};
