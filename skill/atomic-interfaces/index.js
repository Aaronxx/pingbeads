/**
 * 拼豆图纸生成器 - 微信AI原子接口实现
 *
 * 实现微信AI开发模式的原子接口，供小程序AI调用
 *
 * 注意：这些接口运行在小程序AI独立JS环境中，可通过 wx API 访问 Canvas 和文件系统
 */

const { processSimple, processWithSmartRegions, processMosaicV2 } = require('../../src/utils/imageProcessor');
const { calculateStats, generatePurchaseListCSV } = require('../../src/utils/statsCalculator');

/**
 * 错误码定义
 * 用于分类错误，便于AI理解和处理
 */
const ErrorCodes = {
  // 图片相关错误 (1xxx)
  IMAGE_NOT_FOUND: 1001,        // 图片不存在或无法访问
  IMAGE_TOO_LARGE: 1002,        // 图片尺寸过大
  IMAGE_LOAD_FAILED: 1003,      // 图片加载失败
  IMAGE_FORMAT_UNSUPPORTED: 1004, // 图片格式不支持

  // 参数相关错误 (2xxx)
  INVALID_PARAMS: 2001,         // 参数无效
  MISSING_REQUIRED_PARAM: 2002, // 缺少必要参数
  PARAM_OUT_OF_RANGE: 2003,     // 参数超出范围

  // Canvas 相关错误 (3xxx)
  CANVAS_NOT_AVAILABLE: 3001,   // Canvas 不可用
  CANVAS_INIT_FAILED: 3002,     // Canvas 初始化失败
  CANVAS_EXPORT_FAILED: 3003,   // Canvas 导出失败
  CANVAS_SIZE_LIMIT: 3004,      // Canvas 尺寸超出限制

  // 算法相关错误 (4xxx)
  ALGORITHM_ERROR: 4001,        // 算法执行错误
  ALGORITHM_NO_DATA: 4002,      // 算法返回空数据
  COLOR_MAP_FAILED: 4003,       // 颜色映射失败

  // 存储相关错误 (5xxx)
  STORAGE_ERROR: 5001,          // 存储错误
  DATA_NOT_FOUND: 5002,         // 数据不存在
  DATA_EXPIRED: 5003,           // 数据已过期

  // 环境相关错误 (6xxx)
  WX_API_NOT_AVAILABLE: 6001,   // wx API 不可用
  ENVIRONMENT_ERROR: 6002       // 运行环境错误
};

/**
 * 用户友好的错误消息
 * 将技术性错误转换为用户可理解的提示
 */
const ErrorMessages = {
  [ErrorCodes.IMAGE_NOT_FOUND]: '图片不存在，请检查图片路径或重新选择',
  [ErrorCodes.IMAGE_TOO_LARGE]: '图片尺寸过大，已自动缩放至 4086×4086 以内',
  [ErrorCodes.IMAGE_LOAD_FAILED]: '图片加载失败，请尝试重新选择或使用其他图片',
  [ErrorCodes.IMAGE_FORMAT_UNSUPPORTED]: '图片格式不支持，请使用 JPG、PNG 或 WEBP 格式',

  [ErrorCodes.INVALID_PARAMS]: '参数无效，请检查输入参数',
  [ErrorCodes.MISSING_REQUIRED_PARAM]: '缺少必要参数',
  [ErrorCodes.PARAM_OUT_OF_RANGE]: '参数超出允许范围',

  [ErrorCodes.CANVAS_NOT_AVAILABLE]: '当前环境不支持图片处理，请升级微信版本',
  [ErrorCodes.CANVAS_INIT_FAILED]: 'Canvas 初始化失败，请稍后重试',
  [ErrorCodes.CANVAS_EXPORT_FAILED]: '导出图片失败，请检查存储空间',
  [ErrorCodes.CANVAS_SIZE_LIMIT]: '图纸尺寸过大，超出导出限制（4096px）',

  [ErrorCodes.ALGORITHM_ERROR]: '图纸生成失败，请尝试调整参数或更换图片',
  [ErrorCodes.ALGORITHM_NO_DATA]: '图纸生成失败：算法返回空数据',
  [ErrorCodes.COLOR_MAP_FAILED]: '颜色映射失败，请检查色号数据',

  [ErrorCodes.STORAGE_ERROR]: '存储错误，请稍后重试',
  [ErrorCodes.DATA_NOT_FOUND]: '图纸不存在或已删除，请重新生成',
  [ErrorCodes.DATA_EXPIRED]: '图纸数据已过期（超过1小时），请重新生成',

  [ErrorCodes.WX_API_NOT_AVAILABLE]: 'wx API 不可用，请确保在小程序环境中运行',
  [ErrorCodes.ENVIRONMENT_ERROR]: '运行环境错误，请检查小程序配置'
};

/**
 * 创建标准化错误响应
 * @param {number} code - 错误码
 * @param {string} message - 自定义错误消息（可选）
 * @param {Object} details - 错误详情（可选）
 * @returns {Object} 标准化错误响应
 */
function createErrorResponse(code, message = null, details = null) {
  const response = {
    success: false,
    errorCode: code,
    message: message || ErrorMessages[code] || '未知错误'
  };

  if (details) {
    response.details = details;
  }

  return response;
}

/**
 * 图纸数据存储
 * 使用 Map 存储已生成的图纸数据，key 为 mosaicId
 * 注意：AI 环境中此存储可能在会话结束后清空
 */
const mosaicStore = new Map();

/**
 * 图片像素数据缓存
 * 使用图片路径作为 key，避免重复处理相同图片
 * 注意：缓存数据较大，需要定期清理
 */
const imageCache = new Map();
const IMAGE_CACHE_MAX_SIZE = 10; // 最多缓存 10 张图片的像素数据

/**
 * 清理过期的缓存数据
 * @param {Map} cache - 缓存 Map
 * @param {number} maxAge - 最大缓存时间（毫秒）
 * @param {number} maxSize - 最大缓存数量
 */
function cleanupCache(cache, maxAge = 3600000, maxSize = 100) {
  const now = Date.now();

  // 清理过期数据
  for (const [key, value] of cache.entries()) {
    if (value.createdAt && now - value.createdAt > maxAge) {
      cache.delete(key);
    }
  }

  // 如果仍然超过最大数量，删除最旧的数据
  if (cache.size > maxSize) {
    const keys = Array.from(cache.keys());
    const toDelete = keys.slice(0, cache.size - maxSize);
    for (const key of toDelete) {
      cache.delete(key);
    }
  }
}

/**
 * 生成唯一的图纸ID
 */
function generateMosaicId() {
  return `mosaic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 辅助函数：hex 转 RGB
 */
function hexToRgb(hex) {
  if (!hex) return { r: 0, g: 0, b: 0 };
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

/**
 * 辅助函数：判断颜色是否为浅色
 */
function isLightColor(hex) {
  if (!hex) return false;
  const rgb = hexToRgb(hex);
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return brightness > 150;
}

/**
 * 辅助函数：格式化色号（省略前导零）
 */
function formatMarkCode(code) {
  if (!code) return '';
  // A01 -> A1, B02 -> B2
  if (code.length >= 3 && code[1] === '0') {
    return code[0] + code.substring(2);
  }
  return code;
}

/**
 * 根据图片特征自动推荐参数
 * @param {Object} imageInfo - 图片信息
 * @param {number} imageInfo.width - 图片宽度
 * @param {number} imageInfo.height - 图片高度
 * @returns {Object} 推荐的参数
 */
function suggestParams(imageInfo) {
  const { width, height } = imageInfo;
  const pixelCount = width * height;
  const aspectRatio = width / height;

  // 根据图片像素数量推荐 gridSize
  let gridSize, mergeThreshold;

  if (pixelCount > 4000000) {
    // 超大图（400万像素以上）
    gridSize = 25;
    mergeThreshold = 100;
  } else if (pixelCount > 1000000) {
    // 大图（100-400万像素）
    gridSize = 20;
    mergeThreshold = 80;
  } else if (pixelCount > 300000) {
    // 中等图（30-100万像素）
    gridSize = 12;
    mergeThreshold = 50;
  } else if (pixelCount > 100000) {
    // 小图（10-30万像素）
    gridSize = 8;
    mergeThreshold = 30;
  } else {
    // 超小图（10万像素以下）
    gridSize = 6;
    mergeThreshold = 20;
  }

  // 根据宽高比调整
  if (aspectRatio > 2 || aspectRatio < 0.5) {
    // 非常狭长或非常宽的图片，稍微增加 gridSize
    gridSize = Math.min(50, gridSize + 5);
  }

  return {
    gridSize,
    mergeThreshold,
    processMode: pixelCount > 500000 ? 'mosaic' : 'cartoon',
    removeEdge: true,
    useSpecialColors: false,
    mirrorImage: false,
    vibrantScale: 0
  };
}

/**
 * 参数建议接口：根据图片特征推荐合适的处理参数
 *
 * @param {Object} params - 参数对象
 * @param {string} params.imageUrl - 图片临时路径
 * @returns {Promise<Object>} 推荐的参数
 */
async function suggestProcessingParams(params) {
  const { imageUrl } = params;

  try {
    if (!imageUrl) {
      return createErrorResponse(ErrorCodes.MISSING_REQUIRED_PARAM, '缺少必要参数：imageUrl');
    }

    // 获取图片信息
    return new Promise((resolve) => {
      if (!wx || !wx.getImageInfo) {
        resolve(createErrorResponse(ErrorCodes.WX_API_NOT_AVAILABLE, 'wx API 不可用'));
        return;
      }

      wx.getImageInfo({
        src: imageUrl,
        success(res) {
          const imageInfo = {
            width: res.width,
            height: res.height,
            orientation: res.orientation
          };

          const suggestedParams = suggestParams(imageInfo);

          resolve({
            success: true,
            data: {
              imageInfo,
              suggestedParams,
              explanation: getSuggestedParamsExplanation(imageInfo, suggestedParams)
            }
          });
        },
        fail(err) {
          resolve(createErrorResponse(ErrorCodes.IMAGE_NOT_FOUND, '获取图片信息失败：' + (err.errMsg || '未知错误')));
        }
      });
    });

  } catch (error) {
    console.error('[suggestProcessingParams] 错误:', error);
    return createErrorResponse(ErrorCodes.ENVIRONMENT_ERROR, error.message || '获取参数建议时发生错误');
  }
}

/**
 * 生成参数建议的解释说明
 * @param {Object} imageInfo - 图片信息
 * @param {Object} suggestedParams - 推荐的参数
 * @returns {string} 解释说明
 */
function getSuggestedParamsExplanation(imageInfo, suggestedParams) {
  const { width, height } = imageInfo;
  const pixelCount = width * height;
  const pixelCountStr = pixelCount >= 1000000
    ? (pixelCount / 1000000).toFixed(1) + 'M'
    : (pixelCount / 1000).toFixed(0) + 'K';

  let explanation = `图片尺寸 ${width}×${height} (${pixelCountStr}像素)`;

  if (pixelCount > 4000000) {
    explanation += '，超大图片，建议使用较粗的网格(25px)和较大的合并阈值(100)以避免处理时间过长';
  } else if (pixelCount > 1000000) {
    explanation += '，大图，建议使用较粗的网格(20px)和较大的合并阈值(80)';
  } else if (pixelCount > 300000) {
    explanation += '，中等图片，使用标准参数(网格12px，合并阈值50)';
  } else if (pixelCount > 100000) {
    explanation += '，小图，可以使用较细的网格(8px)保留更多细节';
  } else {
    explanation += '，超小图，使用细网格(6px)可以获得最佳效果';
  }

  if (suggestedParams.processMode === 'mosaic') {
    explanation += '。由于图片较大，建议使用马赛克模式以获得更好的效果';
  } else {
    explanation += '。由于图片较小，建议使用卡通模式';
  }

  return explanation;
}

/**
 * 从图片路径获取像素数据（带缓存）
 * @param {string} imagePath - 图片临时路径
 * @returns {Promise<{pixelData: Uint8ClampedArray, width: number, height: number}>}
 */
async function getPixelDataFromImage(imagePath) {
  // 检查缓存
  if (imageCache.has(imagePath)) {
    const cached = imageCache.get(imagePath);
    // 更新访问时间
    cached.lastAccessed = Date.now();
    return {
      pixelData: cached.pixelData,
      width: cached.width,
      height: cached.height
    };
  }

  // 缓存未命中，执行实际处理
  const result = await getPixelDataFromImageInternal(imagePath);

  // 存入缓存
  imageCache.set(imagePath, {
    ...result,
    createdAt: Date.now(),
    lastAccessed: Date.now()
  });

  // 清理缓存
  cleanupCache(imageCache, 3600000, IMAGE_CACHE_MAX_SIZE);

  return result;
}

/**
 * 从图片路径获取像素数据（内部实现，无缓存）
 * @param {string} imagePath - 图片临时路径
 * @returns {Promise<{pixelData: Uint8ClampedArray, width: number, height: number}>}
 */
function getPixelDataFromImageInternal(imagePath) {
  return new Promise((resolve, reject) => {
    // 检查 wx API 是否可用
    if (!wx || !wx.getImageInfo) {
      reject(new Error('wx API 不可用，请确保在小程序环境中运行'));
      return;
    }

    wx.getImageInfo({
      src: imagePath,
      success(res) {
        const width = res.width;
        const height = res.height;

        // 限制图片尺寸，避免内存溢出
        const MAX_SIZE = 4086;
        let targetWidth = width;
        let targetHeight = height;

        if (width > MAX_SIZE || height > MAX_SIZE) {
          const ratio = Math.min(MAX_SIZE / width, MAX_SIZE / height);
          targetWidth = Math.round(width * ratio);
          targetHeight = Math.round(height * ratio);
        }

        // 优先使用 OffscreenCanvas（性能更好）
        if (typeof wx.createOffscreenCanvas === 'function') {
          try {
            const canvas = wx.createOffscreenCanvas({ type: '2d', width: targetWidth, height: targetHeight });
            const ctx = canvas.getContext('2d');
            const image = canvas.createImage();

            image.onload = () => {
              ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
              const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
              resolve({
                pixelData: imageData.data,
                width: targetWidth,
                height: targetHeight
              });
            };

            image.onerror = () => {
              // 降级到普通 Canvas
              getPixelDataViaCanvas(imagePath, targetWidth, targetHeight)
                .then(resolve)
                .catch(reject);
            };

            image.src = imagePath;
            return;
          } catch (e) {
            console.warn('[getPixelDataFromImage] OffscreenCanvas 失败，尝试降级方案');
          }
        }

        // 降级方案：使用普通 Canvas
        getPixelDataViaCanvas(imagePath, targetWidth, targetHeight)
          .then(resolve)
          .catch(reject);
      },
      fail(err) {
        reject(new Error('获取图片信息失败: ' + (err.errMsg || '未知错误')));
      }
    });
  });
}

/**
 * 降级方案：使用普通 Canvas 获取像素数据
 */
function getPixelDataViaCanvas(imagePath, width, height) {
  return new Promise((resolve, reject) => {
    const query = wx.createSelectorQuery();
    query.select('#pixel-canvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0] || !res[0].node) {
          reject(new Error('Canvas 节点不可用，请确保页面包含 <canvas id="pixel-canvas"> 元素'));
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
 * @param {number} [params.vibrantScale=0] - 鲜艳度：-10到10（-10=最柔和，0=原色，10=最鲜艳）
 * @param {Function} [params.onProgress] - 进度回调函数（可选）
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
    vibrantScale = 0,
    onProgress = null
  } = params;

  try {
    // 参数验证
    if (!imageUrl) {
      return createErrorResponse(ErrorCodes.MISSING_REQUIRED_PARAM, '缺少必要参数：imageUrl');
    }

    // 进度反馈：开始
    if (onProgress) {
      onProgress({ stage: 'start', percent: 0, message: '开始处理...' });
    }

    // 参数范围校验
    const validGridSize = Math.max(5, Math.min(50, Math.round(gridSize)));
    const validThreshold = Math.max(0, Math.min(291, Math.round(mergeThreshold)));
    const validVibrant = Math.max(-10, Math.min(10, vibrantScale));

    // 进度反馈：加载图片
    if (onProgress) {
      onProgress({ stage: 'loading', percent: 10, message: '加载图片...' });
    }

    // 获取像素数据
    let pixelData, width, height;
    try {
      const result = await getPixelDataFromImage(imageUrl);
      pixelData = result.pixelData;
      width = result.width;
      height = result.height;
    } catch (e) {
      // 根据错误类型返回不同的错误码
      if (e.message.includes('wx API 不可用')) {
        return createErrorResponse(ErrorCodes.WX_API_NOT_AVAILABLE, e.message);
      } else if (e.message.includes('获取图片信息失败')) {
        return createErrorResponse(ErrorCodes.IMAGE_NOT_FOUND, e.message);
      } else if (e.message.includes('图片加载失败')) {
        return createErrorResponse(ErrorCodes.IMAGE_LOAD_FAILED, e.message);
      } else {
        return createErrorResponse(ErrorCodes.IMAGE_LOAD_FAILED, '无法读取图片：' + e.message);
      }
    }

    // 进度反馈：处理图片
    if (onProgress) {
      onProgress({ stage: 'processing', percent: 30, message: `使用${processMode === 'mosaic' ? '马赛克' : '卡通'}模式处理图片...` });
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
      // 将 vibrantScale (-10 到 10) 转换为 processSimple 需要的 vibrant 参数
      // -10 到 0 → 柔和模式 (0.5 到 0)
      // 0 到 10 → 鲜艳模式 (0 到 0.5)
      let vibrantParam;
      if (validVibrant < 0) {
        // 柔和模式：-10 → 0.5, 0 → 0
        vibrantParam = -validVibrant / 20;  // 0 到 0.5
      } else if (validVibrant > 0) {
        // 鲜艳模式：0 → 0, 10 → 0.5
        vibrantParam = validVibrant / 20;  // 0 到 0.5
      } else {
        vibrantParam = 0;  // 原色
      }

      mosaicResult = processSimple(
        pixelData,
        width,
        height,
        validGridSize,
        validThreshold,
        vibrantParam
      );
    }

    if (!mosaicResult || !mosaicResult.gridData) {
      return createErrorResponse(ErrorCodes.ALGORITHM_NO_DATA, '图纸生成失败：算法返回空数据');
    }

    const { gridData, cols, rows } = mosaicResult;
    const mosaicId = generateMosaicId();

    // 进度反馈：计算统计
    if (onProgress) {
      onProgress({ stage: 'calculating', percent: 70, message: '计算颜色统计...' });
    }

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

    // 进度反馈：完成
    if (onProgress) {
      onProgress({ stage: 'complete', percent: 100, message: '图纸生成完成！' });
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
    return createErrorResponse(ErrorCodes.ALGORITHM_ERROR, error.message || '生成图纸时发生错误');
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
      return createErrorResponse(ErrorCodes.MISSING_REQUIRED_PARAM, '缺少必要参数：mosaicId');
    }

    const mosaicData = mosaicStore.get(mosaicId);
    if (!mosaicData) {
      return createErrorResponse(ErrorCodes.DATA_NOT_FOUND, '图纸不存在或已过期，请重新生成');
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
    return createErrorResponse(ErrorCodes.STORAGE_ERROR, error.message || '获取统计信息时发生错误');
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
      return createErrorResponse(ErrorCodes.MISSING_REQUIRED_PARAM, '缺少必要参数：mosaicId');
    }

    const mosaicData = mosaicStore.get(mosaicId);
    if (!mosaicData) {
      return createErrorResponse(ErrorCodes.DATA_NOT_FOUND, '图纸不存在或已过期，请重新生成');
    }

    const colorStats = mosaicData.colorStats;
    const totalCells = mosaicData.cols * mosaicData.rows;

    let content = '';

    if (format === 'csv') {
      // CSV 格式（添加 BOM 头以支持 Excel 正确识别 UTF-8）
      content = '﻿色号,颜色,数量\n';
      colorStats.forEach(item => {
        content += `${item.code},${item.hex},${item.count}\n`;
      });
    } else if (format === 'text') {
      // 纯文本格式
      content = '拼豆采购清单\n';
      content += '================\n\n';
      colorStats.forEach((item, index) => {
        content += `${index + 1}. ${item.code} (${item.hex}): ${item.count} 个\n`;
      });
      content += '\n----------------\n';
      content += `总计: ${colorStats.length} 种颜色, ${totalCells} 个拼豆\n`;
    } else {
      // 默认使用 CSV 格式
      content = '﻿色号,颜色,数量\n';
      colorStats.forEach(item => {
        content += `${item.code},${item.hex},${item.count}\n`;
      });
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
    return createErrorResponse(ErrorCodes.STORAGE_ERROR, error.message || '生成采购清单时发生错误');
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
      return createErrorResponse(ErrorCodes.MISSING_REQUIRED_PARAM, '缺少必要参数：mosaicId');
    }

    const mosaicData = mosaicStore.get(mosaicId);
    if (!mosaicData) {
      return createErrorResponse(ErrorCodes.DATA_NOT_FOUND, '图纸不存在或已过期，请重新生成');
    }

    // 检查 Canvas API 是否可用
    if (typeof wx.createOffscreenCanvas !== 'function') {
      return createErrorResponse(ErrorCodes.CANVAS_NOT_AVAILABLE, '当前环境不支持 Canvas 导出，请使用小程序原生导出功能');
    }

    const { gridData, cols, rows, colorStats } = mosaicData;

    // 计算导出尺寸
    const cellSize = 20; // 每个格子的像素大小
    const statsHeight = includeStats ? colorStats.length * 30 + 50 : 0;
    const canvasWidth = cols * cellSize;
    const canvasHeight = rows * cellSize + statsHeight;

    // 限制画布尺寸，避免超出限制
    const MAX_CANVAS_SIZE = 4096;
    if (canvasWidth > MAX_CANVAS_SIZE || canvasHeight > MAX_CANVAS_SIZE) {
      return createErrorResponse(ErrorCodes.CANVAS_SIZE_LIMIT, `图纸尺寸过大 (${canvasWidth}x${canvasHeight})，超出导出限制 (${MAX_CANVAS_SIZE}px)`);
    }

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
        ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);

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
    if (includeStats && colorStats.length > 0) {
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
          resolve(createErrorResponse(ErrorCodes.CANVAS_EXPORT_FAILED, '导出图片失败：' + (err.errMsg || '未知错误')));
        }
      });
    });

  } catch (error) {
    console.error('[exportMosaicPNG] 错误:', error);
    return createErrorResponse(ErrorCodes.CANVAS_EXPORT_FAILED, error.message || '导出图片时发生错误');
  }
}

/**
 * 原子接口 5: 获取图纸详细信息
 *
 * @param {Object} params - 参数对象
 * @param {string} params.mosaicId - 图纸ID
 * @param {boolean} [params.includeGridData=false] - 是否包含网格数据（数据量较大）
 * @returns {Promise<Object>} 图纸详细信息
 */
async function getMosaicDetail(params) {
  const { mosaicId, includeGridData = false } = params;

  try {
    if (!mosaicId) {
      return createErrorResponse(ErrorCodes.MISSING_REQUIRED_PARAM, '缺少必要参数：mosaicId');
    }

    const mosaicData = mosaicStore.get(mosaicId);
    if (!mosaicData) {
      return createErrorResponse(ErrorCodes.DATA_NOT_FOUND, '图纸不存在或已过期，请重新生成');
    }

    const { gridData, cols, rows, colorStats, gridSize, mergeThreshold, processMode, imageUrl, removeEdge, createdAt } = mosaicData;

    // 构建基本信息
    const detail = {
      mosaicId,
      cols,
      rows,
      totalCells: cols * rows,
      colorCount: colorStats.length,
      gridSize,
      mergeThreshold,
      processMode,
      removeEdge,
      imageUrl,
      createdAt,
      age: Date.now() - createdAt,
      colorStats
    };

    // 如果需要包含网格数据
    if (includeGridData) {
      // 提取网格中的色号信息（不包含完整的 pixelData，节省传输量）
      const gridCodes = [];
      for (let row = 0; row < rows; row++) {
        const rowCodes = [];
        for (let col = 0; col < cols; col++) {
          const cell = gridData[row] && gridData[row][col];
          if (cell && cell.markCode) {
            rowCodes.push({
              col,
              code: cell.markCode,
              hex: cell.markHex
            });
          }
        }
        gridCodes.push({ row, cells: rowCodes });
      }
      detail.gridData = gridCodes;
    }

    return {
      success: true,
      data: detail
    };

  } catch (error) {
    console.error('[getMosaicDetail] 错误:', error);
    return createErrorResponse(ErrorCodes.STORAGE_ERROR, error.message || '获取图纸详情时发生错误');
  }
}

/**
 * 原子接口 6: 删除图纸数据
 *
 * @param {Object} params - 参数对象
 * @param {string} params.mosaicId - 图纸ID
 * @returns {Promise<Object>} 删除结果
 */
async function deleteMosaic(params) {
  const { mosaicId } = params;

  try {
    if (!mosaicId) {
      return createErrorResponse(ErrorCodes.MISSING_REQUIRED_PARAM, '缺少必要参数：mosaicId');
    }

    if (!mosaicStore.has(mosaicId)) {
      return createErrorResponse(ErrorCodes.DATA_NOT_FOUND, '图纸不存在或已被删除');
    }

    mosaicStore.delete(mosaicId);

    return {
      success: true,
      data: {
        mosaicId,
        message: '图纸已成功删除'
      }
    };

  } catch (error) {
    console.error('[deleteMosaic] 错误:', error);
    return createErrorResponse(ErrorCodes.STORAGE_ERROR, error.message || '删除图纸时发生错误');
  }
}

/**
 * 导出所有原子接口
 */
module.exports = {
  generateBeadMosaic,
  getColorStats,
  getPurchaseList,
  exportMosaicPNG,
  suggestProcessingParams,
  getMosaicDetail,
  deleteMosaic
};
