// components/mosaicCanvas/mosaicCanvas.js
const { processSimple, medianCut, colorDistance } = require('../../utils/imageProcessor');
const { findClosestMarkColor } = require('../../utils/colorMapper');

Component({
  properties: {
    imagePath: { type: String, value: '' },
    gridSize: { type: Number, value: 10 },
    mergeThreshold: { type: Number, value: 5 },
    highlightCode: { type: String, value: null },
    showCode: { type: Boolean, value: false },
    scale: { type: Number, value: 1 },
    previewQuality: { type: Number, value: 2 }
  },

  data: {
    canvasWidth: 300,
    canvasHeight: 300,
    isProcessing: false,
    gridInfo: null,
    isFullscreen: false,
    scale: 1,
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
    'gridSize, mergeThreshold': function(newGridSize, newMergeThreshold) {
      if (this.cachedPixelData && this.cachedWidth > 0) {
        this.regenerateFromCache();
      }
    },
    'previewQuality': function() {
      if (this.cachedPixelData && this.cachedWidth > 0) {
        this.regenerateFromCache();
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
      
      const result = processSimple(pixelData, cachedWidth, cachedHeight, qualityGridSize);
      
      const mergedGrid = this.mergeRegions(result.gridData, result.rows, result.cols, this.data.mergeThreshold);
      
      const flatCells = [];
      for (let row = 0; row < result.rows; row++) {
        for (let col = 0; col < result.cols; col++) {
          if (mergedGrid[row] && mergedGrid[row][col]) {
            flatCells.push(mergedGrid[row][col]);
          }
        }
      }
      
      this.setData({
        gridInfo: { cols: result.cols, rows: result.rows, gridSize: qualityGridSize },
        flatCells: flatCells,
        isProcessing: false
      });
      
      // 渲染到 Canvas - 延迟执行确保 Canvas 已渲染
      setTimeout(() => {
        this.renderToCanvas(result.gridData, result.cols, result.rows, qualityGridSize);
      }, 100);
      
      // 将 gridData 也传递出去，供导出功能使用
      this.triggerEvent('mosaicGenerated', { 
        gridInfo: { cols: result.cols, rows: result.rows, gridSize: qualityGridSize },
        gridData: result.gridData
      });
    },
    
    getQualityGridSize(quality) {
      const baseGridSize = this.data.gridSize;
      switch (quality) {
        case 1: return Math.max(8, baseGridSize * 2);
        case 2: return baseGridSize;
        case 3: return Math.max(4, Math.floor(baseGridSize / 2));
        default: return baseGridSize;
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
      const result = processSimple(null, width, height, qualityGridSize);
      
      const mergedGrid = this.mergeRegions(result.gridData, result.rows, result.cols, this.data.mergeThreshold);
      
      const flatCells = [];
      for (let row = 0; row < result.rows; row++) {
        for (let col = 0; col < result.cols; col++) {
          if (mergedGrid[row] && mergedGrid[row][col]) {
            flatCells.push(mergedGrid[row][col]);
          }
        }
      }
      
      this.setData({
        gridInfo: { cols: result.cols, rows: result.rows, gridSize: qualityGridSize },
        flatCells: flatCells,
        isProcessing: false
      });
      
      // 渲染到 Canvas - 延迟执行确保 Canvas 已渲染
      setTimeout(() => {
        this.renderToCanvas(result.gridData, result.cols, result.rows, qualityGridSize);
      }, 100);
      
      // 将 gridData 也传递出去，供导出功能使用
      this.triggerEvent('mosaicGenerated', { 
        gridInfo: { cols: result.cols, rows: result.rows, gridSize: qualityGridSize },
        gridData: result.gridData
      });
    },

    processPixelData(pixelData, width, height, gridSize) {
      this.setData({ isProcessing: true });
      
      const qualityGridSize = this.getQualityGridSize(this.data.previewQuality);
      const result = processSimple(pixelData, width, height, qualityGridSize);
      
      const mergedGrid = this.mergeRegions(result.gridData, result.rows, result.cols, this.data.mergeThreshold);
      
      const flatCells = [];
      for (let row = 0; row < result.rows; row++) {
        for (let col = 0; col < result.cols; col++) {
          if (mergedGrid[row] && mergedGrid[row][col]) {
            flatCells.push(mergedGrid[row][col]);
          }
        }
      }
      
      this.setData({
        gridInfo: { cols: result.cols, rows: result.rows, gridSize: qualityGridSize },
        flatCells: flatCells,
        isProcessing: false
      });
      
      // 渲染到 Canvas - 延迟执行确保 Canvas 已渲染
      setTimeout(() => {
        this.renderToCanvas(result.gridData, result.cols, result.rows, qualityGridSize);
      }, 100);
      
      // 将 gridData 也传递出去，供导出功能使用
      this.triggerEvent('mosaicGenerated', { 
        gridInfo: { cols: result.cols, rows: result.rows, gridSize: qualityGridSize },
        gridData: result.gridData
      });
    },

    // 渲染马赛克到 Canvas
    renderToCanvas(gridData, cols, rows, gridSize) {
      const that = this;
      
      // 使用组件实例的 createSelectorQuery
      const query = this.createSelectorQuery();
      query.select('#mosaic-render-canvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          console.log('Canvas query result:', res);
          if (!res[0]) {
            console.error('Canvas query result empty, retrying...');
            // 重试
            setTimeout(() => {
              that.renderToCanvas(gridData, cols, rows, gridSize);
            }, 200);
            return;
          }
          if (!res[0].node) {
            console.error('Canvas node not found, res:', res[0]);
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
          
          // 如果 data 中的尺寸太小，使用查询到的尺寸
          if (res[0].width > canvasWidth || res[0].height > canvasHeight) {
            canvasWidth = res[0].width;
            canvasHeight = res[0].height;
          }
          
          console.log('Canvas尺寸(来自data):', canvasWidth, 'x', canvasHeight);
          console.log('Grid尺寸:', cols, 'x', rows, '格子大小:', gridSize);
          
          // 设置 canvas 尺寸 - 使用 data 中的尺寸
          canvas.width = canvasWidth;
          canvas.height = canvasHeight;
          
          // 存储引用
          that.canvasNode = canvas;
          that.canvasCtx = ctx;
          
          // 清空画布 - 使用浅灰色背景
          ctx.fillStyle = '#f0f0f0';
          ctx.fillRect(0, 0, canvasWidth, canvasHeight);
          
          // 计算缩放以适应 Canvas
          const totalGridWidth = cols * gridSize;
          const totalGridHeight = rows * gridSize;
          
          console.log('总网格尺寸:', totalGridWidth, 'x', totalGridHeight);
          
          // 计算缩放比例，让整个马赛克适应 Canvas
          const scaleX = totalGridWidth > 0 ? canvasWidth / totalGridWidth : 1;
          const scaleY = totalGridHeight > 0 ? canvasHeight / totalGridHeight : 1;
          const scale = Math.min(scaleX, scaleY, 1);
          
          console.log('缩放比例:', scale);
          
          // 居中偏移
          const offsetX = (canvasWidth - totalGridWidth * scale) / 2;
          const offsetY = (canvasHeight - totalGridHeight * scale) / 2;
          
          console.log('偏移:', offsetX, offsetY);
          
          // 绘制所有格子
          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
              const cell = gridData[row] && gridData[row][col];
              if (!cell) continue;
              
              const x = offsetX + col * gridSize * scale;
              const y = offsetY + row * gridSize * scale;
              const size = gridSize * scale;
              
              // 绘制色块
              ctx.fillStyle = cell.markHex;
              ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(size), Math.ceil(size));
              
              // 绘制色号（根据格子大小）
              if (that.data.showCode && size >= 15) {
                const isLight = that.isLightColor(cell.markHex);
                ctx.fillStyle = isLight ? '#333333' : '#ffffff';
                ctx.font = `${Math.max(10, size * 0.4)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(cell.markCode, x + size / 2, y + size / 2);
              }
            }
          }
        });
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

    // 重试渲染（延迟执行）
    renderToCanvasRetry(gridData, cols, rows, gridSize) {
      console.log('Retry renderToCanvas...');
      this.renderToCanvas(gridData, cols, rows, gridSize);
    },

    mergeRegions(gridData, rows, cols, threshold) {
      // 暂时禁用合并，避免出现空缺
      return gridData;
      
      /*
      if (threshold <= 0) return gridData;
      
      const merged = JSON.parse(JSON.stringify(gridData));
      
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (!merged[row][col]) continue;
          
          const code = merged[row][col].markCode;
          const currentWidth = merged[row][col].width || this.data.gridSize;
          const currentHeight = merged[row][col].height || this.data.gridSize;
          
          // 尝试向右合并
          if (col < cols - 1 && merged[row][col + 1] && merged[row][col + 1].markCode === code) {
            const rightWidth = merged[row][col + 1].width || this.data.gridSize;
            merged[row][col].width = currentWidth + rightWidth;
            merged[row][col + 1] = null;
          }
          
          // 尝试向下合并
          if (row < rows - 1 && merged[row + 1][col] && merged[row + 1][col].markCode === code) {
            const downHeight = merged[row + 1][col].height || this.data.gridSize;
            merged[row][col].height = currentHeight + downHeight;
            merged[row + 1][col] = null;
          }
        }
      }
      
      return merged;
      */
    },

    toggleFullscreen() {
      this.setData({ isFullscreen: !this.data.isFullscreen });
    },

    handleCellTap(e) {
      const code = e.currentTarget.dataset.code;
      this.triggerEvent('cellClick', { code });
    },

    handleTouchStart(e) {
      this.setData({ lastTouch: e.touches[0] });
    },

    handleTouchMove(e) {
      const current = e.touches[0];
      const last = this.data.lastTouch;
      
      if (last) {
        const deltaX = current.clientX - last.clientX;
        const deltaY = current.clientY - last.clientY;
        
        let newScale = this.data.scale;
        if (Math.abs(deltaY) > Math.abs(deltaX)) {
          newScale = Math.max(0.5, Math.min(3, newScale + deltaY * 0.005));
        }
        
        this.setData({ scale: newScale, lastTouch: current });
      }
    },

    handleTouchEnd() {
      this.setData({ lastTouch: null });
    }
  }
});