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
          this._clearUndoAndNotify();
        }, 200);
      }
    },
    'gridSize, mergeThreshold, previewQuality, processMode': function() {
      if (this.data.isProcessing) return;

      const key = `${this.data.gridSize}_${this.data.mergeThreshold}_${this.data.previewQuality}_${this.data.processMode}`;
      if (this._lastProcessedKey === key) return;
      this._lastProcessedKey = key;

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

      this._reapplyPipeline(3);
    },
    'useSpecialColors': function() {
      if (this.data.isProcessing) return;
      if (!this._pipeline) this._initPipeline();
      this._pipeline.update({ useSpecialColors: this.data.useSpecialColors });
      this._reapplyPipeline(3);
    },
    'algorithmVersion': function() {
      if (this.data.isProcessing) return;
      if (!this._pipeline) this._initPipeline();
      this._pipeline.update({ algorithmVersion: this.data.algorithmVersion });
      this._reapplyPipeline(3);
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
      this._reapplyPipeline(2);
    },
    'antiGrayIntensity': function(newVal, oldVal) {
      if (oldVal === newVal || (oldVal !== oldVal && newVal !== newVal)) return;
      if (this.data.isProcessing) return;
      if (!this.cachedGridData) return;
      if (!this._pipeline) this._initPipeline();
      this._pipeline.update({ antiGrayIntensity: this.data.antiGrayIntensity });
      this._reapplyPipeline(2);
    },
    'gridPreset': function(newVal, oldVal) {
      if (oldVal && oldVal[0] === newVal[0]) return;
      this._reapplyPipeline(1);
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

    _initPipeline() {
      this._pipeline = createColorPipeline({
        algorithmVersion: this.data.algorithmVersion,
        vibrantScale: this.data.vibrantScale,
        mergeThreshold: this.data.mergeThreshold,
        useSpecialColors: this.data.useSpecialColors,
        antiGrayIntensity: this.data.antiGrayIntensity,
      });
    },

    _clearUndoAndNotify() {
      this.triggerEvent('undoCleared');
    },

    _reapplyPipeline(level) {
      if (level >= 3) {
        if (this.cachedPixelData && this.cachedWidth > 0) {
          this.triggerEvent('loadingChange', { show: true, text: '正在处理图片...' });
          this.setData({ isProcessing: true }, () => {
            setTimeout(() => {
              this.regenerateFromCache();
              this._clearUndoAndNotify();
            }, 100);
          });
        } else if (this.data.imagePath) {
          this.processImage(this.data.imagePath);
        }
        return;
      }

      this._waitForData((rows, cols, gridSize) => {
        this.setData({ isProcessing: true });

        if (level >= 2) {
          if (!this._pipeline) this._initPipeline();
          this._pipeline.update({
            vibrantScale: this.data.vibrantScale,
            antiGrayIntensity: this.data.antiGrayIntensity,
            useSpecialColors: this.data.useSpecialColors,
            algorithmVersion: this.data.algorithmVersion,
            mergeThreshold: this.data.mergeThreshold
          });

          if (this.cachedOriginalGridData) {
            const origRows = this.cachedOriginalGridData.length;
            const origCols = this.cachedOriginalGridData[0] ? this.cachedOriginalGridData[0].length : 0;
            const isCropped = rows !== origRows || cols !== origCols;

            if (isCropped) {
              const fullGrid = this.deepCloneGridData(this.cachedOriginalGridData, origRows, origCols);
              this._pipeline.reapplyColors(fullGrid, origRows, origCols);
              if (this.data.antiGrayIntensity > 0) {
                desaturateGrayColors(fullGrid, origRows, origCols, this.data.antiGrayIntensity);
              }
              this.cachedOriginalGridData = fullGrid;
              const presetResult = this._applyGridPreset(fullGrid, origCols, origRows, this.data.gridPreset);
              this.cachedGridData = presetResult.gridData;
              this.cachedGridInfo = { cols: presetResult.cols, rows: presetResult.rows, gridSize };
            } else {
              this._pipeline.reapplyColors(this.cachedGridData, rows, cols);
              if (this.data.antiGrayIntensity > 0) {
                desaturateGrayColors(this.cachedGridData, rows, cols, this.data.antiGrayIntensity);
              }
              this.cachedOriginalGridData = this.cachedGridData;
            }
          } else {
            this._pipeline.reapplyColors(this.cachedGridData, rows, cols);
            if (this.data.antiGrayIntensity > 0) {
              desaturateGrayColors(this.cachedGridData, rows, cols, this.data.antiGrayIntensity);
            }
          }
        }

        if (level === 1) {
          if (this.cachedOriginalGridData) {
            const origRows = this.cachedOriginalGridData.length;
            const origCols = this.cachedOriginalGridData[0] ? this.cachedOriginalGridData[0].length : 0;
            const presetVal = this.data.gridPreset;
            const targetCols = presetVal[1];
            const targetRows = presetVal[2];

            if (targetCols === 0 || targetRows === 0) {
              this._cropOffsetCol = 0;
              this._cropOffsetRow = 0;
              this.cachedGridData = this.deepCloneGridData(this.cachedOriginalGridData, origRows, origCols);
              this.cachedGridInfo = { cols: origCols, rows: origRows, gridSize };
            } else {
              const presetResult = this._applyGridPreset(this.cachedOriginalGridData, origCols, origRows, presetVal);
              this.cachedGridData = presetResult.gridData;
              this.cachedGridInfo = { cols: presetResult.cols, rows: presetResult.rows, gridSize };
            }
            this.resetPreviewState();
            const gi = this.cachedGridInfo;
            this.triggerEvent('gridInfoUpdate', { cols: gi.cols, rows: gi.rows });
          } else {
            this.setData({ isProcessing: false });
            const waitAndApply = (retryCount) => {
              if (retryCount > 10) return;
              if (!this.cachedOriginalGridData) {
                setTimeout(() => waitAndApply(retryCount + 1), 100);
                return;
              }
              this._reapplyPipeline(1);
            };
            waitAndApply(0);
            return;
          }
        }

        const gi = this.cachedGridInfo;
        const gd = this.cachedGridData;
        const stats = this.calculateStats(gd, gi.rows, gi.cols);
        this.triggerEvent('statsUpdate', { stats: stats });
        this.setData({ isProcessing: false });
        this.renderToCanvas(gd, gi.cols, gi.rows, gridSize);

        if (level >= 1) {
          this._clearUndoAndNotify();
        }
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
