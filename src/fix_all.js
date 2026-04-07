const fs = require('fs');

// Fix mosaicCanvas.js
const mosaicPath = 'D:/workspace/pinbeans/miniprogram/src/components/mosaicCanvas/mosaicCanvas.js';
let mosaicContent = fs.readFileSync(mosaicPath, 'utf8');

// 1. Replace gridInfo in setData - remove gridData
mosaicContent = mosaicContent.replace(
  /gridInfo: \{ gridData: mergedGrid, cols: result\.cols, rows: result\.rows, gridSize: qualityGridSize \}/g,
  'gridInfo: { cols: result.cols, rows: result.rows, gridSize: qualityGridSize }'
);

// 2. Replace triggerEvent - add flatCells  
mosaicContent = mosaicContent.replace(
  /this\.triggerEvent\('mosaicGenerated', \{ \n        gridInfo: \{ cols: result\.cols, rows: result\.rows, gridSize: qualityGridSize \} \n      \}\);/g,
  `this.triggerEvent('mosaicGenerated', { 
        gridInfo: { cols: result.cols, rows: result.rows, gridSize: qualityGridSize },
        flatCells: flatCells
      });`
);

fs.writeFileSync(mosaicPath, mosaicContent, 'utf8');
console.log('mosaicCanvas.js fixed');

// Fix index.js
const indexPath = 'D:/workspace/pinbeans/miniprogram/src/pages/index/index.js';
let indexContent = fs.readFileSync(indexPath, 'utf8');

// 1. onMosaicGenerated - extract flatCells
indexContent = indexContent.replace(
  'const { gridInfo } = e.detail;',
  'const { gridInfo, flatCells } = e.detail;'
);

// 2. onMosaicGenerated - save flatCells
indexContent = indexContent.replace(
  'mosaicData: gridInfo,\n      currentStep: 2',
  'mosaicData: gridInfo,\n      flatCells: flatCells || [],\n      currentStep: 2'
);

// 3. exportPNG - get flatCells
indexContent = indexContent.replace(
  'const { gridData, cols, rows, gridSize } = this.data.mosaicData;',
  'const { flatCells } = this.data;\n    const { cols, rows, gridSize } = this.data.mosaicData;'
);

// 4. Replace nested loop with flatCells.forEach
indexContent = indexContent.replace(
  '// 1. 绘制马赛克主体（使用放大后的格子）\n        for (let row = 0; row < rows; row++) {\n          for (let col = 0; col < cols; col++) {\n            const cell = gridData[row][col];\n            if (cell) {\n              const x = col * exportGridSize;\n              const y = row * exportGridSize;',
  '// 1. 绘制马赛克主体\n        flatCells.forEach((cell) => {\n          const x = cell.x * exportScale;\n          const y = cell.y * exportScale;'
);

// 5. Replace fillRect with size calculation
indexContent = indexContent.replace(
  'ctx.fillRect(x, y, exportGridSize, exportGridSize);',
  'const size = gridSize * exportScale;\n          ctx.fillRect(x, y, size, size);'
);

// 6. Replace closing braces and text position  
indexContent = indexContent.replace(
  'ctx.fillText(cell.markCode, x + exportGridSize / 2, y + exportGridSize / 2);\n              }\n            }\n          }\n        }',
  'ctx.fillText(cell.markCode, x + size / 2, y + size / 2);\n        });'
);

fs.writeFileSync(indexPath, indexContent, 'utf8');
console.log('index.js fixed');

console.log('All files fixed!');