// components/mosaicCanvas/mosaicCanvas.js
const colorProcessing = require('./mixins/colorProcessing');
const renderer = require('./mixins/renderer');
const interaction = require('./mixins/interaction');
const colorReplace = require('./mixins/colorReplace');
const imageProcessing = require('./mixins/imageProcessing');
const exportPreset = require('./mixins/exportPreset');
const { createColorPipeline } = require('../../utils/colorPipeline');
const { desaturateGrayColors } = require('../../utils/imageProcessor');

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
    // 算法版本：'classic' | 'current' | 'perceptual'
    algorithmVersion: { type: String, value: 'perceptual' }
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
    cachedHeight: 0
  },

  // 使用普通属性存储大数组，避免通过 setData 传输
  cachedPixelData: null,
  cachedSegments: null,
  _cropOffsetCol: 0,
  _cropOffsetRow: 0,
  canvasCtx: null,
  canvasNode: null,

  lifetimes: {
    attached() {
      this._initPipeline();
    },
  },

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

      // 更新管道参数
      if (this._pipeline) {
        this._pipeline.update({ mergeThreshold: this.data.mergeThreshold });
      }

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
      // 特殊色开关变化需重跑完整处理（改变映射逻辑）
      if (this.data.isProcessing) return;
      if (!this._pipeline) this._initPipeline();
      this._pipeline.update({ useSpecialColors: this.data.useSpecialColors });
      if (this.cachedPixelData && this.cachedWidth > 0) {
        this.triggerEvent('loadingChange', { show: true, text: '正在处理图片...' });
        this.setData({ isProcessing: true }, () => {
          setTimeout(() => {
            this.regenerateFromCache();
          }, 100);
        });
      }
    },
    'algorithmVersion': function() {
      // 算法版本变化需重跑完整处理
      if (this.data.isProcessing) return;
      if (!this._pipeline) this._initPipeline();
      this._pipeline.update({ algorithmVersion: this.data.algorithmVersion });
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
        if (!this._pipeline) this._initPipeline();
        this._pipeline.update({ vibrantScale: this.data.vibrantScale });

        // 鲜艳度聚合必须基于全图颜色分布，避免裁剪后聚类不一致
        if (this.cachedOriginalGridData && this.cachedGridInfo) {
          const origCols = this.cachedOriginalGridData[0] ? this.cachedOriginalGridData[0].length : 0;
          const origRows = this.cachedOriginalGridData.length;
          const isCropped = rows !== origRows || cols !== origCols;

          if (isCropped) {
            // 从全图快照恢复 → 全图聚合 → 再裁剪到预设
            const fullGrid = this.deepCloneGridData(this.cachedOriginalGridData, origRows, origCols);
            this._pipeline.reapplyColors(fullGrid, origRows, origCols);
            // 保存聚合结果回快照（后续裁剪时复用）
            this.cachedOriginalGridData = this.deepCloneGridData(fullGrid, origRows, origCols);
            // 裁剪
            const presetVal = this.data.gridPreset;
            const presetResult = this._applyGridPreset(fullGrid, origCols, origRows, presetVal);
            this.cachedGridData = presetResult.gridData;
            this.cachedGridInfo = { cols: presetResult.cols, rows: presetResult.rows, gridSize };
          } else {
            // 原图比例：直接在当前数据上做
            this._pipeline.reapplyColors(this.cachedGridData, rows, cols);
            this.cachedOriginalGridData = this.deepCloneGridData(this.cachedGridData, rows, cols);
          }
        } else {
          this._pipeline.reapplyColors(this.cachedGridData, rows, cols);
        }

        const gi = this.cachedGridInfo;
        const gd = this.cachedGridData;
        const stats = this.calculateStats(gd, gi.rows, gi.cols);
        this.triggerEvent('statsUpdate', { stats: stats });
        this.setData({ isProcessing: false });
        this.renderToCanvas(gd, gi.cols, gi.rows, gridSize);
      });
    },
    'antiGrayIntensity': function(newVal, oldVal) {
      if (oldVal === newVal || (oldVal !== oldVal && newVal !== newVal)) return;
      if (this.data.isProcessing) return;
      // 首次加载时 _applyColorAndPreset 已处理过，不需要重新生成
      if (!this.cachedGridData) return;
      if (!this._pipeline) this._initPipeline();
      this._pipeline.update({ antiGrayIntensity: this.data.antiGrayIntensity });
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

        // 从快照（原始数据，未应用鲜艳度/聚合/特殊色替换）恢复并裁剪
        if (targetCols === 0 || targetRows === 0) {
          // 原图比例：从快照快速恢复
          this._cropOffsetCol = 0;
          this._cropOffsetRow = 0;
          this.cachedGridData = this.deepCloneGridData(this.cachedOriginalGridData, origRows, origCols);
          this.cachedGridInfo = { cols: origCols, rows: origRows, gridSize };
        } else {
          const presetResult = this._applyGridPreset(this.cachedOriginalGridData, origCols, origRows, newVal);
          this.cachedGridData = presetResult.gridData;
          this.cachedGridInfo = { cols: presetResult.cols, rows: presetResult.rows, gridSize };
        }

        // 裁剪后不修改任何色块：快照中已保存首次处理时的最终色号，直接复用

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
    ...exportPreset,

    // 初始化色彩处理管道
    _initPipeline() {
      this._pipeline = createColorPipeline({
        algorithmVersion: this.data.algorithmVersion,
        vibrantScale: this.data.vibrantScale,
        mergeThreshold: this.data.mergeThreshold,
        useSpecialColors: this.data.useSpecialColors,
        antiGrayIntensity: this.data.antiGrayIntensity,
      });
    },

    // 从快照恢复 rawRgb（用于鲜艳度/特殊色参数变化时重新后处理）
    _restoreRawFromSnapshot(gridData, rows, cols) {
      const snapshot = this.cachedOriginalGridData;
      if (!snapshot) return;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cell = gridData[row] && gridData[row][col];
          const snapRow = snapshot.length === rows ? row : 0;
          const snapCol = snapshot[0] && snapshot[0].length === cols ? col : 0;
          const snapCell = snapshot[snapRow] && snapshot[snapRow][snapCol];
          if (cell && snapCell) {
            cell.rawRgb = snapCell.rawRgb ? { ...snapCell.rawRgb } : null;
            cell.markCode = snapCell.markCode;
            cell.markHex = snapCell.markHex;
            cell.markRgb = snapCell.markRgb ? { ...snapCell.markRgb } : null;
          }
        }
      }
    },

    // 覆盖 mixin 的 _applyColorAndPreset（卡通模式专用）
    // 完整后处理：鲜艳度 + 聚合 + 特殊色替换 + 浊色规避
    _applyColorAndPreset(gridData, rows, cols, gridSize) {
      if (this._pipeline) {
        this._pipeline.reapplyColors(gridData, rows, cols);
      }
      if (this.data.antiGrayIntensity > 0) {
        desaturateGrayColors(gridData, rows, cols, this.data.antiGrayIntensity);
      }
      this.cachedOriginalGridData = this.deepCloneGridData(gridData, rows, cols);
      const presetResult = this._applyGridPreset(gridData, cols, rows);
      this.cachedGridData = presetResult.gridData;
      this.cachedGridInfo = { cols: presetResult.cols, rows: presetResult.rows, gridSize };
      return presetResult;
    },

    // 马赛克模式专用：保留 processMosaicV2 自己的色号映射，不走 reapplyColors
    _applyMosaicResult(gridData, rows, cols, gridSize) {
      if (this._pipeline) {
        this._pipeline.replaceSpecialsOnly(gridData, rows, cols);
      }
      // 浊色规避在快照保存之前执行
      if (this.data.antiGrayIntensity > 0) {
        desaturateGrayColors(gridData, rows, cols, this.data.antiGrayIntensity);
      }
      this.cachedOriginalGridData = this.deepCloneGridData(gridData, rows, cols);
      const presetResult = this._applyGridPreset(gridData, cols, rows);
      this.cachedGridData = presetResult.gridData;
      this.cachedGridInfo = { cols: presetResult.cols, rows: presetResult.rows, gridSize };
      return presetResult;
    },

    // 覆盖 mixin 的 regenerateFromCache，使用管道处理
    regenerateFromCache() {
      const pixelData = this.getCachedPixelData();
      const cachedWidth = this.cachedWidth;
      const cachedHeight = this.cachedHeight;
      if (!pixelData || cachedWidth === 0) return;

      // 确保管道已初始化
      if (!this._pipeline) this._initPipeline();

      const qualityGridSize = this.getQualityGridSize(this.data.previewQuality);

      if (this.data.processMode === 'mosaic') {
        // 马赛克模式：暂不支持算法切换，使用 imageProcessor 原版
        const { processMosaicV2, processWithSmartRegions } = require('../../utils/imageProcessor');
        try {
          const result = processMosaicV2(pixelData, cachedWidth, cachedHeight, {
            gridSize: qualityGridSize,
            forceGridSize: this.data.forceGridSize || null,
            blurRadius: 2,
            morphRadius: 1,
            minCellArea: 30,
            mergeThreshold: this.data.mergeThreshold
          });
          this._finishMosaicResult(result, qualityGridSize, cachedWidth, cachedHeight);
        } catch (e) {
          console.error('马赛克模式处理失败:', e);
          try {
            const result = processWithSmartRegions(pixelData, cachedWidth, cachedHeight, qualityGridSize);
            this._finishSimpleResult(result, qualityGridSize);
          } catch (e2) {
            console.error('回退也失败了:', e2);
            this.setData({ isProcessing: false });
          }
        }
      } else {
        // 卡通模式：管道统一处理
        const result = this._pipeline.processPixels(pixelData, cachedWidth, cachedHeight, qualityGridSize);
        this._finishSimpleResult(result, qualityGridSize);
      }
    }
  }
});
