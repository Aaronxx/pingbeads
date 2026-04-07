const fs = require('fs');
const path = 'D:/workspace/pinbeans/miniprogram/src/pages/index/index.js';

let content = fs.readFileSync(path, 'utf8');

// Fix: add flatCells to setData in onMosaicGenerated
if (!content.includes('flatCells: flatCells || []')) {
  content = content.replace(
    'mosaicData: gridInfo,\n      currentStep: 2',
    'mosaicData: gridInfo,\n      flatCells: flatCells || [],\n      currentStep: 2'
  );
  console.log('Added flatCells to setData');
}

fs.writeFileSync(path, content, 'utf8');
console.log('Done');