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
    // 预览质量: 1=低(快速), 2=中, 3=高(精细)
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
    // 原始像素数据缓存
    cachedPixelData: null,
    cachedWidth: 0,
    cachedHeight: 0
  },

  observers: {
    'imagePath': function(newPath) {
      console.log('[MosaicCanvas] 收到 imagePath:', newPath);
      if (newPath) {
        this.processImage(newPath);
      }
    },
    'gridSize, mergeThreshold': function(newGridSize, newMergeThreshold) {
      // 使用缓存的像素数据重新生成
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
    // 从缓存重新生成马赛克
    regenerateFromCache() {
      const { cachedPixelData, cachedWidth, cachedHeight, gridSize, mergeThreshold, previewQuality } = this.data;
      
      if (!cachedPixelData || cachedWidth === 0) return;
      
      console.log('[MosaicCanvas] 从缓存重新生成, quality:', previewQuality);
      
      // 根据预览质量调整 gridSize
      const qualityGridSize = this.getQualityGridSize(previewQuality);
      
      const result = processSimple(cachedPixelData, cachedWidth, cachedHeight, qualityGridSize);
      
      // 执行合并
      const mergedGrid = this.mergeRegions(result.gridData, result.rows, result.cols, mergeThreshold);
      
      // 生成 flatCells
      const flatCells = [];
      for (let row = 0; row < result.rows; row++) {
        for (let col = 0; col < result.cols; col++) {
          flatCells.push(mergedGrid[row][col]);
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
    
    // 根据质量获取合适的 gridSize
    getQualityGridSize(quality) {
      const baseGridSize = this.data.gridSize;
      switch (quality) {
        case 1: return Math.max(8, baseGridSize * 2);  // 低质量，更大的格子
        case 2: return baseGridSize;                   // 中等质量
        case 3: return Math.max(4, Math.floor(baseGridSize / 2)); // 高质量，更小的格子
        default: return baseGridSize;
      }
    },

    // 处理图像
    processImage(imagePath) {
      console.log('[MosaicCanvas] 开始处理图片:', imagePath);
      console.log('[MosaicCanvas] 当前参数 - gridSize:', this.data.gridSize, 'mergeThreshold:', this.data.mergeThreshold, 'quality:', this.data.previewQuality);
      
      this.setData({
        isProcessing: true,
        gridInfo: null,
        flatCells: [],
        cachedPixelData: null,
        cachedWidth: 0,
        cachedHeight: 0
      });

      const that = this;
      const baseGridSize = this.data.gridSize;
      const quality = this.data.previewQuality;
      
      // 根据质量调整实际 gridSize
      const actualGridSize = this.getQualityGridSize(quality);

      wx.getImageInfo({
        src: imagePath,
        success(res) {
          console.log('[MosaicCanvas] 图片尺寸:', res.width, res.height);

          // 获取父容器宽度（大约屏幕宽度 * 0.9 * 0.9）
          const systemInfo = wx.getSystemInfoSync();
          const maxPreviewWidth = systemInfo.windowWidth * 0.81; // 95% * 90% * 稍微留空
          
          // 根据图片比例计算显示尺寸
          let displayWidth = maxPreviewWidth;
          let displayHeight = (res.height / res.width) * displayWidth;
          
          // 限制最大高度，避免太高
          const maxHeight = systemInfo.windowHeight * 0.6;
          if (displayHeight > maxHeight) {
            displayHeight = maxHeight;
            displayWidth = (displayHeight / res.height) * res.width;
          }

          // 限制最小尺寸
          displayWidth = Math.max(displayWidth, 200);
          displayHeight = Math.max(displayHeight, 200);

          that.setData({
            canvasWidth: Math.floor(displayWidth),
            canvasHeight: Math.floor(displayHeight)
          });

          // 尝试获取真实像素数据
          that.tryGetPixelData(imagePath, res.width, res.height, Math.floor(displayWidth), Math.floor(displayHeight), actualGridSize);
        },
        fail(e) {
          console.error('[MosaicCanvas] wx.getImageInfo失败:', e);
          // 回退到改进的伪随机算法
          that.generateImprovedMosaic(300, 300, actualGridSize);
        }
      });
    },

    // 尝试多种方式获取像素数据
    tryGetPixelData(imagePath, srcWidth, srcHeight, destWidth, destHeight, gridSize) {
      const that = this;

      // 方法1: 使用 OffscreenCanvas
      this.tryOffscreenCanvas(imagePath, srcWidth, srcHeight, destWidth, destHeight, gridSize, 
        // 成功回调
        (pixelData) => {
          // 缓存像素数据
          that.setData({
            cachedPixelData: pixelData,
            cachedWidth: srcWidth,
            cachedHeight: srcHeight
          });
          
          that.processPixelData(pixelData, srcWidth, srcHeight, destWidth, destHeight, gridSize);
        },
        // 失败回调，尝试下一个方法
        () => {
          that.tryNodeQuery(imagePath, srcWidth, srcHeight, destWidth, destHeight, gridSize);
        }
      );
    },

    // 方法1: OffscreenCanvas
    tryOffscreenCanvas(imagePath, srcWidth, srcHeight, destWidth, destHeight, gridSize, onSuccess, onFail) {
      try {
        const offCanvas = wx.createOffscreenCanvas({
          type: '2d',
          width: srcWidth,
          height: srcHeight
        });

        if (!offCanvas) {
          onFail();
          return;
        }

        const ctx = offCanvas.getContext('2d');
        const img = offCanvas.createImage();

        img.onload = () => {
          ctx.drawImage(img, 0, 0);
          try {
            const imageData = ctx.getImageData(0, 0, srcWidth, srcHeight);
            console.log('[MosaicCanvas] OffscreenCanvas 成功获取像素');
            onSuccess(imageData.data);
          } catch (e) {
            console.log('[MosaicCanvas] OffscreenCanvas getImageData 失败:', e.message);
            onFail();
          }
        };

        img.onerror = () => {
          console.log('[MosaicCanvas] OffscreenCanvas 图片加载失败');
          onFail();
        };

        img.src = imagePath;
      } catch (e) {
        console.log('[MosaicCanvas] OffscreenCanvas 不可用:', e.message);
        onFail();
      }
    },

    // 方法2: Canvas 节点查询
    tryNodeQuery(imagePath, srcWidth, srcHeight, destWidth, destHeight, gridSize) {
      const that = this;

      const query = wx.createSelectorQuery();
      query.select('#pixel-canvas')
        .node((res) => {
          // 修复：检查 res 是否存在
          if (!res) {
            console.log('[MosaicCanvas] Canvas节点 查询结果为空');
            that.generateImprovedMosaic(srcWidth, srcHeight, gridSize);
            return;
          }
          
          if (res.node) {
            const canvas = res.node;
            canvas.width = srcWidth;
            canvas.height = srcHeight;
            const ctx = canvas.getContext('2d');

            const img = canvas.createImage();
            img.onload = () => {
              ctx.drawImage(img, 0, 0);
              try {
                const imageData = ctx.getImageData(0, 0, srcWidth, srcHeight);
                console.log('[MosaicCanvas] Canvas节点 成功获取像素');
                
                that.setData({
                  cachedPixelData: imageData.data,
                  cachedWidth: srcWidth,
                  cachedHeight: srcHeight
                });
                
                that.processPixelData(imageData.data, srcWidth, srcHeight, destWidth, destHeight, gridSize);
              } catch (e) {
                console.log('[MosaicCanvas] node getImageData 失败');
                that.generateImprovedMosaic(srcWidth, srcHeight, gridSize);
              }
            };
            img.onerror = () => {
              that.generateImprovedMosaic(srcWidth, srcHeight, gridSize);
            };
            img.src = imagePath;
          } else {
            that.generateImprovedMosaic(srcWidth, srcHeight, gridSize);
          }
        })
        .exec();
    },

    // 方法3: 使用 wx.createCanvasContext (传统方式)
    tryLegacyCanvas(imagePath, srcWidth, srcHeight, destWidth, destHeight, gridSize) {
      const that = this;
      
      const ctx = wx.createCanvasContext('pixel-canvas', this);
      
      ctx.drawImage(imagePath, 0, 0, srcWidth, srcHeight);
      ctx.draw(false, () => {
        // 尝试获取像素...
        // 微信小程序旧版画布不支持 getImageData
        that.generateImprovedMosaic(srcWidth, srcHeight, gridSize);
      });
    },

    // 改进的伪随机马赛克（回退方案，但比之前好）
    generateImprovedMosaic(width, height, gridSize) {
      console.log('[MosaicCanvas] 使用改进的伪随机算法, size:', width, height, 'grid:', gridSize);
      
      // 如果有缓存的图像路径，使用它生成更好的伪随机
      // 否则使用基于位置的确定性噪声
      const seed = this.data.imagePath ? this.hashString(this.data.imagePath) : width * height;
      
      const cols = Math.ceil(width / gridSize);
      const rows = Math.ceil(height / gridSize);
      
      const gridData = [];
      
      // 使用更复杂的噪声函数模拟图像
      for (let row = 0; row < rows; row++) {
        gridData[row] = [];
        for (let col = 0; col < cols; col++) {
          // 模拟图像纹理：中心区域更亮，边缘更暗
          const centerX = cols / 2;
          const centerY = rows / 2;
          const distFromCenter = Math.sqrt(
            Math.pow((col - centerX) / centerX, 2) + 
            Math.pow((row - centerY) / centerY, 2)
          );
          
          // 添加一些变化
          const noise1 = this.noise2D(col * 0.1, row * 0.1, seed);
          const noise2 = this.noise2D(col * 0.2 + 100, row * 0.2 + 100, seed);
          const noise3 = this.noise2D(col * 0.05, row * 0.05, seed + 500);
          
          // 组合噪声产生颜色
          const r = Math.floor(80 + noise1 * 100 + distFromCenter * 50);
          const g = Math.floor(60 + noise2 * 120 + distFromCenter * 30);
          const b = Math.floor(40 + noise3 * 140 + distFromCenter * 20);
          
          const dominantColor = {
            r: Math.max(0, Math.min(255, r)),
            g: Math.max(0, Math.min(255, g)),
            b: Math.max(0, Math.min(255, b))
          };
          
          const markColor = findClosestMarkColor(dominantColor);
          
          gridData[row][col] = {
            x: col * gridSize,
            y: row * gridSize,
            width: gridSize,
            height: gridSize,
            originalRgb: dominantColor,
            markCode: markColor.code,
            markHex: markColor.hex,
            markRgb: markColor.rgb,
            merged: false
          };
        }
      }
      
      // 执行合并
      const mergedGrid = this.mergeRegions(gridData, rows, cols, this.data.mergeThreshold);
      
      // 生成 flatCells
      const flatCells = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          flatCells.push(mergedGrid[row][col]);
        }
      }
      
      this.setData({
        gridInfo: { gridData: mergedGrid, cols, rows, gridSize },
        flatCells: flatCells,
        isProcessing: false
      });
      
      this.triggerEvent('mosaicGenerated', { 
        gridInfo: { gridData: mergedGrid, cols, rows, gridSize } 
      });
    },

    // 简单的2D噪声函数
    noise2D(x, y, seed) {
      const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
      return n - Math.floor(n);
    },

    // 字符串哈希
    hashString(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash);
    },

    // 计算两个RGB颜色的欧氏距离
    colorDistance(c1, c2) {
      return Math.sqrt(
        Math.pow(c1.r - c2.r, 2) +
        Math.pow(c1.g - c2.g, 2) +
        Math.pow(c1.b - c2.b, 2)
      );
    },

    // 区域颜色合并 - 使用BFS合并相邻的相似颜色
    mergeRegions(gridData, rows, cols, threshold) {
      console.log('[MosaicCanvas] mergeRegions 开始, rows:', rows, 'cols:', cols, 'threshold:', threshold);

      if (threshold <= 0 || !gridData || gridData.length === 0 || rows <= 0 || cols <= 0) {
        console.log('[MosaicCanvas] threshold <= 0 或数据无效, 跳过合并');
        return gridData;
      }

      const visited = Array(rows).fill(null).map(() => Array(cols).fill(false));
      const mergedGrid = Array(rows).fill(null).map(() => Array(cols).fill(null));

      const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (visited[row][col] || mergedGrid[row][col]) continue;

          const queue = [[row, col]];
          visited[row][col] = true;

          const regionColors = [gridData[row][col].markRgb];
          const regionCells = [[row, col]];

          let head = 0;
          while (head < queue.length) {
            const [r, c] = queue[head++];

            for (const [dr, dc] of directions) {
              const nr = r + dr;
              const nc = c + dc;

              if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr][nc]) {
                const currentColor = gridData[r][c].markRgb;
                const neighborColor = gridData[nr][nc].markRgb;

                const dist = this.colorDistance(currentColor, neighborColor);

                if (dist <= threshold) {
                  visited[nr][nc] = true;
                  queue.push([nr, nc]);
                  regionColors.push(neighborColor);
                  regionCells.push([nr, nc]);
                }
              }
            }
          }

          let avgR = 0, avgG = 0, avgB = 0;
          for (const rgb of regionColors) {
            avgR += rgb.r;
            avgG += rgb.g;
            avgB += rgb.b;
          }
          avgR = Math.round(avgR / regionColors.length);
          avgG = Math.round(avgG / regionColors.length);
          avgB = Math.round(avgB / regionColors.length);

          const avgColor = { r: avgR, g: avgG, b: avgB };
          const markColor = findClosestMarkColor(avgColor);

          for (const [r, c] of regionCells) {
            mergedGrid[r][c] = {
              ...gridData[r][c],
              originalRgb: avgColor,
              markCode: markColor.code,
              markHex: markColor.hex,
              markRgb: markColor.rgb,
              merged: regionCells.length > 1
            };
          }
        }
      }

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (!mergedGrid[row][col] && gridData[row][col]) {
            mergedGrid[row][col] = gridData[row][col];
          }
        }
      }

      return mergedGrid;
    },

    // 处理像素数据
    processPixelData(data, srcWidth, srcHeight, destWidth, destHeight, gridSize) {
      console.log('[MosaicCanvas] 处理像素数据, mergeThreshold:', this.data.mergeThreshold);

      const result = processSimple(data, srcWidth, srcHeight, gridSize);
      
      // 执行颜色合并
      const mergedGrid = this.mergeRegions(result.gridData, result.rows, result.cols, this.data.mergeThreshold);
      console.log('[MosaicCanvas] 颜色合并完成');

      // 生成 flatCells
      const flatCells = [];
      for (let row = 0; row < result.rows; row++) {
        for (let col = 0; col < result.cols; col++) {
          flatCells.push(mergedGrid[row][col]);
        }
      }

      console.log('[MosaicCanvas] 渲染完成');

      this.setData({
        gridInfo: { gridData: mergedGrid, cols: result.cols, rows: result.rows, gridSize },
        isProcessing: false,
        flatCells: flatCells
      });

      this.triggerEvent('mosaicGenerated', { 
        gridInfo: { gridData: mergedGrid, cols: result.cols, rows: result.rows, gridSize } 
      });
    },

    // 处理格子点击
    handleCellTap(e) {
      const { code } = e.currentTarget.dataset;
      console.log('[MosaicCanvas] 点击格子, code:', code);
      this.triggerEvent('cellClick', { code });
    },

    // 切换全屏
    toggleFullscreen() {
      const isFullscreen = !this.data.isFullscreen;
      this.setData({ isFullscreen });

      if (isFullscreen) {
        wx.setNavigationBarTitle({ title: '马赛克预览 (全屏)' });
      } else {
        wx.setNavigationBarTitle({ title: 'Mark 色彩马赛克' });
      }
    },

    // 触摸开始
    handleTouchStart(e) {
      const touches = e.touches;
      if (touches.length === 2) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        this.initialDistance = Math.sqrt(dx * dx + dy * dy);
        this.initialScale = this.data.scale;
      }
    },

    // 触摸移动
    handleTouchMove(e) {
      const touches = e.touches;
      if (touches.length === 2 && this.initialDistance) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        const currentDistance = Math.sqrt(dx * dx + dy * dy);

        const scaleChange = currentDistance / this.initialDistance;
        let newScale = this.initialScale * scaleChange;
        newScale = Math.max(0.3, Math.min(5, newScale));

        this.setData({ scale: newScale });
      }
    },

    // 触摸结束
    handleTouchEnd(e) {
      this.initialDistance = null;
    }
  }
});