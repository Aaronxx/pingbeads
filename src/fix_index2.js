const fs = require('fs');
const path = 'D:/workspace/pinbeans/miniprogram/src/pages/index/index.js';

let content = fs.readFileSync(path, 'utf8');

// Modification 1: onMosaicGenerated - save flatCells
content = content.replace(
  'const { gridInfo } = e.detail;',
  'const { gridInfo, flatCells } = e.detail;'
);

content = content.replace(
  'mosaicData: gridInfo,\n      currentStep: 2',
  'mosaicData: gridInfo,\n      flatCells: flatCells || [],\n      currentStep: 2'
);

// Modification 2: exportPNG - use flatCells
content = content.replace(
  'const { gridData, cols, rows, gridSize } = this.data.mosaicData;',
  'const { flatCells } = this.data;\n    const { cols, rows, gridSize } = this.data.mosaicData;'
);

fs.writeFileSync(path, content, 'utf8');
console.log('Done - basic changes');