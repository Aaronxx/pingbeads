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
  if (!mosaicData || !mosaicData.gridData) {
    return {
      colorCount: 0,
      totalCount: 0,
      sortedByCount: [],
      sortedByCode: [],
      simpleList: []
    };
  }

  const gridData = mosaicData.gridData;
  const colorCounts = {};

  // 遍历所有网格，统计每种颜色的数量
  for (let row = 0; row < gridData.length; row++) {
    const rowData = gridData[row];
    if (!rowData) continue;
    for (let col = 0; col < rowData.length; col++) {
      const cell = rowData[col];
      if (!cell || !cell.markCode) continue;
      
      const code = cell.markCode;
      if (!colorCounts[code]) {
        colorCounts[code] = {
          code: cell.markCode,
          hex: cell.markHex || '#000000',
          count: 0
        };
      }
      colorCounts[code].count++;
    }
  }

  const statsArray = Object.values(colorCounts);
  const sortedByCount = [...statsArray].sort((a, b) => b.count - a.count);
  const sortedByCode = [...statsArray].sort((a, b) => a.code.localeCompare(b.code));
  const totalCount = sortedByCount.reduce((sum, item) => sum + item.count, 0);

  return {
    colorCount: sortedByCount.length,
    totalCount,
    sortedByCount,
    sortedByCode,
    simpleList: sortedByCount.map(item => ({
      code: item.code,
      hex: item.hex,
      count: item.count
    }))
  };
}

function calculateTotalCount(mosaicData) {
  if (!mosaicData || !mosaicData.gridData) {
    return 0;
  }

  let total = 0;
  for (const row of mosaicData.gridData) {
    if (row) total += row.length;
  }
  return total;
}

function generatePurchaseListCSV(stats) {
  if (!stats || !stats.sortedByCount) {
    return '';
  }

  const lines = ['色号,十六进制颜色,数量'];
  for (const item of stats.sortedByCount) {
    lines.push(`${item.code},${item.hex},${item.count}`);
  }
  return lines.join('\n');
}

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