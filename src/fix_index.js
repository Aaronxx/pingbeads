const fs = require('fs');
const path = 'D:/workspace/pinbeans/miniprogram/src/pages/index/index.js';

let content = fs.readFileSync(path, 'utf8');

// Modify onMosaicGenerated to save flatCells
content = content.replace(
  /const \{ gridInfo \} = e\.detail;\n    this\.setData\(\{\n      mosaicData: gridInfo,\n      currentStep: 2\n    \}\);/,
  'const { gridInfo, flatCells } = e.detail;\n    this.setData({\n      mosaicData: gridInfo,\n      flatCells: flatCells || [],\n      currentStep: 2\n    });'
);

// Modify exportPNG to use flatCells instead of gridData
content = content.replace(
  /const \{ gridData, cols, rows, gridSize \} = this\.data\.mosaicData;/,
  'const { flatCells } = this.data;\n    const { cols, rows, gridSize } = this.data.mosaicData;'
);

fs.writeFileSync(path, content, 'utf8');
console.log('Done - index.js updated');