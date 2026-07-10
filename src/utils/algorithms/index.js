/**
 * 算法路由模块
 * 根据 algorithmVersion 分发到对应算法实现
 *
 * 三种算法：
 * - 'classic':    1bdbade 老算法（纯中位数 + 全色板 + 静态替代表）
 * - 'current':    当前 master 算法（中位数/加权平均混合 + 浊色规避）
 * - 'perceptual': 新算法（感知距离 redmean + 两阶段聚类 + 空间众数滤波）
 *
 * 统一接口：每种算法都导出 { processSimple, aggregateSimilarColors, fastFindClosestMarkColor }
 */

const classic = require('./classic.js');
const perceptual = require('./perceptual.js');

/**
 * 获取指定版本的算法模块
 * 'current' 模式延迟引用 imageProcessor/colorMapper，避免循环依赖
 * @param {string} version - 'classic' | 'current' | 'perceptual'
 * @returns {{ processSimple, aggregateSimilarColors, fastFindClosestMarkColor }}
 */
function getAlgorithm(version) {
  switch (version) {
    case 'classic':
      return classic;
    case 'perceptual':
      return perceptual;
    case 'current':
    default:
      // 延迟 require：避免 algorithms → imageProcessor → colorMapper 的循环依赖
      const imageProcessor = require('../imageProcessor');
      const colorMapper = require('../colorMapper');
      return {
        processSimple: imageProcessor.processSimple,
        aggregateSimilarColors: imageProcessor.aggregateSimilarColors,
        fastFindClosestMarkColor: colorMapper.fastFindClosestMarkColor
      };
  }
}

module.exports = {
  getAlgorithm,
  classic,
  perceptual
};
