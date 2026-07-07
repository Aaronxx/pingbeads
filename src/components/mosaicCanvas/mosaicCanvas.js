// components/mosaicCanvas/mosaicCanvas.js
const colorProcessing = require('./mixins/colorProcessing');
const renderer = require('./mixins/renderer');
const interaction = require('./mixins/interaction');
const colorReplace = require('./mixins/colorReplace');
const imageProcessing = require('./mixins/imageProcessing');
const exportPreset = require('./mixins/exportPreset');
const { filterIsolatedRegions, preserveEdgeQuantization, getSpotCleanParams } = require('../../utils/spotCleaner');

Component({
  properties: {
    imagePath: { type: String, value: '' },
    gridSize: { type: Number, value: 10 },
    mergeThreshold: { type: Number, value: 5 },
    // 处理模式: 'normal' | 'smart' - smart 模式会保留黑色边界并合并色块
    processMode: { type: String, value: 'normal' },
    useSpecialColors: { type: Boolean, value: false },  // 是否使用特殊色（默认 false：不显示特殊色）
    removeEdge: { type: Boolean, value: false },  // 是否去除边缘底色（默认 false：不去除）
    highlightCode: { type: String, value: null },
    showCode: { type: Boolean, value: false },
    scale: { type: Number, value: 1 },
    previewQuality: { type: Number, value: 2 },
    regenerateTrigger: { type: Number, value: 0 },
    vibrantScale: { type: Number, value: 2 },  // 鲜艳度增强系数 (-10 到 10)
    antiGrayIntensity: { type: Number, value: 0.5 },  // 浊色规避强度 (0-1)
    mirrorImage: { type: Boolean, value: false },  // 是否镜像翻转
    forceGridSize: { type: Number, value: null },  // 强制使用的网格大小（跳过检测）
    // 网格预设：[预设索引, 目标列数, 目标行数]
    gridPreset: { type: Array, value: [0, 0, 0] },
    // 分块导出模式：'' | 'horizontal' | 'vertical' | 'grid2x2'
    splitMode: { type: String, value: '' },
    // 孤立区域过滤强度：0=关, 1=轻度(≤1豆), 2=中度(≤2豆), 3=强度(≤3豆)
    spotCleanLevel: { type: Number, value: 0 }
  },

  data: {
    canvasWidth: 300,
    canvasHeight: 300,
    isProcessing: false,
    gridInfo: null,
    scale: 1,
    hasUserZoomed: false,
    offsetX: 0,
    offsetY: 0,
    isNewTouch: true,
    isDragging: false,
    flatCells: [],
    cachedWidth: 0,
    cachedHeight: 0,
    vibrantScale: 2
  },

  // 使用普通属性存储大数组，避免通过 setData 传输
  cachedPixelData: null,
  cachedSegments: null,
  _cropOffsetCol: 0,
  _cropOffsetRow: 0,
  canvasCtx: null,
  canvasNode: null,

  observers: {
    'imagePath': function(newPath) {
      if (newPath) {
        this.processImage(newPath);
      }
    },
    'regenerateTrigger': function() {
      if (this.cachedPixelData && this.cachedWidth > 0) {
        this.setData({ isProcessing: true });
        setTimeout(() => {
          this.regenerateFromCache();
        }, 200);
      }
    },
    'gridSize, mergeThreshold, previewQuality, processMode': function() {
      if (this.data.isProcessing) return;

      const key = `${this.data.gridSize}_${this.data.mergeThreshold}_${this.data.previewQuality}_${this.data.processMode}`;
      if (this._lastProcessedKey === key) return;
      this._lastProcessedKey = key;

      if (this.data.processMode === 'mosaic') {
        this.cachedGridData = null;
        this.cachedGridInfo = null;
        this.cachedSegments = null;
      }
      this.cachedOriginalGridData = null;
      this._cropOffsetCol = 0;
      this._cropOffsetRow = 0;

      if (this.cachedPixelData && this.cachedWidth > 0) {
        this.triggerEvent('loadingChange', { show: true, text: '正在处理图片...' });
        this.setData({ isProcessing: true }, () => {
          setTimeout(() => {
            this.regenerateFromCache();
          }, 100);
        });
      } else if (this.data.imagePath) {
        this.processImage(this.data.imagePath);
      }
    },
    'useSpecialColors': function() {
      // 特殊色开关变化会改变 phase-1 映射逻辑(excludeSpecial)，需重跑完整处理
      if (this.data.isProcessing) return;
      if (this.cachedPixelData && this.cachedWidth > 0) {
        this.triggerEvent('loadingChange', { show: true, text: '正在处理图片...' });
        this.setData({ isProcessing: true }, () => {
          setTimeout(() => {
            this.regenerateFromCache();
          }, 100);
        });
      }
    },
    'removeEdge': function() {
      this._waitForData((rows, cols, gridSize) => {
        this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
      });
    },
    'mirrorImage': function() {
      this._waitForData((rows, cols, gridSize) => {
        this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
      });
    },
    'splitMode': function() {
      this._waitForData((rows, cols, gridSize) => {
        this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
      });
    },
    'vibrantScale': function() {
      this._waitForData((rows, cols, gridSize) => {
        this.setData({ isProcessing: true });
        this.resetToOriginalColors(this.cachedGridData, rows, cols);
        this.reapplyVibrantScale(this.cachedGridData, rows, cols);
        // 鲜艳度调节后，先做保边量化修复碎片，再做去杂色
        if (this.data.spotCleanLevel > 0) {
          const spotParams = getSpotCleanParams(this.data.spotCleanLevel);
          if (spotParams) {
            preserveEdgeQuantization(this.cachedGridData, rows, cols, spotParams.edgeThreshold);
            filterIsolatedRegions(this.cachedGridData, rows, cols, spotParams.spotThreshold);
          }
        }
        const stats = this.calculateStats(this.cachedGridData, rows, cols);
        this.triggerEvent('statsUpdate', { stats: stats });
        this.setData({ isProcessing: false });
        this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
      });
    },
    // 孤立区域过滤强度变化：需重新从快照应用颜色 + 过滤
    'spotCleanLevel': function() {
      console.log('[spotClean] observer triggered, level=', this.data.spotCleanLevel);
      this._waitForData((rows, cols, gridSize) => {
        this.setData({ isProcessing: true });
        this.resetToOriginalColors(this.cachedGridData, rows, cols);
        this.reapplyVibrantScale(this.cachedGridData, rows, cols);
        if (this.data.spotCleanLevel > 0) {
          const spotParams = getSpotCleanParams(this.data.spotCleanLevel);
          console.log('[spotClean] observer params=', spotParams);
          if (spotParams) {
            preserveEdgeQuantization(this.cachedGridData, rows, cols, spotParams.edgeThreshold);
            const modified = filterIsolatedRegions(this.cachedGridData, rows, cols, spotParams.spotThreshold);
            console.log('[spotClean] observer modified=', modified);
          }
        }
        const stats = this.calculateStats(this.cachedGridData, rows, cols);
        this.triggerEvent('statsUpdate', { stats: stats });
        this.setData({ isProcessing: false });
        this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
      });
    },
    // 浊色规避强度变化：改的是 phase-1 映射表，需重跑 regenerateFromCache
    'antiGrayIntensity': function(newVal, oldVal) {
      // 值未变化时跳过（避免首次传值等场景的 observer 误触发导致重入竞态）
      if (oldVal === newVal || (oldVal !== oldVal && newVal !== newVal)) return;
      if (this.data.isProcessing) return;
      if (this.cachedPixelData && this.cachedWidth > 0) {
        this.triggerEvent('loadingChange', { show: true, text: '正在处理图片...' });
        this.setData({ isProcessing: true }, () => {
          setTimeout(() => {
            this.regenerateFromCache();
          }, 100);
        });
      }
    },
    'gridPreset': function(newVal, oldVal) {
      // 网格预设变化时，使用原始缓存数据重新裁剪
      if (oldVal && oldVal[0] === newVal[0]) return;

      const applyPreset = () => {
        const targetCols = newVal[1];
        const targetRows = newVal[2];
        const origCols = this.cachedOriginalGridData[0] ? this.cachedOriginalGridData[0].length : 0;
        const origRows = this.cachedOriginalGridData.length;
        const gridSize = this.cachedGridInfo ? this.cachedGridInfo.gridSize : 10;

        // 从快照（原始数据，含特殊色）恢复并裁剪
        if (targetCols === 0 || targetRows === 0) {
          // 原图比例：从快照快速恢复，无需重处理
          // 重置 cropOffset，避免之前预设设置的偏移残留（修复预览无法还原）
          this._cropOffsetCol = 0;
          this._cropOffsetRow = 0;
          this.cachedGridData = this.deepCloneGridData(this.cachedOriginalGridData, origRows, origCols);
          this.cachedGridInfo = { cols: origCols, rows: origRows, gridSize };
          // cachedOriginalGridData 是未应用鲜艳度的原始数据，恢复后需要重新应用鲜艳度和特殊色
          this.replaceSpecialColors(this.cachedGridData, origRows, origCols);
          this.reapplyVibrantScale(this.cachedGridData, origRows, origCols);
        } else {
          const presetResult = this._applyGridPreset(this.cachedOriginalGridData, origCols, origRows, newVal);
          this.cachedGridData = presetResult.gridData;
          this.cachedGridInfo = { cols: presetResult.cols, rows: presetResult.rows, gridSize };

          // 非原图比例才需要重新处理颜色
          // 注意：裁剪后的数据索引与 snapshot 不对齐，不能直接调用 reapplyVibrantScale
          // （其内部的 resetToOriginalColors 会用 snapshot[row][col] 恢复，但裁剪后 row/col 对应的是原图中心区域，而非 snapshot 的同一索引）
          // 裁剪时已从 snapshot 浅拷贝了 markCode/markHex/markRgb，只需重新应用替换逻辑
          const vibrantScale = this.data.vibrantScale;
          if (vibrantScale === 0) {
            // 鲜艳度为 0：快照的 mark 值就是最终值，仅需处理特殊色替换
            if (!this.data.useSpecialColors) {
              this.replaceSpecialColors(this.cachedGridData, this.cachedGridInfo.rows, this.cachedGridInfo.cols);
            }
          } else {
            // 鲜艳度非 0：需要重新增强（从 rawRgb 计算，不依赖 snapshot 索引）
            this.replaceSpecialColors(this.cachedGridData, this.cachedGridInfo.rows, this.cachedGridInfo.cols);
            this.reapplyVibrantScale(this.cachedGridData, this.cachedGridInfo.rows, this.cachedGridInfo.cols);
          }
        }

        // 补调孤立区域过滤（gridPreset 裁剪后颜色重应用完成）
        // 顺序：先保边量化修复碎片，再做去杂色
        if (this.data.spotCleanLevel > 0) {
          const spotParams = getSpotCleanParams(this.data.spotCleanLevel);
          if (spotParams) {
            preserveEdgeQuantization(this.cachedGridData, this.cachedGridInfo.rows, this.cachedGridInfo.cols, spotParams.edgeThreshold);
            filterIsolatedRegions(this.cachedGridData, this.cachedGridInfo.rows, this.cachedGridInfo.cols, spotParams.spotThreshold);
          }
        }

        const stats = this.calculateStats(this.cachedGridData, this.cachedGridInfo.rows, this.cachedGridInfo.cols);
        const gridInfo = this.cachedGridInfo;

        wx.nextTick(() => {
          if (!gridInfo) return;
          this.triggerEvent('statsUpdate', { stats });
          this.triggerEvent('gridInfoUpdate', {
            cols: gridInfo.cols,
            rows: gridInfo.rows
          });
        });
        this.resetPreviewState();
        this.renderToCanvas(this.cachedGridData, this.cachedGridInfo.cols, this.cachedGridInfo.rows, gridSize);
      };

      if (this.cachedOriginalGridData) {
        applyPreset();
      } else {
        const waitForOriginal = (retryCount) => {
          if (retryCount > 10) {
            console.warn('[mosaicCanvas] gridPreset: 等待 cachedOriginalGridData 超时');
            return;
          }
          if (!this.cachedOriginalGridData) {
            setTimeout(() => waitForOriginal(retryCount + 1), 100);
            return;
          }
          applyPreset();
        };
        waitForOriginal(0);
      }
    },
    'scale': function() {
      if (this._isResetting) return;
      if (!this.data.hasUserZoomed) {
        this.setData({ hasUserZoomed: true });
      }
      if (this.isRendering) return;
      if (this.cachedGridData && this.cachedGridInfo) {
        const { cols, rows, gridSize } = this.cachedGridInfo;
        this._showTouchLoading = true;
        this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
      }
    },
    'offsetX,offsetY': function() {
      if (this.data.isDragging) return;
      if (this._isResetting) return;
      if (this.isRendering) return;
      if (this.cachedGridData && this.cachedGridInfo) {
        const { cols, rows, gridSize } = this.cachedGridInfo;
        this._showTouchLoading = true;
        this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
      }
    }
  },

  methods: {
    ...colorProcessing,
    ...renderer,
    ...interaction,
    ...colorReplace,
    ...imageProcessing,
    ...exportPreset
  }
});
