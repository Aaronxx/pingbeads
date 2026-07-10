/**
 * 颜色处理 mixin
 *
 * 色彩算法逻辑已封装到 colorPipeline.js，此 mixin 仅保留 gridData 工具方法。
 * replaceSpecialColors / reapplyVibrantScale / resetToOriginalColors / _applyColorAndPreset
 * 已移至 mosaicCanvas.js 主文件通过 pipeline 调用。
 */
const { deepCloneGridData } = require('../../../utils/gridHelpers');

module.exports = {
  deepCloneGridData(gridData, rows, cols) {
    return deepCloneGridData(gridData, rows, cols);
  }
};
