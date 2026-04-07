const fs = require('fs');
const path = 'D:\\workspace\\pinbeans\\miniprogram\\src\\components\\mosaicCanvas\\mosaicCanvas.js';

let content = fs.readFileSync(path, 'utf8');

// Add flatCells to triggerEvent
content = content.replace(
  /this\.triggerEvent\('mosaicGenerated', \{ \n        gridInfo: \{ cols: result\.cols, rows: result\.rows, gridSize: qualityGridSize \} \n      \}\);/g,
  `this.triggerEvent('mosaicGenerated', { 
        gridInfo: { cols: result.cols, rows: result.rows, gridSize: qualityGridSize },
        flatCells: flatCells
      });`
);

fs.writeFileSync(path, content, 'utf8');
console.log('Done - added flatCells to triggerEvent');