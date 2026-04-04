/**
 * 统计计算模块
 * 负责统计色块数量和生成采购清单
 */

/**
 * 计算色块统计信息
 * @param {Object} mosaicData - 马赛克数据对象
 * @returns {Object} 统计结果对象
 */
function calculateStats(mosaicData) {
  console.log('[statsCalculator] 开始计算, mosaicData:', !!mosaicData, 'gridData:', !!mosaicData?.gridData);

  if (!mosaicData || !mosaicData.gridData) {
    console.log('[statsCalculator] 数据无效，返回空统计');
    return {
      colorCount: 0,
      totalCount: 0,
      sortedByCount: [],
      sortedByCode: [],
      purchaseList: '',
      simpleList: []
    };
  }

  const gridData = mosaicData.gridData;
  console.log('[statsCalculator] gridData 行数:', gridData.length);

  const colorCounts = {};

  // 遍历所有网格，统计每种颜色的数量
  let cellCount = 0;
  for (const row of gridData) {
    for (const cell of row) {
      cellCount++;
      const code = cell.markCode;
      console.log('[statsCalculator] cell:', code, cell.markHex);
      if (!colorCounts[code]) {
        colorCounts[code] = {
          code: cell.markCode,
          hex: cell.markHex,
          count: 0
        };
      }
      colorCounts[code].count++;
    }
  }
  console.log('[statsCalculator] 总格子数:', cellCount, '颜色种类:', Object.keys(colorCounts).length);

  // 转换为数组
  const statsArray = Object.values(colorCounts);

  // 按数量降序排序
  const sortedByCount = [...statsArray].sort((a, b) => b.count - a.count);

  // 按色号排序
  const sortedByCode = [...statsArray].sort((a, b) => a.code.localeCompare(b.code));

  // 计算总数
  const totalCount = sortedByCount.reduce((sum, item) => sum + item.count, 0);

  // 生成 CSV 采购清单
  const purchaseList = [
    '色号,十六进制颜色,数量',
    ...sortedByCount.map(item => `${item.code},${item.hex},${item.count}`)
  ].join('\n');

  // 生成简化清单
  const simpleList = sortedByCount.map(item => ({
    code: item.code,
    hex: item.hex,
    count: item.count
  }));

  return {
    colorCount: sortedByCount.length,
    totalCount,
    sortedByCount,
    sortedByCode,
    purchaseList,
    simpleList
  };
}

/**
 * 计算总色块数量
 * @param {Object} mosaicData - 马赛克数据对象
 * @returns {number} 总色块数量
 */
function calculateTotalCount(mosaicData) {
  if (!mosaicData || !mosaicData.gridData) {
    return 0;
  }

  let total = 0;
  for (const row of mosaicData.gridData) {
    total += row.length;
  }
  return total;
}

/**
 * 生成 CSV 格式的采购清单
 * @param {Object} stats - 统计数据
 * @returns {string} CSV 字符串
 */
function generatePurchaseListCSV(stats) {
  if (!stats || !stats.sortedByCount) {
    return '';
  }

  const lines = [
    '色号,十六进制颜色,数量'
  ];

  for (const item of stats.sortedByCount) {
    lines.push(`${item.code},${item.hex},${item.count}`);
  }

  return lines.join('\n');
}

/**
 * 生成简化版采购清单（用于显示）
 * @param {Object} stats - 统计数据
 * @returns {Array} 简化清单数组
 */
function generateSimpleList(stats) {
  if (!stats || !stats.sortedByCount) {
    return [];
  }

  return stats.sortedByCount.map(item => ({
    code: item.code,
    hex: item.hex,
    count: item.count
  }));
}

/**
 * 计算使用颜色数量
 * @param {Object} stats - 统计数据
 * @returns {number} 使用的颜色数量
 */
function calculateColorCount(stats) {
  if (!stats || !stats.sortedByCount) {
    return 0;
  }
  return stats.sortedByCount.length;
}

module.exports = {
  calculateStats,
  calculateTotalCount,
  generatePurchaseListCSV,
  generateSimpleList,
  calculateColorCount
};
