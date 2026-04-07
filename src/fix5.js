const fs = require('fs');
const path = 'D:\\workspace\\pinbeans\\miniprogram\\src\\components\\mosaicCanvas\\mosaicCanvas.js';

let content = fs.readFileSync(path, 'utf8');
let count = 0;

// Replace setData gridInfo
content = content.replace(
  /gridInfo: \{ gridData: mergedGrid, cols: result\.cols, rows: result\.rows, gridSize: qualityGridSize \}/g,
  'gridInfo: { cols: result.cols, rows: result.rows, gridSize: qualityGridSize }'
);

// Replace triggerEvent
content = content.replace(
  /this\.triggerEvent\('mosaicGenerated', \{ \n        gridInfo: \{ gridData: mergedGrid, cols: result\.cols, rows: result\.rows, gridSize: qualityGridSize \} \n      \}\);/g,
  `this.triggerEvent('mosaicGenerated', { 
        gridInfo: { cols: result.cols, rows: result.rows, gridSize: qualityGridSize },
        flatCells: flatCells
      });`
);

// Remove cachedPixelData
content = content.replace(
  /cachedPixelData: imageData\.data,\n                /g,
  ''
);

fs.writeFileSync(path, content, 'utf8');
console.log('Done');