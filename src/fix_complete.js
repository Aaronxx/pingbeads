const fs = require('fs');
const path = 'D:/workspace/pinbeans/miniprogram/src/pages/index/index.js';

let content = fs.readFileSync(path, 'utf8');

// Change 1: onMosaicGenerated - extract flatCells from e.detail
content = content.replace(
  'const { gridInfo } = e.detail;',
  'const { gridInfo, flatCells } = e.detail;'
);

// Change 2: onMosaicGenerated - save flatCells
content = content.replace(
  'mosaicData: gridInfo,\n      currentStep: 2',
  'mosaicData: gridInfo,\n      flatCells: flatCells || [],\n      currentStep: 2'
);

// Change 3: exportPNG - get flatCells from this.data
content = content.replace(
  'const { gridData, cols, rows, gridSize } = this.data.mosaicData;',
  'const { flatCells } = this.data;\n    const { cols, rows, gridSize } = this.data.mosaicData;'
);

// Change 4: Replace the nested loop with flatCells.forEach
// Find the start of drawing loop
const oldLoop = `// 1. 绘制马赛克主体（使用放大后的格子）
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const cell = gridData[row][col];
            if (cell) {
              const x = col * exportGridSize;
              const y = row * exportGridSize;
              
              // 绘制色块
              ctx.fillStyle = cell.markHex;
              ctx.fillRect(x, y, exportGridSize, exportGridSize);
              
              // 绘制色号（根据放大后的格子调整字号）
              if (exportGridSize >= 15) {
                // 根据色块颜色自动选择文字颜色
                const isLight = this.isLightColor(cell.markHex);
                ctx.fillStyle = isLight ? '#333' : '#fff';
                ctx.font = \`bold \${Math.max(12, exportGridSize * 0.4)}px sans-serif\`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(cell.markCode, x + exportGridSize / 2, y + exportGridSize / 2);
              }
            }
          }
        }`;

const newLoop = `// 1. 绘制马赛克主体
        flatCells.forEach((cell) => {
          const x = cell.x * exportScale;
          const y = cell.y * exportScale;
          const size = gridSize * exportScale;
          
          ctx.fillStyle = cell.markHex;
          ctx.fillRect(x, y, size, size);
          
          if (exportGridSize >= 15) {
            const isLight = this.isLightColor(cell.markHex);
            ctx.fillStyle = isLight ? '#333' : '#fff';
            ctx.font = \`bold \${Math.max(12, exportGridSize * 0.4)}px sans-serif\`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(cell.markCode, x + size / 2, y + size / 2);
          }
        });`;

content = content.replace(oldLoop, newLoop);

fs.writeFileSync(path, content, 'utf8');
console.log('Done - all changes applied');