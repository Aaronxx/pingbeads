const fs = require('fs');
const path = 'D:\\workspace\\pinbeans\\miniprogram\\src\\components\\mosaicCanvas\\mosaicCanvas.js';

let content = fs.readFileSync(path, 'utf8');

// Replace 1: gridInfo in setData - remove gridData
content = content.replace(
  /gridInfo: \{ gridData: mergedGrid, cols: result\.cols, rows: result\.rows, gridSize: qualityGridSize \}/g,
  'gridInfo: { cols: result.cols, rows: result.rows, gridSize: qualityGridSize }'
);

// Replace 2: triggerEvent - add flatCells
content = content.replace(
  /triggerEvent\('mosaicGenerated', \{ \n        gridInfo: \{ gridData: mergedGrid, cols: result\.cols, rows: result\.rows, gridSize: qualityGridSize \} \n      \}\);/g,
  `triggerEvent('mosaicGenerated', { 
        gridInfo: { cols: result.cols, rows: result.rows, gridSize: qualityGridSize },
        flatCells: flatCells
      });`
);

// Replace 3: cachedPixelData in setData
content = content.replace(
  /cachedPixelData: imageData\.data,\n                /g,
  ''
);

fs.writeFileSync(path, content, 'utf8');
console.log('Done');