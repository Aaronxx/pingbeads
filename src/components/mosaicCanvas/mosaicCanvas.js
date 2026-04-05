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
    cachedPixelData: null,
    cachedWidth: 0,
    cachedHeight: 0
  },

  observers: {
    'imagePath': function(newPath) {
      if (newPath) {
        this.processImage(newPath);
      }
    },
    'gridSize, mergeThreshold': function(newGridSize, newMergeThreshold) {
      if (this.data.cachedPixelData && this.data.cachedWidth > 0) {
        this.regenerateFromCache();
      }
    },
    'previewQuality': function() {
      if (this.data.cachedPixelData && this.data.cachedWidth > 0) {
        this.regenerateFromCache();
      }
    }
  },

  methods: {
    regenerateFromCache() {
      const { cachedPixelData, cachedWidth, cachedHeight, mergeThreshold } = this.data;
      if (!cachedPixelData || cachedWidth === 0) return;
      
      const qualityGridSize = this.getQualityGridSize(this.data.previewQuality);
      
      // cachedPixelData 存储的是原始像素数据
      const result = processSimple(cachedPixelData, cachedWidth, cachedHeight, qualityGridSize);
      
      const mergedGrid = this.mergeRegions(result.gridData, result.rows, result.cols, mergeThreshold);
      
      const flatCells = [];
      for (let row = 0; row < result.rows; row++) {
        for (let col = 0; col < result.cols; col++) {
          if (mergedGrid[row] && mergedGrid[row][col]) {
            flatCells.push(mergedGrid[row][col]);
          }
        }
      }
      
      this.setData({
        gridInfo: { gridData: mergedGrid, cols: result.cols, rows: result.rows, gridSize: qualityGridSize },
        flatCells: flatCells,
        isProcessing: false
      });
      
      this.triggerEvent('mosaicGenerated', { 
        gridInfo: { gridData: mergedGrid, cols: result.cols, rows: result.rows, gridSize: qualityGridSize } 
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
              that.setData({
                cachedPixelData: imageData.data,
                cachedWidth: srcWidth,
                cachedHeight: srcHeight
              });
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
              this.setData({
                cachedPixelData: imageData.data,
                cachedWidth: width,
                cachedHeight: height
              });
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
        gridInfo: { gridData: mergedGrid, cols: result.cols, rows: result.rows, gridSize: qualityGridSize },
        flatCells: flatCells,
        isProcessing: false
      });
      
      this.triggerEvent('mosaicGenerated', { 
        gridInfo: { gridData: mergedGrid, cols: result.cols, rows: result.rows, gridSize: qualityGridSize } 
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
        gridInfo: { gridData: mergedGrid, cols: result.cols, rows: result.rows, gridSize: qualityGridSize },
        flatCells: flatCells,
        isProcessing: false
      });
      
      this.triggerEvent('mosaicGenerated', { 
        gridInfo: { gridData: mergedGrid, cols: result.cols, rows: result.rows, gridSize: qualityGridSize } 
      });
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