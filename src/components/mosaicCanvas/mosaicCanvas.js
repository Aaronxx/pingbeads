// components/mosaicCanvas/mosaicCanvas.js
const { findClosestMarkColor } = require('../../utils/colorMapper');

Component({
  properties: {
    imagePath: { type: String, value: '' },
    gridSize: { type: Number, value: 10 },
    mergeThreshold: { type: Number, value: 85 },
    highlightCode: { type: String, value: null },
    showCode: { type: Boolean, value: false },
    scale: { type: Number, value: 1 }
  },

  data: {
    canvasWidth: 300,
    canvasHeight: 300,
    isProcessing: false,
    gridInfo: null,
    isFullscreen: false,
    scale: 1,
    flatCells: []
  },

  observers: {
    'imagePath': function(newPath) {
      console.log('[MosaicCanvas] 收到 imagePath:', newPath);
      if (newPath) {
        this.processImage(newPath);
      }
    },
    'gridSize, mergeThreshold': function() {
      if (this.data.imagePath) {
        this.processImage(this.data.imagePath);
      }
    }
  },

  methods: {
    // 处理图像
    processImage(imagePath) {
      console.log('[MosaicCanvas] 开始处理图片:', imagePath);
      this.setData({ isProcessing: true });

      const that = this;
      const gridSize = this.data.gridSize;

      wx.getImageInfo({
        src: imagePath,
        success(res) {
          console.log('[MosaicCanvas] 图片尺寸:', res.width, res.height);

          const maxWidth = 300;
          const scale = maxWidth / res.width;
          const outputWidth = maxWidth;
          const outputHeight = Math.round(res.height * scale);

          that.setData({
            canvasWidth: outputWidth,
            canvasHeight: outputHeight
          });

          that.generateMosaic(res.width, res.height, outputWidth, outputHeight, gridSize);
        },
        fail(e) {
          console.error('[MosaicCanvas] 图片加载失败:', e);
          that.setData({ isProcessing: false });
          wx.showToast({ title: '图片加载失败', icon: 'none' });
        }
      });
    },

    // 生成马赛克
    generateMosaic(srcWidth, srcHeight, destWidth, destHeight, gridSize) {
      console.log('[MosaicCanvas] 开始生成马赛克');

      const cols = Math.ceil(destWidth / gridSize);
      const rows = Math.ceil(destHeight / gridSize);
      const gridData = [];
      const flatCells = [];

      // 模拟生成颜色 - 使用图片尺寸作为随机种子
      const seed = srcWidth * srcHeight;
      let colorIndex = 0;

      for (let row = 0; row < rows; row++) {
        gridData[row] = [];
        for (let col = 0; col < cols; col++) {
          // 基于位置生成伪随机颜色
          const pseudoRandom = Math.sin(row * 12.9898 + col * 78.233 + seed) * 43758.5453;
          const r = Math.floor((pseudoRandom - Math.floor(pseudoRandom)) * 256);
          const g = Math.floor((pseudoRandom * 2 - Math.floor(pseudoRandom * 2)) * 256);
          const b = Math.floor((pseudoRandom * 4 - Math.floor(pseudoRandom * 4)) * 256);

          const dominantColor = { r, g, b };
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

          flatCells.push(gridData[row][col]);
        }
      }

      const result = { gridData, cols, rows, gridSize };
      console.log('[MosaicCanvas] 生成完成, cells:', flatCells.length);

      this.setData({
        gridInfo: result,
        isProcessing: false,
        flatCells: flatCells
      });

      this.triggerEvent('mosaicGenerated', { gridInfo: result });
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
