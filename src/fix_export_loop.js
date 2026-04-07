const fs = require('fs');
const path = 'D:/workspace/pinbeans/miniprogram/src/pages/index/index.js';

let content = fs.readFileSync(path, 'utf8');

// Find and replace the nested loop - use simpler matching
const oldLoop = `// 1. 绘制马赛克主体（使用放大后的格子）
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const cell = gridData[row][col];
            if (cell) {`;

const newLoop = `// 1. 绘制马赛克主体
        flatCells.forEach((cell) => {`;

content = content.replace(oldLoop, newLoop);

// Need to also replace the closing part - let's be more precise
const oldClosing = `            }
          }
        }
        
        // 2. 绘制统计行`;

const newClosing = `        });
        
        // 2. 绘制统计行`;

content = content.replace(oldClosing, newClosing);

// Also need to update x and y inside
content = content.replace('const x = col * exportGridSize;', 'const x = cell.x * exportScale;');
content = content.replace('const y = row * exportGridSize;', 'const y = cell.y * exportScale;');
content = content.replace('ctx.fillRect(x, y, exportGridSize, exportGridSize);', 'const size = gridSize * exportScale;\n          ctx.fillRect(x, y, size, size);');

fs.writeFileSync(path, content, 'utf8');
console.log('Done - export loop updated');