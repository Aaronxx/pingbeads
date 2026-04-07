const fs = require('fs');
const path = 'D:/workspace/pinbeans/miniprogram/src/pages/index/index.js';

let content = fs.readFileSync(path, 'utf8');
let changes = 0;

// 1. Modify onMosaicGenerated - add flatCells extraction
if (content.includes('const { gridInfo } = e.detail;')) {
  content = content.replace('const { gridInfo } = e.detail;', 'const { gridInfo, flatCells } = e.detail;');
  changes++;
}

// 2. Modify onMosaicGenerated - save flatCells to data  
if (content.includes('mosaicData: gridInfo,\n      currentStep: 2')) {
  content = content.replace('mosaicData: gridInfo,\n      currentStep: 2', 'mosaicData: gridInfo,\n      flatCells: flatCells || [],\n      currentStep: 2');
  changes++;
}

// 3. Modify exportPNG - get flatCells from this.data
if (content.includes('const { gridData, cols, rows, gridSize } = this.data.mosaicData;')) {
  content = content.replace('const { gridData, cols, rows, gridSize } = this.data.mosaicData;', 'const { flatCells } = this.data;\n    const { cols, rows, gridSize } = this.data.mosaicData;');
  changes++;
}

fs.writeFileSync(path, content, 'utf8');
console.log('Basic changes applied:', changes);