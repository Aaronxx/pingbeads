const fs = require('fs');
const path = 'D:/workspace/pinbeans/miniprogram/src/pages/index/index.js';

let content = fs.readFileSync(path, 'utf8');
let changes = 0;

// 1. onMosaicGenerated - extract flatCells
if (content.includes('const { gridInfo } = e.detail;')) {
  content = content.replace('const { gridInfo } = e.detail;', 'const { gridInfo, flatCells } = e.detail;');
  changes++;
}

// 2. onMosaicGenerated - save flatCells
if (content.includes('mosaicData: gridInfo,\n      currentStep: 2')) {
  content = content.replace('mosaicData: gridInfo,\n      currentStep: 2', 'mosaicData: gridInfo,\n      flatCells: flatCells || [],\n      currentStep: 2');
  changes++;
}

// 3. exportPNG - get flatCells from this.data
if (content.includes('const { gridData, cols, rows, gridSize } = this.data.mosaicData;')) {
  content = content.replace('const { gridData, cols, rows, gridSize } = this.data.mosaicData;', 'const { flatCells } = this.data;\n    const { cols, rows, gridSize } = this.data.mosaicData;');
  changes++;
}

// 4. Replace nested loop with flatCells.forEach
const oldLoopStart = '// 1. 绘制马赛克主体（使用放大后的格子）\n        for (let row = 0; row < rows; row++) {\n          for (let col = 0; col < cols; col++) {\n            const cell = gridData[row][col];\n            if (cell) {';
const newLoopStart = '// 1. 绘制马赛克主体\n        flatCells.forEach((cell) => {';
content = content.replace(oldLoopStart, newLoopStart);
if (content.includes(newLoopStart)) changes++;

// 5. Replace closing braces
const oldLoopEnd = '            }\n          }\n        }\n        \n        // 2. 绘制统计行';
const newLoopEnd = '        });\n        \n        // 2. 绘制统计行';
content = content.replace(oldLoopEnd, newLoopEnd);

// 6. Fix x, y calculations
content = content.replace('const x = col * exportGridSize;', 'const x = cell.x * exportScale;');
content = content.replace('const y = row * exportGridSize;', 'const y = cell.y * exportScale;');

fs.writeFileSync(path, content, 'utf8');
console.log('Changes applied:', changes);