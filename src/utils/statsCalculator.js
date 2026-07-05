const { formatMarkCode } = require('./colorHelpers');

function emptyStats() {
  return {
    colorCount: 0,
    totalCount: 0,
    sortedByCount: [],
    sortedByCode: [],
    simpleList: []
  };
}

function toStats(colorCounts) {
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

function calculateGridStats(gridData, rows, cols, options = {}) {
  if (!gridData || !rows || !cols) return emptyStats();

  const ignoreEdge = options.ignoreEdge !== false;
  const normalizeCode = options.normalizeCode === true;
  const includeOriginalCode = options.includeOriginalCode === true;
  const colorCounts = {};

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = gridData[row] && gridData[row][col];
      if (!cell || !cell.markCode) continue;
      if (ignoreEdge && cell.isEdge) continue;

      const rawCode = cell.markCode;
      const code = normalizeCode ? formatMarkCode(rawCode) : rawCode;

      if (!colorCounts[code]) {
        colorCounts[code] = {
          code,
          hex: cell.markHex || '#000000',
          count: 0
        };
        if (includeOriginalCode) {
          colorCounts[code].originalCode = rawCode;
        }
      }
      colorCounts[code].count++;
    }
  }

  return toStats(colorCounts);
}

function calculateStats(mosaicData) {
  if (!mosaicData || !mosaicData.gridData) return emptyStats();
  const rows = mosaicData.rows || mosaicData.gridData.length;
  const cols = mosaicData.cols || (mosaicData.gridData[0] ? mosaicData.gridData[0].length : 0);
  return calculateGridStats(mosaicData.gridData, rows, cols);
}

function calculateTotalCount(mosaicData) {
  // 性能：直接遍历计数，避免调用 calculateStats 触发完整统计重建
  // （原实现会构建 colorCounts 对象、两次排序、生成 simpleList，仅为取一个数字）
  // 语义对齐 calculateGridStats 默认行为：ignoreEdge=true（跳过 isEdge 格子）
  if (!mosaicData || !mosaicData.gridData) return 0;
  const rows = mosaicData.rows || mosaicData.gridData.length;
  const cols = mosaicData.cols || (mosaicData.gridData[0] ? mosaicData.gridData[0].length : 0);
  let count = 0;
  for (let row = 0; row < rows; row++) {
    const rowData = mosaicData.gridData[row];
    if (!rowData) continue;
    for (let col = 0; col < cols; col++) {
      const cell = rowData[col];
      if (!cell || !cell.markCode) continue;
      if (cell.isEdge) continue;
      count++;
    }
  }
  return count;
}

function generatePurchaseListCSV(stats) {
  if (!stats || !stats.sortedByCount) return '';
  const lines = ['色号,十六进制颜色,数量'];
  for (const item of stats.sortedByCount) {
    lines.push(`${item.code},${item.hex},${item.count}`);
  }
  return lines.join('\n');
}

function generateSimpleList(stats) {
  if (!stats || !stats.sortedByCount) return [];
  return stats.sortedByCount.map(item => ({
    code: item.code,
    hex: item.hex,
    count: item.count
  }));
}

function calculateColorCount(stats) {
  if (!stats || !stats.sortedByCount) return 0;
  return stats.sortedByCount.length;
}

module.exports = {
  calculateStats,
  calculateGridStats,
  calculateTotalCount,
  generatePurchaseListCSV,
  generateSimpleList,
  calculateColorCount
};
