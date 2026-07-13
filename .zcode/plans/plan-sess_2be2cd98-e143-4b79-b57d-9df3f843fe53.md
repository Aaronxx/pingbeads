## 快照导出：中心点 + 可见格子数方案

### 核心思路

1. **中心点格子**：wrapper 中心在 container 内的坐标 = canvas 物理坐标，用 renderToCanvas 公式算格子
2. **可见格子数**：`canvasWidth / (gridSize * baseScale * userScale)`（CSS 像素 / 屏幕上每格大小）
3. 从中心向两侧扩展

### 具体公式

```
// boundingClientRect 获取 wrapper 和 container 的位置
centerPhysX = wrapperRect.left + wrapperRect.width/2 - containerRect.left
centerPhysY = wrapperRect.top + wrapperRect.height/2 - containerRect.top

// renderToCanvas 公式（完全复用）
baseScale = min(canvasWidth / (cols*gridSize), canvasHeight / (rows*gridSize), 1)
scale = baseScale * userScale
actualCanvasWidth = canvasNode.width
baseOffsetX = (actualCanvasWidth - cols*gridSize*scale) / 2
offsetX = baseOffsetX + data.offsetX
cellSize = gridSize * scale

// 中心格子
centerCol = (centerPhysX - offsetX) / cellSize
centerRow = (centerPhysY - offsetY) / cellSize

// 可见格子数（屏幕上每格大小 = cellSize / userScale * userScale = cellSize，不对...）
// 简单方式：可见格子数 = canvasWidth / cellSize * userScale... 
// 不对。用户看到的每格在屏幕上的 CSS 大小 = gridSize * baseScale * userScale
// wrapper 宽度 = canvasWidth
// 可见格子数 = canvasWidth / (gridSize * baseScale * userScale)
// = canvasWidth / (cellSize * userScale / userScale) ... 

// 最简单：cellSize 是 canvas 物理像素中每格大小
// containerRect.width 是 canvas 物理总宽度
// wrapperRect.width 是可见宽度（CSS像素）
// container 内可见宽度 = wrapperRect.width（因为 boundingClientRect 已含 transform）
// 可见格子数 = wrapperRect.width / cellSize

halfCols = wrapperRect.width / cellSize / 2
halfRows = wrapperRect.height / cellSize / 2

startCol = floor(centerCol - halfCols)
endCol = ceil(centerCol + halfCols)
startRow = floor(centerRow - halfRows)
endRow = ceil(centerRow + halfRows)
```

### 涉及文件
- `src/pages/index/index.js`：重写 exportSnapshot 的格子范围计算部分

### 优势
- 中心点 + 半径的方式不依赖边缘精确对齐
- 完全复用 renderToCanvas 的 offsetX/cellSize 公式
- boundingClientRect 只用于获取中心点，不用于获取边缘