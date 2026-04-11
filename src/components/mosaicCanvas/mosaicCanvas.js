// components/mosaicCanvas/mosaicCanvas.js
const { processSimple, aggregateSimilarColors } = require('../../utils/imageProcessor');
const { findClosestMarkColor } = require('../../utils/colorMapper');

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
      console.log('=== imagePath observer ===');
      console.log('newPath:', newPath);
      console.log('cachedPixelData exists:', !!this.cachedPixelData);
      if (newPath) {
        this.processImage(newPath);
      }
    },
    'regenerateTrigger': function() {
      console.log('=== regenerateTrigger observer ===');
      console.log('cachedPixelData exists:', !!this.cachedPixelData);
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
      console.log('=== params observer ===');
      console.log('cachedPixelData exists:', !!this.cachedPixelData);
      console.log('imagePath:', this.data.imagePath);

      if (this.cachedPixelData && this.cachedWidth > 0) {
        // 有缓存数据，使用缓存重新生成
        console.log('use cache to regenerate');
        this.setData({ isProcessing: true });
        setTimeout(() => {
          this.regenerateFromCache();
        }, 200);
      } else if (this.data.imagePath) {
        // 没有缓存但有图片路径，重新加载图片
        console.log('reprocess image');
        this.processImage(this.data.imagePath);
      }
    },
    // 监听 scale 变化，重新渲染 Canvas
    'scale': function(newScale) {
      console.log('=== scale observer ===', newScale);
      // 当 scale 变化时，重新渲染 Canvas
      if (this.cachedGridData && this.cachedGridInfo) {
        const { cols, rows, gridSize } = this.cachedGridInfo;
        this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
      }
    },
    // 监听偏移变化，重新渲染 Canvas
    'offsetX,offsetY': function() {
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
      console.log('regenerateFromCache - stats:', stats);

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
          if (!colorCounts[code]) {
            colorCounts[code] = {
              code: cell.markCode,
              hex: cell.markHex || '#000000',
              count: 0
            };
          }
          colorCounts[code].count++;
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
      console.log('=== processImage ===');
      console.log('gridSize:', this.data.gridSize);
      console.log('mergeThreshold:', this.data.mergeThreshold);
      console.log('previewQuality:', this.data.previewQuality);

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
      console.log('stats:', stats);

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
      console.log('flatCells count:', stats.totalCount);

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

          // 使用 Canvas 极限尺寸 4096，保持最高分辨率
          const MAX_CANVAS_SIZE = 4096;
          canvasWidth = Math.min(canvasWidth, MAX_CANVAS_SIZE);
          canvasHeight = Math.min(canvasHeight, MAX_CANVAS_SIZE);

          // 如果 data 中的尺寸太小，使用查询到的尺寸（但不超极限）
          if (res[0].width > canvasWidth || res[0].height > canvasHeight) {
            canvasWidth = Math.min(res[0].width, MAX_CANVAS_SIZE);
            canvasHeight = Math.min(res[0].height, MAX_CANVAS_SIZE);
          }
          
          console.log('Canvas尺寸(来自data):', canvasWidth, 'x', canvasHeight);
          console.log('Grid尺寸:', cols, 'x', rows, '格子大小:', gridSize);
          
          // 设置 canvas 尺寸 - 应用用户缩放比例以保持高分辨率
          const userScale = that.data.scale || 1;
          canvas.width = canvasWidth * userScale;
          canvas.height = canvasHeight * userScale;

          console.log('用户缩放:', userScale, '实际Canvas尺寸:', canvas.width, 'x', canvas.height);
          
          // 存储引用
          that.canvasNode = canvas;
          that.canvasCtx = ctx;
          
          // 清空画布 - 使用浅灰色背景（使用实际Canvas尺寸）
          ctx.fillStyle = '#f0f0f0';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          // 计算缩放以适应 Canvas
          const totalGridWidth = cols * gridSize;
          const totalGridHeight = rows * gridSize;
          
          console.log('总网格尺寸:', totalGridWidth, 'x', totalGridHeight);
          
          // 计算缩放比例，让整个马赛克适应 Canvas
          const scaleX = totalGridWidth > 0 ? canvasWidth / totalGridWidth : 1;
          const scaleY = totalGridHeight > 0 ? canvasHeight / totalGridHeight : 1;
          const baseScale = Math.min(scaleX, scaleY, 1);

          // 叠加用户的缩放比例（已经在上面定义了userScale）
          const scale = baseScale * userScale;
          
          console.log('缩放比例:', scale);
          
          // 居中偏移 - 使用实际的 Canvas 尺寸
          const actualCanvasWidth = canvas.width;
          const actualCanvasHeight = canvas.height;
          const baseOffsetX = (actualCanvasWidth - totalGridWidth * scale) / 2;
          const baseOffsetY = (actualCanvasHeight - totalGridHeight * scale) / 2;
          // 加上用户的拖动偏移
          const offsetX = baseOffsetX + (this.data.offsetX || 0);
          const offsetY = baseOffsetY + (this.data.offsetY || 0);

          console.log('实际Canvas尺寸:', actualCanvasWidth, 'x', actualCanvasHeight);
          
          console.log('偏移:', offsetX, offsetY);
          
          // 绘制所有格子（每个格子独立显示）
          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
              const cell = gridData[row] && gridData[row][col];
              // 跳过空格子
              if (!cell || !cell.markCode) continue;

              const cellWidth = gridSize * scale;
              const cellHeight = gridSize * scale;

              const x = offsetX + col * gridSize * scale;
              const y = offsetY + row * gridSize * scale;

              // 绘制色块
              ctx.fillStyle = cell.markHex;
              ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(cellWidth), Math.ceil(cellHeight));

              // 绘制格子边框，让轮廓更清晰
              ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
              ctx.lineWidth = 1;
              ctx.strokeRect(Math.floor(x) + 0.5, Math.floor(y) + 0.5, Math.ceil(cellWidth) - 1, Math.ceil(cellHeight) - 1);

              // 绘制色号（根据格子大小）
              const size = Math.min(cellWidth, cellHeight);
              if (that.data.showCode && size >= 8) {
                const isLight = that.isLightColor(cell.markHex);
                ctx.fillStyle = isLight ? '#333333' : '#ffffff';
                ctx.font = `${Math.max(6, size * 0.25)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(cell.markCode, x + cellWidth / 2, y + cellHeight / 2);
              }
            }
          }

          // 绘制参考线（每10行/列一条浅蓝色线）
          that.drawGuideLines(ctx, offsetX, offsetY, cols, rows, gridSize, scale);
        });
    },

    // 绘制参考线
    drawGuideLines(ctx, offsetX, offsetY, cols, rows, gridSize, scale) {
      const lineSpacing = 10 * gridSize * scale;
      const lineColor = 'rgba(70, 130, 180, 0.8)'; // 更深更明显的钢蓝色
      const lineWidth = 3;

      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineWidth;

      // 绘制垂直参考线（每10列）
      for (let col = 10; col < cols; col += 10) {
        const x = offsetX + col * gridSize * scale;
        ctx.beginPath();
        ctx.moveTo(x, offsetY);
        ctx.lineTo(x, offsetY + rows * gridSize * scale);
        ctx.stroke();
      }

      // 绘制水平参考线（每10行）
      for (let row = 10; row < rows; row += 10) {
        const y = offsetY + row * gridSize * scale;
        ctx.beginPath();
        ctx.moveTo(offsetX, y);
        ctx.lineTo(offsetX + cols * gridSize * scale, y);
        ctx.stroke();
      }
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

    handleCellTap(e) {
      const code = e.currentTarget.dataset.code;
      this.triggerEvent('cellClick', { code });
    },

    // 记录初始双指距离
    initialTouchDistance: 0,
    initialScale: 1,

    handleTouchStart(e) {
      console.log('=== 触摸开始 ===', 'touches:', e.touches.length, 'isNewTouch:', this.data.isNewTouch);
      if (e.touches.length === 2) {
        // 双指触摸，记录初始距离和缩放
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        this.initialTouchDistance = Math.hypot(dx, dy);
        this.initialScale = this.data.scale;
      } else if (e.touches.length === 1) {
        // 只有新触摸时才重置偏移量
        if (this.data.isNewTouch) {
          this.setData({ lastTouch: e.touches[0], offsetX: 0, offsetY: 0, isNewTouch: false });
        } else {
          this.setData({ lastTouch: e.touches[0] });
        }
      }
    },

    handleTouchMove(e) {
      if (e.touches.length === 2) {
        // 双指缩放
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const currentDistance = Math.hypot(dx, dy);

        if (this.initialTouchDistance > 0) {
          const scaleFactor = currentDistance / this.initialTouchDistance;
          const newScale = Math.max(0.5, Math.min(80, this.initialScale * scaleFactor));
          this.setData({ scale: newScale });
        }
      } else if (e.touches.length === 1 && this.data.lastTouch) {
        const current = e.touches[0];
        const last = this.data.lastTouch;
        const deltaX = current.clientX - last.clientX;
        const deltaY = current.clientY - last.clientY;

        console.log('=== 触摸移动 ===', 'scale:', this.data.scale, 'deltaX:', deltaX, 'deltaY:', deltaY);

        // 放大后启用平移（任意scale都可以拖动）
        if (this.data.scale > 1.0) {
          const newOffsetX = this.data.offsetX + deltaX;
          const newOffsetY = this.data.offsetY + deltaY;
          console.log('更新偏移:', newOffsetX, newOffsetY);
          this.setData({ offsetX: newOffsetX, offsetY: newOffsetY, lastTouch: current });
        } else {
          // 小缩放时上下滑动调整缩放
          let newScale = this.data.scale;
          if (Math.abs(deltaY) > Math.abs(deltaX)) {
            newScale = Math.max(0.5, Math.min(80, newScale + deltaY * 0.003));
          }
          this.setData({ scale: newScale, lastTouch: current });
        }
      }
    },

    handleTouchEnd(e) {
      if (e.touches.length === 0) {
        this.setData({ lastTouch: null, isNewTouch: true });
        this.initialTouchDistance = 0;
      }
    }
  }
});