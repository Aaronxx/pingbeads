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
const { setExcludeSpecial, setAntiGrayIntensity, fastFindClosestMarkColor, isSpecialColor, getAlternativeColor, getMarkColorInfoByCode } = require('./colorMapper');

/**
 * 阶段1预处理：对比度压缩
 * 以图像平均亮度为中心，压缩动态范围，削弱阴影和高光
 * @param {Uint8ClampedArray} pixelData
 * @param {number} width
 * @param {number} height
 * @param {number} strength - 压缩强度 0~1
 * @returns {Uint8ClampedArray} 处理后的像素数据（新数组，不修改原数据）
 */
function compressContrast(pixelData, width, height, strength) {
  if (!strength || strength <= 0) return pixelData;

  let sumLuma = 0;
  const len = width * height;
  for (let i = 0; i < pixelData.length; i += 4) {
    sumLuma += pixelData[i] * 0.299 + pixelData[i + 1] * 0.587 + pixelData[i + 2] * 0.114;
  }
  const avgLuma = sumLuma / len;
  const factor = 1 - strength;

  const result = new Uint8ClampedArray(pixelData);
  for (let i = 0; i < result.length; i += 4) {
    result[i]     = Math.max(0, Math.min(255, Math.round(avgLuma + (result[i]     - avgLuma) * factor)));
    result[i + 1] = Math.max(0, Math.min(255, Math.round(avgLuma + (result[i + 1] - avgLuma) * factor)));
    result[i + 2] = Math.max(0, Math.min(255, Math.round(avgLuma + (result[i + 2] - avgLuma) * factor)));
  }
  return result;
}

/**
 * 阶段2后处理：空间平滑（阴影消除 + 杂色清理）
 *
 * 两种触发条件（满足任一即替换）：
 * 1. 阴影：格子明显比邻居暗，且邻居有统一主色调
 * 2. 杂色：格子的色号在邻居中不存在或极少，而邻居有压倒性主色调
 *
 * @param {Array} gridData
 * @param {number} rows
 * @param {number} cols
 * @param {number} strength - 平滑强度 0~1
 */
function smoothShadows(gridData, rows, cols, strength) {
  if (!strength || strength <= 0) return;

  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const lumaThreshold = 30 * strength;

  for (let pass = 0; pass < 2; pass++) {
    const replacements = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = gridData[r] && gridData[r][c];
        if (!cell || !cell.markCode) continue;

        const neighborCodes = {};
        let avgNeighborLuma = 0, neighborCount = 0;
        let cellLuma = 0;

        for (const [dr, dc] of dirs) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          const n = gridData[nr] && gridData[nr][nc];
          if (!n || !n.markCode) continue;
          neighborCodes[n.markCode] = (neighborCodes[n.markCode] || 0) + 1;
          if (n.rawRgb) {
            avgNeighborLuma += n.rawRgb.r * 0.299 + n.rawRgb.g * 0.587 + n.rawRgb.b * 0.114;
            neighborCount++;
          }
        }
        if (neighborCount === 0) continue;
        avgNeighborLuma /= neighborCount;

        if (cell.rawRgb) {
          cellLuma = cell.rawRgb.r * 0.299 + cell.rawRgb.g * 0.587 + cell.rawRgb.b * 0.114;
        }

        // 找邻居中最常见的色号
        let bestCode = null, bestCount = 0;
        for (const code in neighborCodes) {
          if (neighborCodes[code] > bestCount) {
            bestCount = neighborCodes[code];
            bestCode = code;
          }
        }
        if (!bestCode || bestCode === cell.markCode) continue;

        // 条件1：阴影 — 格子明显比邻居暗，且邻居有统一主色调（≥2个同色）
        const isShadow = (avgNeighborLuma - cellLuma > lumaThreshold) && bestCount >= 2;

        // 条件2：杂色 — 格子的色号在邻居中不存在，而邻居有压倒性主色调（≥3个同色）
        const isNoise = !neighborCodes[cell.markCode] && bestCount >= 3;

        if (isShadow || isNoise) {
          replacements.push({ r, c, bestCode });
        }
      }
    }

    for (const { r, c, bestCode } of replacements) {
      const cell = gridData[r][c];
      const info = getMarkColorInfoByCode(bestCode);
      if (info) {
        cell.markCode = info.code;
        cell.markHex = info.hex;
        cell.markRgb = info.rgb;
      }
    }
    if (replacements.length === 0) break;
  }
}

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
      const shadowStr = (opts.shadowStrength || 0) / 100;

      // 阶段1预处理：对比度压缩（削弱阴影和高光）
      const processedPixels = compressContrast(pixelData, width, height, shadowStr);

      let result;
      if (ver === 'classic' || ver === 'perceptual') {
        const algo = getAlgorithm(ver);
        result = algo.processSimple(processedPixels, width, height, gridSize, mt, vs);
      } else {
        result = processSimple(processedPixels, width, height, gridSize, mt, vs);
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

      // 4. 阶段2后处理：阴影感知空间平滑
      const shadowStr = (opts.shadowStrength || 0) / 100;
      if (shadowStr > 0) {
        smoothShadows(gridData, rows, cols, shadowStr);
      }
    },

    /**
     * 仅替换特殊色（马赛克模式专用）
     * 不重映射色号、不应用鲜艳度、不做聚合
     * 保留 processMosaicV2 自己的色号映射结果
     *
     * @param {Array} gridData
     * @param {number} rows
     * @param {number} cols
     */
    replaceSpecialsOnly(gridData, rows, cols) {
      replaceSpecials(gridData, rows, cols, opts.algorithmVersion, opts.useSpecialColors);
    },
  };
}

module.exports = { createColorPipeline };
