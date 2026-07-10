/**
 * 色彩处理管道
 *
 * 把"像素 → 格子取色 → 色号映射 → 鲜艳度 → 聚合 → 特殊色替换"整条链
 * 封装成一个纯函数模块。调用方只需传入参数和像素数据。
 *
 * 两阶段设计：
 * - phase1: processPixels — 像素 → 格子取色(rawRgb) + 初始色号映射
 * - phase2: reapplyColors — 从 rawRgb 重新后处理（鲜艳度 + 聚合 + 特殊色替换）
 *
 * 所有路径（初始导入、切换算法、调节鲜艳度、切换特殊色）都调用
 * 同一个 reapplyColors，输入相同 → 输出必然一致。
 */

const { getAlgorithm } = require('./algorithms/index.js');
const { processSimple, aggregateSimilarColors, enhanceVibrant, reduceVibrant } = require('./imageProcessor');
const { setExcludeSpecial, setAntiGrayIntensity, fastFindClosestMarkColor, isSpecialColor, getAlternativeColor } = require('./colorMapper');

/**
 * 创建色彩处理管道
 * @param {Object} options
 * @param {string} options.algorithmVersion - 'classic' | 'current' | 'perceptual'
 * @param {number} options.vibrantScale - 鲜艳度 (-10 到 10)
 * @param {number} options.mergeThreshold - 聚合阈值
 * @param {boolean} options.useSpecialColors - 是否使用特殊色
 * @param {number} options.antiGrayIntensity - 浊色规避强度 (0-1)
 */
function createColorPipeline(options) {
  let opts = { ...options };

  // ========== 内部工具 ==========

  /** 根据算法版本获取 fastFindClosestMarkColor */
  function getFastFind(version) {
    if (version === 'classic' || version === 'perceptual') {
      return getAlgorithm(version).fastFindClosestMarkColor;
    }
    return fastFindClosestMarkColor;
  }

  /** 根据算法版本获取 aggregateSimilarColors */
  function getAggregate(version) {
    if (version === 'classic' || version === 'perceptual') {
      return getAlgorithm(version).aggregateSimilarColors;
    }
    return aggregateSimilarColors;
  }

  /** 根据算法版本获取 getAlternativeColor（classic 有独立的替代表） */
  function getGetAlt(version) {
    if (version === 'classic') {
      return getAlgorithm('classic').getAlternativeColor;
    }
    return getAlternativeColor;
  }

  /** 替换特殊色 */
  function replaceSpecials(gridData, rows, cols, version, useSpecial) {
    if (useSpecial) return;
    const getAlt = getGetAlt(version);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = gridData[row] && gridData[row][col];
        if (!cell || !cell.markCode) continue;
        if (isSpecialColor(cell.markCode)) {
          const alt = getAlt(cell.markCode);
          if (alt) {
            cell.markCode = alt.code;
            cell.markHex = alt.hex;
            cell.markRgb = alt.rgb;
          }
        }
      }
    }
  }

  // ========== 公开接口 ==========

  return {
    /**
     * 更新管道参数（不触发重处理，调用方需自行调用 reapplyColors）
     */
    update(newOptions) {
      opts = { ...opts, ...newOptions };
    },

    /**
     * 同步全局状态到 colorMapper（excludeSpecial / antiGrayIntensity）
     * 在 processPixels 和 reapplyColors 前调用
     */
    syncColorMapper() {
      setExcludeSpecial(!opts.useSpecialColors);
      setAntiGrayIntensity(opts.antiGrayIntensity || 0);
    },

    /**
     * 阶段 1：像素 → 格子取色 + 鲜艳度 + 初始色号映射
     * 完整复现 master 流程：取色 → 应用鲜艳度 → 映射色号
     * rawRgb 存未应用鲜艳度的取色结果，markCode 孔应用鲜艳度后的色号
     *
     * @param {Uint8ClampedArray} pixelData
     * @param {number} width
     * @param {number} height
     * @param {number} gridSize
     * @returns {{gridData: Array, rows: number, cols: number, gridSize: number}}
     */
    processPixels(pixelData, width, height, gridSize) {
      this.syncColorMapper();

      const ver = opts.algorithmVersion;
      const vs = opts.vibrantScale || 0;
      const mt = opts.mergeThreshold || 0;
      let result;

      if (ver === 'classic' || ver === 'perceptual') {
        const algo = getAlgorithm(ver);
        result = algo.processSimple(pixelData, width, height, gridSize, mt, vs);
      } else {
        result = processSimple(pixelData, width, height, gridSize, mt, vs);
      }

      return result;
    },

    /**
     * 阶段 2：从 rawRgb 重新后处理（鲜艳度 + 色号映射 + 聚合 + 特殊色替换）
     * 完整复现 processSimple 的色彩处理流程，但跳过像素取色（直接用已有的 rawRgb）
     *
     * @param {Array} gridData
     * @param {number} rows
     * @param {number} cols
     */
    reapplyColors(gridData, rows, cols) {
      this.syncColorMapper();

      const ver = opts.algorithmVersion;
      const vibrantScale = opts.vibrantScale || 0;
      const mt = opts.mergeThreshold || 0;
      const fastFind = getFastFind(ver);

      // 1. 从 rawRgb 应用鲜艳度并重新映射色号
      // 同步更新 originalRgb（K-means 聚类用 originalRgb 做聚类，必须反映鲜艳度变化）
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cell = gridData[row] && gridData[row][col];
          if (!cell || !cell.rawRgb) continue;

          let color = cell.rawRgb;
          if (vibrantScale > 0) {
            color = enhanceVibrant(color, vibrantScale / 10);
          } else if (vibrantScale < 0) {
            color = reduceVibrant(color, Math.abs(vibrantScale) / 10);
          }

          cell.originalRgb = color;
          const markColor = fastFind(color);
          cell.markCode = markColor.code;
          cell.markHex = markColor.hex;
          cell.markRgb = markColor.rgb;
        }
      }

      // 2. 聚合（在 RGB 空间聚类，保持和 master 一致的行为）
      if (mt > 0) {
        getAggregate(ver)(gridData, rows, cols, mt);
      }

      // 3. 替换特殊色
      replaceSpecials(gridData, rows, cols, ver, opts.useSpecialColors);
    },
  };
}

module.exports = { createColorPipeline };
