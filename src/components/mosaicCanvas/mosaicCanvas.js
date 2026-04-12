// components/mosaicCanvas/mosaicCanvas.js
const { processSimple, aggregateSimilarColors } = require('../../utils/imageProcessor');
const { findClosestMarkColor } = require('../../utils/colorMapper');

// 大区常量：每个大区包含 10x10 个色块
const REGION_SIZE = 10;

// 生成列编号：A, B, ..., Z, AA, AB, ...
function getColCode(colIndex) {
  let code = '';
  while (colIndex >= 0) {
    code = String.fromCharCode(65 + (colIndex % 26)) + code;
    colIndex = Math.floor(colIndex / 26) - 1;
  }
  return code;
}

// 解析大区编号（如 B1）-> 起始行列
function parseRegionCode(code) {
  if (!code) return null;
  // 提取列字母和行数字（不区分大小写）
  const match = code.toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;

  const colLetters = match[1];
  const rowNum = parseInt(match[2], 10);

  // 转换列字母为列索引（从 0 开始）
  let colIndex = 0;
  for (let i = 0; i < colLetters.length; i++) {
    colIndex = colIndex * 26 + (colLetters.charCodeAt(i) - 64);
  }
  colIndex -= 1; // 转为从 0 开始

  // 行号从 1 开始，转换为从 0 开始
  const rowIndex = rowNum - 1;

  return { colIndex, rowIndex };
}

// 获取大区内的所有色块位置
function getRegionCells(regionCode, cols, rows) {
  const parsed = parseRegionCode(regionCode);
  if (!parsed) return [];

  const { colIndex, rowIndex } = parsed;

  // 计算大区起始行列（每个大区 REGION_SIZE 个色块）
  const regionStartCol = colIndex * REGION_SIZE;
  const regionStartRow = rowIndex * REGION_SIZE;

  // 检查是否超出范围
  if (regionStartCol >= cols || regionStartRow >= rows) {
    return [];
  }

  const positions = [];
  // 遍历大区内的所有色块
  for (let row = regionStartRow; row < regionStartRow + REGION_SIZE && row < rows; row++) {
    for (let col = regionStartCol; col < regionStartCol + REGION_SIZE && col < cols; col++) {
      positions.push({ row, col });
    }
  }
  return positions;
}

Component({
  properties: {
    imagePath: { type: String, value: '' },
    gridSize: { type: Number, value: 10 },
    mergeThreshold: { type: Number, value: 5 },
    highlightCode: { type: String, value: null },
    showCode: { type: Boolean, value: false },
    scale: { type: Number, value: 1 },
    previewQuality: { type: Number, value: 2 },
    regenerateTrigger: { type: Number, value: 0 }
  },

  data: {
    canvasWidth: 300,
    canvasHeight: 300,
    isProcessing: false,
    gridInfo: null,
    isFullscreen: false,
    scale: 1,
    // 拖动偏移量
    offsetX: 0,
    offsetY: 0,
    isNewTouch: true,
    // 拖动状态：按住时为 true，停止渲染，手指离开时恢复渲染
    isDragging: false,
    flatCells: [],
    // 不再在此存储大数组，改用普通属性
    cachedWidth: 0,
    cachedHeight: 0
  },

  // 使用普通属性存储大数组，避免通过 setData 传输
  cachedPixelData: null,
  
  // Canvas 渲染相关
  canvasCtx: null,
  canvasNode: null,

  observers: {
    'imagePath': function(newPath) {
      
      
      
      if (newPath) {
        this.processImage(newPath);
      }
    },
    'regenerateTrigger': function() {
      
      
      // 当触发器变化时，重新生成
      if (this.cachedPixelData && this.cachedWidth > 0) {
        // 设置处理中状态，让用户看到正在重新生成
        this.setData({ isProcessing: true });
        // 延迟一下再重新生成，让用户看到清空效果
        setTimeout(() => {
          this.regenerateFromCache();
        }, 200);
      }
    },
    'gridSize, mergeThreshold, previewQuality': function() {
      
      
      

      if (this.cachedPixelData && this.cachedWidth > 0) {
        // 有缓存数据，使用缓存重新生成
        
        this.setData({ isProcessing: true });
        setTimeout(() => {
          this.regenerateFromCache();
        }, 200);
      } else if (this.data.imagePath) {
        // 没有缓存但有图片路径，重新加载图片
        
        this.processImage(this.data.imagePath);
      }
    },
    // 监听 scale 变化，重新渲染 Canvas
    'scale': function(newScale) {
      
      // 当 scale 变化时，重新渲染 Canvas
      if (this.cachedGridData && this.cachedGridInfo) {
        const { cols, rows, gridSize } = this.cachedGridInfo;
        this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
      }
    },
    // 监听偏移变化，重新渲染 Canvas（拖动时除外）
    'offsetX,offsetY': function() {
      // 拖动时只移动视图，不渲染
      if (this.data.isDragging) return;

      if (this.cachedGridData && this.cachedGridInfo) {
        const { cols, rows, gridSize } = this.cachedGridInfo;
        this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
      }
    }
  },

  methods: {
    // 使用实例属性存储像素数据，避免通过 setData 传输
    getCachedPixelData() {
      return this.cachedPixelData;
    },
    
    setCachedPixelData(pixelData, width, height) {
      this.cachedPixelData = pixelData;
      this.cachedWidth = width;
      this.cachedHeight = height;
    },
    
    regenerateFromCache() {
      const pixelData = this.getCachedPixelData();
      const cachedWidth = this.cachedWidth;
      const cachedHeight = this.cachedHeight;

      if (!pixelData || cachedWidth === 0) return;

      const qualityGridSize = this.getQualityGridSize(this.data.previewQuality);

      // 传入 mergeThreshold 参数，在颜色映射阶段进行颜色聚合
      const result = processSimple(pixelData, cachedWidth, cachedHeight, qualityGridSize, this.data.mergeThreshold);

      // 直接计算统计结果（不传输大量格子数据）
      const stats = this.calculateStats(result.gridData, result.rows, result.cols);
      

      this.setData({
        gridInfo: { cols: result.cols, rows: result.rows, gridSize: qualityGridSize },
        isProcessing: false
      });

      // 触发统计更新事件，传递预计算的统计结果
      this.triggerEvent('statsUpdate', { stats: stats });

      // 渲染到 Canvas
      setTimeout(() => {
        this.renderToCanvas(result.gridData, result.cols, result.rows, qualityGridSize);
      }, 100);

      // 保存 gridData 引用，供导出使用（通过方法获取）
      this.cachedGridData = result.gridData;
      this.cachedGridInfo = { cols: result.cols, rows: result.rows, gridSize: qualityGridSize };

      // 触发完成事件
      this.triggerEvent('mosaicGenerated', {
        gridInfo: { cols: result.cols, rows: result.rows, gridSize: qualityGridSize }
      });
    },

    // 计算统计结果
    calculateStats(gridData, rows, cols) {
      const colorCounts = {};
      let totalCount = 0;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cell = gridData[row] && gridData[row][col];
          if (!cell || !cell.markCode) continue;
          const code = cell.markCode;
          // 使用格式化后的色号作为key（去掉前导0）
          const formattedCode = this.formatMarkCode(code);
          if (!colorCounts[formattedCode]) {
            colorCounts[formattedCode] = {
              code: formattedCode,
              originalCode: code,
              hex: cell.markHex || '#000000',
              count: 0
            };
          }
          colorCounts[formattedCode].count++;
          totalCount++;
        }
      }

      return {
        colorCount: Object.keys(colorCounts).length,
        totalCount: totalCount,
        sortedByCount: Object.values(colorCounts).sort((a, b) => b.count - a.count)
      };
    },

    // 获取 gridData（供导出使用）
    getExportData() {
      return {
        gridInfo: this.cachedGridInfo,
        gridData: this.cachedGridData
      };
    },
    
    getQualityGridSize(quality) {
      const baseGridSize = this.data.gridSize;
      // 调整：让预览使用更大的格子，保持高分辨率
      switch (quality) {
        case 1: return Math.max(12, baseGridSize * 2);  // 低质量用较大格子
        case 2: return Math.max(10, baseGridSize);     // 中等质量
        case 3: return Math.max(8, baseGridSize);      // 高质量
        default: return Math.max(10, baseGridSize);
      }
    },

    processImage(imagePath) {
      
      
      
      

      this.setData({ isProcessing: true });

      const that = this;
      const actualGridSize = this.data.gridSize;
      
      wx.getImageInfo({
        src: imagePath,
        success(res) {
          const systemInfo = wx.getSystemInfoSync();
          const maxPreviewWidth = systemInfo.windowWidth * 0.81;
          
          let displayWidth = maxPreviewWidth;
          let displayHeight = (res.height / res.width) * displayWidth;
          
          const maxHeight = systemInfo.windowHeight * 0.6;
          if (displayHeight > maxHeight) {
            displayHeight = maxHeight;
            displayWidth = (displayHeight / res.height) * res.width;
          }

          displayWidth = Math.max(displayWidth, 200);
          displayHeight = Math.max(displayHeight, 200);

          that.setData({
            canvasWidth: Math.floor(displayWidth),
            canvasHeight: Math.floor(displayHeight)
          });

          that.tryGetPixelData(imagePath, res.width, res.height, Math.floor(displayWidth), Math.floor(displayHeight), actualGridSize);
        },
        fail() {
          that.setData({ isProcessing: false });
        }
      });
    },

    tryGetPixelData(imagePath, srcWidth, srcHeight, canvasWidth, canvasHeight, gridSize) {
      const that = this;
      
      if (wx.createOffscreenCanvas) {
        try {
          const offscreenCanvas = wx.createOffscreenCanvas({ type: '2d', width: srcWidth, height: srcHeight });
          const ctx = offscreenCanvas.getContext('2d');
          
          const image = offscreenCanvas.createImage();
          image.src = imagePath;
          image.onload = () => {
            ctx.drawImage(image, 0, 0, srcWidth, srcHeight);
            
            try {
              const imageData = ctx.getImageData(0, 0, srcWidth, srcHeight);
              // 不通过 setData 传输大数组，直接在组件内处理
              that.processPixelData(imageData.data, srcWidth, srcHeight, gridSize);
            } catch (e) {
              that.processWithSimpleAlgorithm(srcWidth, srcHeight, gridSize);
            }
          };
          image.onerror = () => {
            that.processWithSimpleAlgorithm(srcWidth, srcHeight, gridSize);
          };
          return;
        } catch (e) {
        }
      }
      
      that.processPixelDataFallback(imagePath, canvasWidth, canvasHeight, gridSize);
    },

    processPixelDataFallback(imagePath, width, height, gridSize) {
      const that = this;
      
      const query = wx.createSelectorQuery();
      query.select('#pixel-canvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0] || !res[0].node) {
            this.processWithSimpleAlgorithm(width, height, gridSize);
            return;
          }
          
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          
          canvas.width = width;
          canvas.height = height;
          
          const image = canvas.createImage();
          image.src = imagePath;
          image.onload = () => {
            ctx.drawImage(image, 0, 0, width, height);
            
            try {
              const imageData = ctx.getImageData(0, 0, width, height);
              // 直接存储到实例属性，避免 setData
              this.setCachedPixelData(imageData.data, width, height);
              this.processPixelData(imageData.data, width, height, gridSize);
            } catch (e) {
              this.processWithSimpleAlgorithm(width, height, gridSize);
            }
          };
          image.onerror = () => {
            this.processWithSimpleAlgorithm(width, height, gridSize);
          };
        });
    },

    processWithSimpleAlgorithm(width, height, gridSize) {
      this.setData({ isProcessing: false });

      const qualityGridSize = this.getQualityGridSize(this.data.previewQuality);
      // 传入 mergeThreshold 参数
      const result = processSimple(null, width, height, qualityGridSize, this.data.mergeThreshold);

      // 直接计算统计结果
      const stats = this.calculateStats(result.gridData, result.rows, result.cols);
      

      this.setData({
        gridInfo: { cols: result.cols, rows: result.rows, gridSize: qualityGridSize },
        isProcessing: false
      });

      // 触发统计更新事件
      this.triggerEvent('statsUpdate', { stats: stats });

      // 渲染到 Canvas
      setTimeout(() => {
        this.renderToCanvas(result.gridData, result.cols, result.rows, qualityGridSize);
      }, 100);

      // 保存引用
      this.cachedGridData = result.gridData;
      this.cachedGridInfo = { cols: result.cols, rows: result.rows, gridSize: qualityGridSize };

      this.triggerEvent('mosaicGenerated', {
        gridInfo: { cols: result.cols, rows: result.rows, gridSize: qualityGridSize }
      });
    },

    processPixelData(pixelData, width, height, gridSize) {
      this.setData({ isProcessing: true });

      const qualityGridSize = this.getQualityGridSize(this.data.previewQuality);
      // 传入 mergeThreshold 参数，在颜色映射阶段进行颜色聚合
      const result = processSimple(pixelData, width, height, qualityGridSize, this.data.mergeThreshold);

      // 直接计算统计结果
      const stats = this.calculateStats(result.gridData, result.rows, result.cols);
      

      this.setData({
        gridInfo: { cols: result.cols, rows: result.rows, gridSize: qualityGridSize },
        isProcessing: false
      });

      // 触发统计更新事件
      this.triggerEvent('statsUpdate', { stats: stats });

      // 渲染到 Canvas
      setTimeout(() => {
        this.renderToCanvas(result.gridData, result.cols, result.rows, qualityGridSize);
      }, 100);

      // 保存引用
      this.cachedGridData = result.gridData;
      this.cachedGridInfo = { cols: result.cols, rows: result.rows, gridSize: qualityGridSize };

      this.triggerEvent('mosaicGenerated', {
        gridInfo: { cols: result.cols, rows: result.rows, gridSize: qualityGridSize }
      });
    },

    // 渲染马赛克到 Canvas
    renderToCanvas(gridData, cols, rows, gridSize) {
      const that = this;
      this.isRendering = true;

      // 使用组件实例的 createSelectorQuery
      const query = this.createSelectorQuery();
      query.select('#mosaic-render-canvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0]) {
            
            // 重试
            setTimeout(() => {
              that.renderToCanvas(gridData, cols, rows, gridSize);
            }, 200);
            return;
          }
          if (!res[0].node) {
            
            // 重试
            setTimeout(() => {
              that.renderToCanvas(gridData, cols, rows, gridSize);
            }, 200);
            return;
          }
          
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          
          // 使用组件 data 中的尺寸，因为这是根据图片实际计算出来的
          // 忽略查询返回的尺寸，因为它可能受 CSS 影响
          let canvasWidth = that.data.canvasWidth || 300;
          let canvasHeight = that.data.canvasHeight || 300;

          // 使用 Canvas 极限尺寸 4096，保持最高分辨率
          const MAX_CANVAS_SIZE = 4096;
          canvasWidth = Math.min(canvasWidth, MAX_CANVAS_SIZE);
          canvasHeight = Math.min(canvasHeight, MAX_CANVAS_SIZE);

          // 如果 data 中的尺寸太小，使用查询到的尺寸（但不超极限）
          if (res[0].width > canvasWidth || res[0].height > canvasHeight) {
            canvasWidth = Math.min(res[0].width, MAX_CANVAS_SIZE);
            canvasHeight = Math.min(res[0].height, MAX_CANVAS_SIZE);
          }
          
          
          
          
          // 设置 canvas 尺寸 - 应用用户缩放比例以保持高分辨率
          const userScale = that.data.scale || 1;
          // 限制 Canvas 最大尺寸为 16384（微信小程序限制）
          const MAX_CANVAS_DIMENSION = 16384;
          let scaledWidth = canvasWidth * userScale;
          let scaledHeight = canvasHeight * userScale;
          // 如果缩放后超出限制，则缩小比例
          if (scaledWidth > MAX_CANVAS_DIMENSION || scaledHeight > MAX_CANVAS_DIMENSION) {
            const scaleRatio = MAX_CANVAS_DIMENSION / Math.max(scaledWidth, scaledHeight);
            scaledWidth *= scaleRatio;
            scaledHeight *= scaleRatio;
          }
          canvas.width = Math.floor(scaledWidth);
          canvas.height = Math.floor(scaledHeight);

          
          
          // 存储引用
          that.canvasNode = canvas;
          that.canvasCtx = ctx;
          
          // 清空画布 - 使用浅灰色背景（使用实际Canvas尺寸）
          ctx.fillStyle = '#f0f0f0';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          // 计算缩放以适应 Canvas
          const totalGridWidth = cols * gridSize;
          const totalGridHeight = rows * gridSize;
          
          
          
          // 计算缩放比例，让整个马赛克适应 Canvas
          const scaleX = totalGridWidth > 0 ? canvasWidth / totalGridWidth : 1;
          const scaleY = totalGridHeight > 0 ? canvasHeight / totalGridHeight : 1;
          const baseScale = Math.min(scaleX, scaleY, 1);

          // 叠加用户的缩放比例（已经在上面定义了userScale）
          const scale = baseScale * userScale;
          
          
          
          // 居中偏移 - 使用实际的 Canvas 尺寸
          const actualCanvasWidth = canvas.width;
          const actualCanvasHeight = canvas.height;
          const baseOffsetX = (actualCanvasWidth - totalGridWidth * scale) / 2;
          const baseOffsetY = (actualCanvasHeight - totalGridHeight * scale) / 2;
          // 加上用户的拖动偏移
          const offsetX = baseOffsetX + (this.data.offsetX || 0);
          const offsetY = baseOffsetY + (this.data.offsetY || 0);

          
          
          
          
          // 计算可见区域（只渲染可见的格子）
          const cellSize = gridSize * scale;
          const buffer = cellSize;
          const visibleLeft = -buffer;
          const visibleRight = actualCanvasWidth + buffer;
          const visibleTop = -buffer;
          const visibleBottom = actualCanvasHeight + buffer;

          // 计算可见的行列范围
          const startCol = Math.max(0, Math.floor((visibleLeft - offsetX) / cellSize));
          const endCol = Math.min(cols - 1, Math.ceil((visibleRight - offsetX) / cellSize));
          const startRow = Math.max(0, Math.floor((visibleTop - offsetY) / cellSize));
          const endRow = Math.min(rows - 1, Math.ceil((visibleBottom - offsetY) / cellSize));

          // 绘制可见区域的格子
          for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
              const cell = gridData[row] && gridData[row][col];
              if (!cell || !cell.markCode) continue;

              const cellWidth = cellSize;
              const cellHeight = cellSize;

              const x = offsetX + col * cellSize;
              const y = offsetY + row * cellSize;

              // 绘制色块
              ctx.fillStyle = cell.markHex;
              ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(cellWidth), Math.ceil(cellHeight));

              // 绘制格子边框
              ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
              ctx.lineWidth = 1;
              ctx.strokeRect(Math.floor(x) + 0.5, Math.floor(y) + 0.5, Math.ceil(cellWidth) - 1, Math.ceil(cellHeight) - 1);

              // 绘制色号
              const size = Math.min(cellWidth, cellHeight);
              if (that.data.showCode && size >= 8) {
                const isLight = that.isLightColor(cell.markHex);
                ctx.fillStyle = isLight ? '#333333' : '#ffffff';
                ctx.font = `${Math.max(6, size * 0.25)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(that.formatMarkCode(cell.markCode), x + cellWidth / 2, y + cellHeight / 2);
              }
            }
          }

          // 绘制参考线（只绘制可见区域内的）
          that.drawGuideLines(ctx, offsetX, offsetY, cols, rows, gridSize, scale, startCol, endCol, startRow, endRow);

          // 绘制大区水印（只绘制可见区域内的）
          that.drawRegionWatermarks(ctx, offsetX, offsetY, cols, rows, gridSize, scale, startCol, endCol, startRow, endRow);

          // 渲染完成，释放节流标志
          that.isRendering = false;
        });
    },

    // 绘制参考线（只绘制可见区域内的）
    drawGuideLines(ctx, offsetX, offsetY, cols, rows, gridSize, scale, startCol, endCol, startRow, endRow) {
      const lineSpacing = 10 * gridSize * scale;
      const lineColor = 'rgba(70, 130, 180, 0.8)';
      const lineWidth = 1;
      const cellSize = gridSize * scale;

      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineWidth;

      // 计算需要绘制参考线的列（每10列）
      const firstLineCol = Math.ceil(startCol / 10) * 10;
      // 绘制垂直参考线（每10列，只画可见的）
      for (let col = firstLineCol; col <= endCol; col += 10) {
        const x = offsetX + col * cellSize;
        ctx.beginPath();
        ctx.moveTo(x, offsetY + startRow * cellSize);
        ctx.lineTo(x, offsetY + (endRow + 1) * cellSize);
        ctx.stroke();
      }

      // 计算需要绘制参考线的行（每10行）
      const firstLineRow = Math.ceil(startRow / 10) * 10;
      // 绘制水平参考线（每10行，只画可见的）
      for (let row = firstLineRow; row <= endRow; row += 10) {
        const y = offsetY + row * cellSize;
        ctx.beginPath();
        ctx.moveTo(offsetX + startCol * cellSize, y);
        ctx.lineTo(offsetX + (endCol + 1) * cellSize, y);
        ctx.stroke();
      }
    },

    // 绘制大区水印（只绘制可见区域内的）
    drawRegionWatermarks(ctx, offsetX, offsetY, cols, rows, gridSize, scale, startCol, endCol, startRow, endRow) {
      const cellSize = gridSize * scale;
      const regionPixelSize = REGION_SIZE * cellSize; // 大区像素尺寸

      // 计算大区编号范围（从 0 开始）
      const regionStartCol = Math.floor(startCol / REGION_SIZE);
      const regionEndCol = Math.ceil(endCol / REGION_SIZE);
      const regionStartRow = Math.floor(startRow / REGION_SIZE);
      const regionEndRow = Math.ceil(endRow / REGION_SIZE);

      // 大区数量
      const totalRegionCols = Math.ceil(cols / REGION_SIZE);
      const totalRegionRows = Math.ceil(rows / REGION_SIZE);

      // 字体大小：大区尺寸的 40%
      const fontSize = Math.max(8, regionPixelSize * 0.4);

      ctx.save();
      ctx.globalAlpha = 0.35; // 透明度 35%
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#333333';

      // 遍历可见的大区
      for (let regionRow = regionStartRow; regionRow < regionEndRow && regionRow < totalRegionRows; regionRow++) {
        for (let regionCol = regionStartCol; regionCol < regionEndCol && regionCol < totalRegionCols; regionCol++) {
          // 计算大区中心位置
          const regionCenterX = offsetX + (regionCol * REGION_SIZE + REGION_SIZE / 2) * cellSize;
          const regionCenterY = offsetY + (regionRow * REGION_SIZE + REGION_SIZE / 2) * cellSize;

          // 生成大区编号：列编号 + 行号（从 1 开始）
          const colCode = getColCode(regionCol);
          const regionCode = colCode + (regionRow + 1);

          ctx.fillText(regionCode, regionCenterX, regionCenterY);
        }
      }

      ctx.restore();
    },

    // 判断颜色是否为浅色
    isLightColor(hex) {
      if (!hex) return false;
      hex = hex.replace('#', '');
      let r, g, b;
      if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      } else if (hex.length === 6) {
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
      } else {
        return false;
      }
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      return brightness > 150;
    },

    // 格式化色号（去除前导0）
    formatMarkCode(code) {
      if (!code) return '';
      // 匹配字母+数字格式，如 A01, B09, C10 等
      return code.replace(/^([A-Z])0(\d+)$/, '$1$2');
    },

    // 解析色号（兼容大小写和前导0）
    parseMarkCode(input) {
      if (!input) return null;
      // 转换为大写并去除空格
      const normalized = input.toUpperCase().trim();
      // 匹配格式：字母+数字（如 A1, A01, a1, m9, M09 等）
      const match = normalized.match(/^([A-Z])(\d+)$/);
      if (!match) return null;
      const letter = match[1];
      const num = parseInt(match[2], 10);
      // 还原为标准格式（可能需要前导0）
      const code = num < 10 ? `${letter}0${num}` : `${letter}${num}`;
      return code;
    },

    // 重试渲染（延迟执行）
    renderToCanvasRetry(gridData, cols, rows, gridSize) {
      
      this.renderToCanvas(gridData, cols, rows, gridSize);
    },

    toggleFullscreen() {
      const isFullscreen = !this.data.isFullscreen;
      this.setData({ isFullscreen });

      // 设置横屏
      if (isFullscreen) {
        wx.setPageOrientation('landscape');
      } else {
        wx.setPageOrientation('portrait');
      }
    },

    // 获取可见区域范围
    getVisibleRange() {
      if (!this.cachedGridData || !this.cachedGridInfo) {
        return null;
      }
      const { cols, rows, gridSize } = this.cachedGridInfo;
      const scale = this.data.scale || 1;
      const offsetX = this.data.offsetX || 0;
      const offsetY = this.data.offsetY || 0;

      const cellSize = gridSize * scale;
      const canvasWidth = this.data.canvasWidth || 300;
      const canvasHeight = this.data.canvasHeight || 300;

      // 计算可见区域
      const buffer = cellSize;
      const visibleLeft = -buffer;
      const visibleRight = canvasWidth + buffer;
      const visibleTop = -buffer;
      const visibleBottom = canvasHeight + buffer;

      // 计算居中偏移
      const totalGridWidth = cols * gridSize;
      const totalGridHeight = rows * gridSize;
      const baseScaleX = canvasWidth / totalGridWidth;
      const baseScaleY = canvasHeight / totalGridHeight;
      const baseScale = Math.min(baseScaleX, baseScaleY, 1);
      const actualScale = baseScale * scale;
      const baseOffsetX = (canvasWidth - totalGridWidth * actualScale) / 2;
      const baseOffsetY = (canvasHeight - totalGridHeight * actualScale) / 2;

      const finalOffsetX = baseOffsetX + offsetX;
      const finalOffsetY = baseOffsetY + offsetY;

      // 计算可见的行列范围
      const startCol = Math.max(0, Math.floor((visibleLeft - finalOffsetX) / cellSize));
      const endCol = Math.min(cols - 1, Math.ceil((visibleRight - finalOffsetX) / cellSize));
      const startRow = Math.max(0, Math.floor((visibleTop - finalOffsetY) / cellSize));
      const endRow = Math.min(rows - 1, Math.ceil((visibleBottom - finalOffsetY) / cellSize));

      return {
        startCol,
        endCol,
        startRow,
        endRow
      };
    },

    // 替换颜色
    replaceColor(fromCode, toCode, scope, positions) {
      if (!this.cachedGridData || !this.cachedGridInfo) {
        return { success: false, message: '没有可替换的数据' };
      }

      const { cols, rows, gridSize } = this.cachedGridInfo;
      const gridData = this.cachedGridData;

      // 获取替换目标色号的信息
      const colorPalettes = require('../../data/colorPalettes.js');
      const colorMapping = colorPalettes.colorMapping;
      const toColorHex = this._findColorHexByCode(toCode);

      if (!toColorHex) {
        return { success: false, message: '替换色号不存在' };
      }

      // 确定需要替换的范围
      let startCol = 0, endCol = cols - 1, startRow = 0, endRow = rows - 1;
      let positionList = null;

      if (positions && positions.length > 0) {
        // 使用指定的位置列表
        positionList = positions;
        startCol = Math.min(...positions.map(p => p.col !== undefined ? p.col : p[1]));
        endCol = Math.max(...positions.map(p => p.col !== undefined ? p.col : p[1]));
        startRow = Math.min(...positions.map(p => p.row !== undefined ? p.row : p[0]));
        endRow = Math.max(...positions.map(p => p.row !== undefined ? p.row : p[0]));
      } else if (scope === 'visible') {
        const visibleRange = this.getVisibleRange();
        if (visibleRange) {
          startCol = visibleRange.startCol;
          endCol = visibleRange.endCol;
          startRow = visibleRange.startRow;
          endRow = visibleRange.endRow;
        }
      }

      // 执行替换
      const replacedPositions = [];
      let count = 0;

      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          const cell = gridData[row] && gridData[row][col];
          if (!cell || !cell.markCode) continue;

          // 如果指定了位置列表，检查当前位置是否在列表中
          if (positionList) {
            const pos = positionList.find(p => (p.row !== undefined ? p.row : p[0]) === row && (p.col !== undefined ? p.col : p[1]) === col);
            if (!pos) continue;
          }

          // 检查是否匹配被替换的色号
          if (cell.markCode === fromCode) {
            // 保存原始信息用于撤销
            replacedPositions.push({
              row,
              col,
              oldCode: cell.markCode,
              oldHex: cell.markHex
            });

            // 替换
            cell.markCode = toCode;
            cell.markHex = toColorHex;
            count++;
          }
        }
      }

      if (count === 0) {
        return { success: false, message: '没有找到匹配的色块', count: 0 };
      }

      // 重新计算统计
      const stats = this.calculateStats(gridData, rows, cols);
      this.setData({
        gridInfo: { cols, rows, gridSize }
      });
      this.triggerEvent('statsUpdate', { stats: stats });

      // 重新渲染
      this.renderToCanvas(gridData, cols, rows, gridSize);

      return {
        success: true,
        count,
        positions: replacedPositions
      };
    },

    // 根据色号查找颜色hex
    _findColorHexByCode(code) {
      const colorPalettes = require('../../data/colorPalettes.js');
      const colorMapping = colorPalettes.colorMapping;

      // 遍历 colorMapping 查找匹配的色号
      for (const hex in colorMapping) {
        const color = colorMapping[hex];
        if (color.MARD === code) {
          return hex;
        }
      }
      return null;
    },

    // 大区替换：替换指定大区内的指定色号
    replaceByRegion(regionCode, fromCode, toCode) {
      if (!this.cachedGridData || !this.cachedGridInfo) {
        return { success: false, message: '没有可替换的数据' };
      }

      const { cols, rows, gridSize } = this.cachedGridInfo;
      const gridData = this.cachedGridData;

      // 获取目标大区内的所有色块位置
      const positions = getRegionCells(regionCode, cols, rows);

      if (positions.length === 0) {
        return { success: false, message: '大区编号无效或超出范围' };
      }

      // 获取替换目标色号的信息
      const toColorHex = this._findColorHexByCode(toCode);

      if (!toColorHex) {
        return { success: false, message: '替换色号不存在' };
      }

      // 执行替换
      const replacedPositions = [];
      let count = 0;

      for (let i = 0; i < positions.length; i++) {
        const { row, col } = positions[i];
        const cell = gridData[row] && gridData[row][col];
        if (!cell || !cell.markCode) continue;

        // 检查是否匹配被替换的色号
        if (cell.markCode === fromCode) {
          // 保存原始信息用于撤销
          replacedPositions.push({
            row,
            col,
            oldCode: cell.markCode,
            oldHex: cell.markHex
          });

          // 替换
          cell.markCode = toCode;
          cell.markHex = toColorHex;
          count++;
        }
      }

      if (count === 0) {
        return { success: false, message: '该大区内没有匹配的色块', count: 0 };
      }

      // 重新计算统计
      const stats = this.calculateStats(gridData, rows, cols);
      this.setData({
        gridInfo: { cols, rows, gridSize }
      });
      this.triggerEvent('statsUpdate', { stats: stats });

      // 重新渲染
      this.renderToCanvas(gridData, cols, rows, gridSize);

      return {
        success: true,
        count,
        positions: replacedPositions
      };
    },

    // 绘制网格数据到 canvas
    _drawGrid(ctx, canvas, gridData, cols, rows, gridSize) {
      const scale = this.data.scale || 1;
      const offsetX = this.data.offsetX || 0;
      const offsetY = this.data.offsetY || 0;
      const canvasWidth = this.data.canvasWidth || 300;
      const canvasHeight = this.data.canvasHeight || 300;

      const totalGridWidth = cols * gridSize;
      const totalGridHeight = rows * gridSize;
      const scaleX = totalGridWidth > 0 ? canvasWidth / totalGridWidth : 1;
      const scaleY = totalGridHeight > 0 ? canvasHeight / totalGridHeight : 1;
      const baseScale = Math.min(scaleX, scaleY, 1);
      const finalScale = baseScale * scale;

      const actualCanvasWidth = canvas.width;
      const actualCanvasHeight = canvas.height;
      const baseOffsetX = (actualCanvasWidth - totalGridWidth * finalScale) / 2;
      const baseOffsetY = (actualCanvasHeight - totalGridHeight * finalScale) / 2;
      const finalOffsetX = baseOffsetX + offsetX;
      const finalOffsetY = baseOffsetY + offsetY;

      // 清空画布
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cellSize = gridSize * finalScale;
      const buffer = cellSize;
      const visibleLeft = -buffer;
      const visibleRight = actualCanvasWidth + buffer;
      const visibleTop = -buffer;
      const visibleBottom = actualCanvasHeight + buffer;

      const startCol = Math.max(0, Math.floor((visibleLeft - finalOffsetX) / cellSize));
      const endCol = Math.min(cols - 1, Math.ceil((visibleRight - finalOffsetX) / cellSize));
      const startRow = Math.max(0, Math.floor((visibleTop - finalOffsetY) / cellSize));
      const endRow = Math.min(rows - 1, Math.ceil((visibleBottom - finalOffsetY) / cellSize));

      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          const cell = gridData[row] && gridData[row][col];
          if (!cell || !cell.markCode) continue;

          const cellWidth = cellSize;
          const cellHeight = cellSize;
          const x = finalOffsetX + col * cellSize;
          const y = finalOffsetY + row * cellSize;

          ctx.fillStyle = cell.markHex;
          ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(cellWidth), Math.ceil(cellHeight));

          ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
          ctx.lineWidth = 1;
          ctx.strokeRect(Math.floor(x) + 0.5, Math.floor(y) + 0.5, Math.ceil(cellWidth) - 1, Math.ceil(cellHeight) - 1);

          const size = Math.min(cellWidth, cellHeight);
          if (this.data.showCode && size >= 8) {
            const isLight = this.isLightColor(cell.markHex);
            ctx.fillStyle = isLight ? '#333333' : '#ffffff';
            ctx.font = `${Math.max(6, size * 0.25)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.formatMarkCode(cell.markCode), x + cellWidth / 2, y + cellHeight / 2);
          }
        }
      }

    },

    handleCellTap(e) {
      const code = e.currentTarget.dataset.code;
      this.triggerEvent('cellClick', { code });
    },

    // 记录初始双指距离
    initialTouchDistance: 0,
    initialScale: 1,
    // 节流标志和渲染队列
    isRendering: false,
    pendingRender: null,
    // 操作间隔控制
    lastTouchTime: 0,
    TOUCH_THROTTLE: 20,

    handleTouchStart(e) {
      if (e.touches.length === 2) {
        // 双指触摸，记录初始距离和缩放
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        this.initialTouchDistance = Math.hypot(dx, dy);
        this.initialScale = this.data.scale;
        // 双指时结束拖动状态
        this.setData({ isDragging: false });
      } else if (e.touches.length === 1) {
        // 开始拖动状态，阻止渲染
        this.setData({ isDragging: true });
        // 只有新触摸时才重置偏移量
        if (this.data.isNewTouch) {
          this.setData({ lastTouch: e.touches[0], offsetX: 0, offsetY: 0, isNewTouch: false });
        } else {
          this.setData({ lastTouch: e.touches[0] });
        }
      }
    },

    handleTouchMove(e) {
      // 拖动时不受 isRendering 节流影响，确保实时更新偏移
      if (!this.data.isDragging && this.isRendering) {
        return;
      }

      if (e.touches.length === 2) {
        // 双指缩放
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const currentDistance = Math.hypot(dx, dy);

        if (this.initialTouchDistance > 0) {
          const scaleFactor = currentDistance / this.initialTouchDistance;
          const newScale = Math.max(0.5, Math.min(20, this.initialScale * scaleFactor));
          this.setData({ scale: newScale });
        }
      } else if (e.touches.length === 1 && this.data.lastTouch) {
        const current = e.touches[0];
        const last = this.data.lastTouch;
        const deltaX = current.clientX - last.clientX;
        const deltaY = current.clientY - last.clientY;

        // 放大后启用平移（任意scale都可以拖动）
        if (this.data.scale > 1.0) {
          // 限制偏移量范围，防止内存溢出
          const maxOffset = 2000;
          let newOffsetX = this.data.offsetX + deltaX;
          let newOffsetY = this.data.offsetY + deltaY;
          newOffsetX = Math.max(-maxOffset, Math.min(maxOffset, newOffsetX));
          newOffsetY = Math.max(-maxOffset, Math.min(maxOffset, newOffsetY));

          this.setData({ offsetX: newOffsetX, offsetY: newOffsetY, lastTouch: current });
        } else {
          // 小缩放时上下滑动调整缩放
          let newScale = this.data.scale;
          if (Math.abs(deltaY) > Math.abs(deltaX)) {
            newScale = Math.max(0.5, Math.min(20, newScale + deltaY * 0.003));
          }
          this.setData({ scale: newScale, lastTouch: current });
        }
      }
    },

    handleTouchEnd(e) {
      if (e.touches.length === 0) {
        // 结束拖动状态，触发渲染
        this.setData({ lastTouch: null, isNewTouch: true, isDragging: false });
        this.initialTouchDistance = 0;

        // 拖动结束后渲染可见区域
        if (this.cachedGridData && this.cachedGridInfo) {
          const { cols, rows, gridSize } = this.cachedGridInfo;
          this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
        }
      }
    },

    // 延迟渲染，使用 requestAnimationFrame
    scheduleRender() {
      if (this.pendingRender) return;

      this.pendingRender = true;
      wx.nextTick(() => {
        this.pendingRender = false;
        if (this.cachedGridData && this.cachedGridInfo) {
          const { cols, rows, gridSize } = this.cachedGridInfo;
          this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
        }
      });
    }
  }
});