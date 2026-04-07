# 修改 exportPNG 函数使用 flatCells
$content = Get-Content 'D:\workspace\pinbeans\miniprogram\src\pages\index\index.js' -Raw

# 修改数据获取
$content = $content -replace 'const \{ gridData, cols, rows, gridSize \} = this\.data\.mosaicData;', 'const { flatCells } = this.data;
    const { cols, rows, gridSize } = this.data.mosaicData;'

# 修改循环 - 从 gridData[row][col] 改为 flatCells
$content = $content -replace 'const cell = gridData\[row\]\[col\];', 'const cell = flatCells[i];'

# 修改循环范围
$content = $content -replace 'for \(let row = 0; row < rows; row\) \{
          for \(let col = 0; col < cols; col\\) \{', 'for (let i = 0; i < flatCells.length; i++) {'

# 修改坐标计算
$content = $content -replace 'const x = col \* exportGridSize;', '# const x calculated from cell'
$content = $content -replace 'const y = row \* exportGridSize;', '# const y calculated from cell'

# 计算统计
$content = $content -replace 'const stats = calculateStats\(this\.data\.mosaicData\);', 'const stats = { sortedByCount: [] };
    if (flatCells && flatCells.length > 0) {
      const colorCounts = {};
      flatCells.forEach(cell => {
        const code = cell.markCode;
        colorCounts[code] = (colorCounts[code] || 0) + 1;
      });
      stats.sortedByCount = Object.entries(colorCounts).map(([code, count]) => {
        const cell = flatCells.find(c => c.markCode === code);
        return { code, hex: cell ? cell.markHex : '#FFFFFF', count };
      }).sort((a, b) => b.count - a.count);
    }'

Set-Content 'D:\workspace\pinbeans\miniprogram\src\pages\index\index.js' -Value $content -NoNewline