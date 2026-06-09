/**
 * 拼豆图纸生成器 - 微信AI原子接口实现
 *
 * 实现微信AI开发模式的原子接口，供小程序AI调用
 *
 * 注意：这些接口需要运行在小程序环境中，可以通过 wx API 访问 Canvas 和文件系统
 */

const { processSimple, processWithSmartRegions, processMosaicV2 } = require('../../src/utils/imageProcessor');
const { calculateStats, generatePurchaseListCSV } = require('../../src/utils/statsCalculator');
const { markPalette } = require('../../src/data/colorPalettes');

/**
 * 图纸数据存储
 * 使用 Map 存储已生成的图纸数据，key 为 mosaicId
 */
const mosaicStore = new Map();

/**
 * 生成唯一的图纸ID
 */
function generateMosaicId() {
  return `mosaic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 从图片路径获取像素数据
 * @param {string} imagePath - 图片临时路径
 * @returns {Promise<{pixelData: Uint8ClampedArray, width: number, height: number}>}
 */
function getPixelDataFromImage(imagePath) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src: imagePath,
      success(res) {
        const width = res.width;
        const height = res.height;

        // 尝试使用 OffscreenCanvas
        if (wx.createOffscreenCanvas) {
          try {
            const canvas = wx.createOffscreenCanvas({ type: '2d', width, height });
            const ctx = canvas.getContext('2d');
            const image = canvas.createImage();
            image.src = imagePath;
            image.onload = () => {
              ctx.drawImage(image, 0, 0, width, height);
              const imageData = ctx.getImageData(0, 0, width, height);
              resolve({
                pixelData: imageData.data,
                width,
                height
              });
            };
            image.onerror = (e) => reject(new Error('图片加载失败'));
            return;
          } catch (e) {
            console.warn('[getPixelDataFromImage] OffscreenCanvas 失败，尝试降级方案');
          }
        }

        // 降级方案：使用普通 Canvas
        const query = wx.createSelectorQuery();
        query.select('#pixel-canvas')
          .fields({ node: true, size: true })
          .exec((res) => {
            if (!res[0] || !res[0].node) {
              reject(new Error('Canvas 不可用'));
              return;
            }

            const canvas = res[0].node;
            const ctx = canvas.getContext('2d');
            canvas.width = width;
            canvas.height = height;

            const image = canvas.createImage();
            image.src = imagePath;
            image.onload = () => {
              ctx.drawImage(image, 0, 0, width, height);
              const imageData = ctx.getImageData(0, 0, width, height);
              resolve({
                pixelData: imageData.data,
                width,
                height
              });
            };
            image.onerror = () => reject(new Error('图片加载失败'));
          });
      },
      fail() {
        reject(new Error('获取图片信息失败'));
      }
    });
  });
}

/**
 * 原子接口 1: 生成拼豆马赛克图纸
 *
 * @param {Object} params - 参数对象
 * @param {string} params.imageUrl - 图片临时路径
 * @param {string} [params.processMode='cartoon'] - 处理模式：cartoon|mosaic
 * @param {number} [params.gridSize=10] - 网格大小：5-50
 * @param {number} [params.mergeThreshold=50] - 合并阈值：0-291
 * @param {boolean} [params.removeEdge=true] - 是否去除边缘
 * @param {boolean} [params.useSpecialColors=false] - 是否使用特殊色
 * @param {boolean} [params.mirrorImage=false] - 是否镜像
 * @param {number} [params.vibrantScale=0] - 鲜艳度：-10到10
 * @returns {Promise<Object>} 图纸数据和颜色统计
 */
async function generateBeadMosaic(params) {
  const {
    imageUrl,
    processMode = 'cartoon',
    gridSize = 10,
    mergeThreshold = 50,
    removeEdge = true,
    useSpecialColors = false,
    mirrorImage = false,
    vibrantScale = 0
  } = params;

  try {
    // 参数验证
    if (!imageUrl) {
      return {
        success: false,
        message: '缺少必要参数：imageUrl'
      };
    }

    // 参数范围校验
    const validGridSize = Math.max(5, Math.min(50, gridSize));
    const validThreshold = Math.max(0, Math.min(291, mergeThreshold));
    const validVibrant = Math.max(-10, Math.min(10, vibrantScale));

    // 获取像素数据
    let pixelData, width, height;
    try {
      const result = await getPixelDataFromImage(imageUrl);
      pixelData = result.pixelData;
      width = result.width;
      height = result.height;
    } catch (e) {
      return {
        success: false,
        message: '无法读取图片：' + e.message
      };
    }

    // 根据处理模式选择不同的算法
    let mosaicResult;

    if (processMode === 'mosaic') {
      // 马赛克模式：使用智能区域处理
      mosaicResult = processMosaicV2(pixelData, width, height, {
        gridSize: validGridSize,
        mergeThreshold: validThreshold
      });
    } else {
      // 卡通模式：使用简单处理
      mosaicResult = processSimple(
        pixelData,
        width,
        height,
        validGridSize,
        validThreshold,
        validVibrant / 10  // vibrantScale 范围是 0-1
      );
    }

    if (!mosaicResult || !mosaicResult.gridData) {
      return {
        success: false,
        message: '图纸生成失败'
      };
    }

    const { gridData, cols, rows } = mosaicResult;
    const mosaicId = generateMosaicId();

    // 计算颜色统计
    const stats = calculateStats({
      gridData: gridData,
      cols: cols,
      rows: rows,
      ignoreEdge: removeEdge
    });

    // 转换统计格式
    const colorStats = stats.sortedByCount.map(item => ({
      code: item.code,
      hex: item.hex,
      count: item.count
    }));

    // 存储图纸数据
    mosaicStore.set(mosaicId, {
      mosaicId,
      gridData,
      cols,
      rows,
      gridSize: validGridSize,
      mergeThreshold: validThreshold,
      processMode,
      colorStats,
      imageUrl,
      removeEdge,
      createdAt: Date.now()
    });

    // 清理过期的图纸数据（超过1小时）
    const oneHourAgo = Date.now() - 3600000;
    for (const [key, value] of mosaicStore.entries()) {
      if (value.createdAt < oneHourAgo) {
        mosaicStore.delete(key);
      }
    }

    return {
      success: true,
      data: {
        mosaicId,
        cols,
        rows,
        totalCells: cols * rows,
        colorCount: colorStats.length,
        processMode,
        gridSize: validGridSize,
        mergeThreshold: validThreshold,
        colorStats
      }
    };

  } catch (error) {
    console.error('[generateBeadMosaic] 错误:', error);
    return {
      success: false,
      message: error.message || '生成图纸时发生错误'
    };
  }
}

/**
 * 原子接口 2: 获取颜色统计
 *
 * @param {Object} params - 参数对象
 * @param {string} params.mosaicId - 图纸ID
 * @param {string} [params.sortBy='count'] - 排序方式：count|code
 * @returns {Promise<Object>} 颜色统计信息
 */
async function getColorStats(params) {
  const { mosaicId, sortBy = 'count' } = params;

  try {
    if (!mosaicId) {
      return {
        success: false,
        message: '缺少必要参数：mosaicId'
      };
    }

    const mosaicData = mosaicStore.get(mosaicId);
    if (!mosaicData) {
      return {
        success: false,
        message: '图纸不存在或已过期，请重新生成'
      };
    }

    let colorStats = mosaicData.colorStats;

    // 按色号排序
    if (sortBy === 'code') {
      colorStats = [...colorStats].sort((a, b) => a.code.localeCompare(b.code));
    }

    // 计算百分比
    const totalCells = mosaicData.cols * mosaicData.rows;
    const statsWithPercentage = colorStats.map(item => ({
      ...item,
      percentage: ((item.count / totalCells) * 100).toFixed(2)
    }));

    return {
      success: true,
      data: {
        mosaicId,
        totalCells,
        colorCount: colorStats.length,
        colorStats: statsWithPercentage
      }
    };

  } catch (error) {
    console.error('[getColorStats] 错误:', error);
    return {
      success: false,
      message: error.message || '获取统计信息时发生错误'
    };
  }
}

/**
 * 原子接口 3: 获取采购清单
 *
 * @param {Object} params - 参数对象
 * @param {string} params.mosaicId - 图纸ID
 * @param {string} [params.format='csv'] - 输出格式：csv|text
 * @returns {Promise<Object>} 采购清单内容
 */
async function getPurchaseList(params) {
  const { mosaicId, format = 'csv' } = params;

  try {
    if (!mosaicId) {
      return {
        success: false,
        message: '缺少必要参数：mosaicId'
      };
    }

    const mosaicData = mosaicStore.get(mosaicId);
    if (!mosaicData) {
      return {
        success: false,
        message: '图纸不存在或已过期，请重新生成'
      };
    }

    const colorStats = mosaicData.colorStats;
    const totalCells = mosaicData.cols * mosaicData.rows;

    let content = '';

    if (format === 'csv') {
      // CSV 格式
      content = '色号,颜色,数量\n';
      colorStats.forEach(item => {
        content += `${item.code},${item.hex},${item.count}\n`;
      });
    } else {
      // 纯文本格式
      content = '拼豆采购清单\n';
      content += '================\n\n';
      colorStats.forEach((item, index) => {
        content += `${index + 1}. ${item.code} (${item.hex}): ${item.count} 个\n`;
      });
      content += '\n----------------\n';
      content += `总计: ${colorStats.length} 种颜色, ${totalCells} 个拼豆\n`;
    }

    return {
      success: true,
      data: {
        content,
        format,
        totalColors: colorStats.length,
        totalQuantity: totalCells
      }
    };

  } catch (error) {
    console.error('[getPurchaseList] 错误:', error);
    return {
      success: false,
      message: error.message || '生成采购清单时发生错误'
    };
  }
}

/**
 * 原子接口 4: 导出PNG图片
 *
 * @param {Object} params - 参数对象
 * @param {string} params.mosaicId - 图纸ID
 * @param {boolean} [params.includeStats=true] - 是否包含统计信息
 * @param {boolean} [params.showCode=true] - 是否显示色号
 * @returns {Promise<Object>} 导出的图片路径
 */
async function exportMosaicPNG(params) {
  const { mosaicId, includeStats = true, showCode = true } = params;

  try {
    if (!mosaicId) {
      return {
        success: false,
        message: '缺少必要参数：mosaicId'
      };
    }

    const mosaicData = mosaicStore.get(mosaicId);
    if (!mosaicData) {
      return {
        success: false,
        message: '图纸不存在或已过期，请重新生成'
      };
    }

    const { gridData, cols, rows, colorStats } = mosaicData;

    // 计算导出尺寸
    const cellSize = 20; // 每个格子的像素大小
    const statsHeight = includeStats ? colorStats.length * 30 + 50 : 0;
    const canvasWidth = cols * cellSize;
    const canvasHeight = rows * cellSize + statsHeight;

    // 创建离屏 Canvas
    const canvas = wx.createOffscreenCanvas({
      type: '2d',
      width: canvasWidth,
      height: canvasHeight
    });
    const ctx = canvas.getContext('2d');

    // 绘制背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 绘制马赛克格子
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = gridData[row] && gridData[row][col];
        if (!cell || !cell.markCode) continue;

        // 如果 removeEdge 为 true，跳过边缘格子
        if (mosaicData.removeEdge && cell.isEdge) continue;

        const x = col * cellSize;
        const y = row * cellSize;

        // 绘制色块
        ctx.fillStyle = cell.markHex || '#cccccc';
        ctx.fillRect(x, y, cellSize, cellSize);

        // 绘制边框
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cellSize, cellSize);

        // 绘制色号
        if (showCode && cellSize >= 12) {
          const isLight = isLightColor(cell.markHex);
          ctx.fillStyle = isLight ? '#333' : '#fff';
          ctx.font = `bold ${Math.max(8, cellSize * 0.4)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(formatMarkCode(cell.markCode), x + cellSize / 2, y + cellSize / 2);
        }
      }
    }

    // 绘制统计信息
    if (includeStats) {
      const statsY = rows * cellSize + 10;
      ctx.fillStyle = '#333';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('颜色统计：', 10, statsY);

      colorStats.forEach((item, index) => {
        const y = statsY + 25 + index * 25;
        ctx.fillStyle = item.hex;
        ctx.fillRect(10, y - 8, 16, 16);
        ctx.strokeStyle = '#ccc';
        ctx.strokeRect(10, y - 8, 16, 16);

        ctx.fillStyle = '#333';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${item.code}: ${item.count} 个`, 35, y);
      });
    }

    // 导出为临时文件
    return new Promise((resolve) => {
      wx.canvasToTempFilePath({
        canvas: canvas,
        success(res) {
          resolve({
            success: true,
            data: {
              tempFilePath: res.tempFilePath,
              width: canvasWidth,
              height: canvasHeight
            }
          });
        },
        fail(err) {
          resolve({
            success: false,
            message: '导出图片失败：' + err.errMsg
          });
        }
      });
    });

  } catch (error) {
    console.error('[exportMosaicPNG] 错误:', error);
    return {
      success: false,
      message: error.message || '导出图片时发生错误'
    };
  }
}

/**
 * 辅助函数：判断颜色是否为浅色
 */
function isLightColor(hex) {
  if (!hex) return false;
  const rgb = hexToRgb(hex);
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return brightness > 128;
}

/**
 * 辅助函数：hex 转 RGB
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

/**
 * 辅助函数：格式化色号（省略前导零）
 */
function formatMarkCode(code) {
  if (!code || code.length < 2) return code;
  // A01 -> A1, B02 -> B2
  if (code[1] === '0') {
    return code[0] + code.substring(2);
  }
  return code;
}

/**
 * 导出所有原子接口
 */
module.exports = {
  generateBeadMosaic,
  getColorStats,
  getPurchaseList,
  exportMosaicPNG
};
