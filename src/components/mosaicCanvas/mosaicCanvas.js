// components/mosaicCanvas/mosaicCanvas.js
const colorProcessing = require('./mixins/colorProcessing');
const renderer = require('./mixins/renderer');
const interaction = require('./mixins/interaction');
const colorReplace = require('./mixins/colorReplace');
const imageProcessing = require('./mixins/imageProcessing');
const exportPreset = require('./mixins/exportPreset');
const { createColorPipeline } = require('../../utils/colorPipeline');
const { desaturateGrayColors, filterEdgeByMarkCode, cropMosaicData, findCropBoundaryFromGrid } = require('../../utils/imageProcessor');
const { computeBaseScale, applyCustomCrop, computeCropStartCell, getCropModeMaxScale, recalcCropWindow, computeInitialCropWindow } = require('../../utils/cropHelpers');

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
  cachedHeight: 0,
  // 裁剪模式：选预设后进入，置灰全图 + 可拖动明亮裁剪框
  cropMode: false,
  cropWinX: 0,
  cropWinY: 0,
  cropWinW: 0,
  cropWinH: 0
  },

  // 使用普通属性存储大数组，避免通过 setData 传输
  cachedPixelData: null,
  cachedSegments: null,
  _cropOffsetCol: 0,
  _cropOffsetRow: 0,
  _lastPresetIndex: 0,
  _lastPresetSize: '0_0',
  _cropConfirmed: false,
  // 裁剪状态按模式分存（模式切换时保存/恢复，避免原图比例中间态清标志）
  _cropStateCartoon: { confirmed: false, offsetCol: 0, offsetRow: 0 },
  _cropStateMosaic:  { confirmed: false, offsetCol: 0, offsetRow: 0 },
  _lastProcessMode: 'cartoon',
  _modeSwitching: false,
  canvasCtx: null,
  canvasNode: null,

  lifetimes: {
    created() {
      // WeChat 组件定义层的对象字面量不会自动赋到实例上，需在 created 里初始化
      this._cropStateCartoon = { confirmed: false, offsetCol: 0, offsetRow: 0 };
      this._cropStateMosaic = { confirmed: false, offsetCol: 0, offsetRow: 0 };
    },
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
    'gridSize, previewQuality': function() {
      // 改格子数的参数：退出 cropMode + 清缓存 + 完整重生成
      // key 包含 forceGridSize，区分自定义网格和预设网格
      const key = `${this.data.gridSize}_${this.data.previewQuality}_${this.data.forceGridSize || 'auto'}`;
      if (this._lastGridSizeKey === key) return;
      this._lastGridSizeKey = key;  // 先记录（即使 isProcessing 拦截，下次同值不会误判）
      // 模式切换中：gridSize 变化是页面层恢复模式参数导致的（非用户调整），
      // 跳过破坏性清理——裁剪状态由 _saveCropStateBeforeSwitch/_restoreCropStateAfterSwitch 维护
      if (this._modeSwitching) return;
      if (this.data.isProcessing) return;

      if (this._pipeline) {
        this._pipeline.update({ mergeThreshold: this.data.mergeThreshold });
      }

      // 格子数变更 → 裁剪定位失效，退出裁剪模式
      // 必须同步清 _cropConfirmed：否则 _applyGridPreset 的兜底（模式切换恢复时
      // 用缓存尺寸继续裁剪）会在手动改豆豆数后误触发，导致预设不重置回原图比例。
      // 模式切换（_modeSwitching=true）已提前 return，这里只会是用户手动调整。
      if (this.data.cropMode) {
        this.setData({ cropMode: false });
      }
      this._cropConfirmed = false;

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
    'mergeThreshold, processMode': function() {
      const key = `${this.data.mergeThreshold}_${this.data.processMode}`;
      if (this._lastMergeProcessKey === key) return;
      this._lastMergeProcessKey = key;  // 先记录（即使 isProcessing 拦截，下次同值不会误判）
      if (this.data.isProcessing) return;

      // 仅 mergeThreshold 变化：重生成（模式切换的恢复由 _restoreCropStateAfterSwitch 负责）
      if (this._pipeline) {
        this._pipeline.update({ mergeThreshold: this.data.mergeThreshold });
      }
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
      if (this._modeSwitching) return;
      this._waitForData((rows, cols, gridSize) => {
        if (this.data.cropMode && this.cachedOriginalGridData) {
          const orig = this._getOriginalGridSize();
          if (orig) this.renderToCanvas(this.cachedOriginalGridData, orig.cols, orig.rows, gridSize);
        } else {
          this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
        }
      });
    },
    'mirrorImage': function() {
      if (this._modeSwitching) return;
      this._waitForData((rows, cols, gridSize) => {
        if (this.data.cropMode && this.cachedOriginalGridData) {
          const orig = this._getOriginalGridSize();
          if (orig) this.renderToCanvas(this.cachedOriginalGridData, orig.cols, orig.rows, gridSize);
        } else {
          this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
        }
      });
    },
    'splitMode': function() {
      if (this._modeSwitching) return;
      this._waitForData((rows, cols, gridSize) => {
        if (this.data.cropMode && this.cachedOriginalGridData) {
          const orig = this._getOriginalGridSize();
          if (orig) this.renderToCanvas(this.cachedOriginalGridData, orig.cols, orig.rows, gridSize);
        } else {
          this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
        }
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
      if (!newVal) return;
      if (this._lastPresetIndex === newVal[0]) return;
      // 模式切换中：gridPreset 变化是页面层恢复 gridPresetIndex 导致的，
      // 不是用户操作。跳过，由 processMode observer 完成状态恢复。
      if (this._modeSwitching) {
        this._lastPresetIndex = newVal[0];
        this._lastPresetSize = newVal[1] + '_' + newVal[2];
        return;
      }
      this._lastPresetIndex = newVal[0];
      const newSize = newVal[1] + '_' + newVal[2];
      if (this._lastPresetSize !== '0_0' && newSize !== '0_0' && this._lastPresetSize !== newSize) {
        this._cropConfirmed = false;
        const cs = this._getCropState();
        cs.confirmed = false;
        cs.offsetCol = 0;
        cs.offsetRow = 0;
      }
      this._lastPresetSize = newSize;
      this._reapplyPipeline(1);
    },
    'scale': function() {
      if (this._isResetting) return;
      if (!this.data.hasUserZoomed) {
        this.setData({ hasUserZoomed: true });
      }
      if (this.data.cropMode && this.cachedOriginalGridData) {
        // 裁剪模式下缩放：渲染原图 + 同步重算裁剪框尺寸（保持中心点）
        const orig = this._getOriginalGridSize();
        if (orig) {
          const gridSize = this.cachedGridInfo.gridSize;
          this._recalcCropWindowOnScale(orig.cols, orig.rows, gridSize);
          this._showTouchLoading = true;
          this.renderToCanvas(this.cachedOriginalGridData, orig.cols, orig.rows, gridSize);
        }
        return;
      }
      if (this.cachedGridData && this.cachedGridInfo) {
        const { cols, rows, gridSize } = this.cachedGridInfo;
        this._showTouchLoading = true;
        this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
      }
    },
    'offsetX,offsetY': function() {
      if (this.data.isDragging) return;
      if (this._isResetting) return;
      if (this.data.cropMode) return; // 裁剪模式下 offset 不影响渲染（裁剪框自己移动）
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

    // 裁剪模式下缩放时，同步重算裁剪框尺寸和位置（保持中心点不变）
    _recalcCropWindowOnScale(origCols, origRows, gridSize) {
      const presetVal = this.data.gridPreset;
      const result = recalcCropWindow({
        canvasW: this.data.canvasWidth || 300,
        canvasH: this.data.canvasHeight || 300,
        userScale: this.data.scale || 1,
        origCols, origRows, gridSize,
        targetCols: presetVal[1], targetRows: presetVal[2],
        prevCropWinX: this.data.cropWinX, prevCropWinY: this.data.cropWinY,
        prevCropWinW: this.data.cropWinW, prevCropWinH: this.data.cropWinH
      });
      this.setData(result);
    },

    // 裁剪模式下缩放上限：放大到最大时，裁剪框两侧各留 2 格色块的可见空间，
    // 保证即使放到最大仍能拖动微调（不会让裁剪框填满或超出可见区域）
    _getCropModeMaxScale() {
      if (!this.cachedOriginalGridData || !this.cachedGridInfo) return 20;
      const presetVal = this.data.gridPreset;
      if (!presetVal[1] || !presetVal[2]) return 20;
      return getCropModeMaxScale({
        origCols: this.cachedOriginalGridData[0] ? this.cachedOriginalGridData[0].length : 0,
        origRows: this.cachedOriginalGridData.length,
        gridSize: this.cachedGridInfo.gridSize,
        canvasW: this.data.canvasWidth || 300,
        canvasH: this.data.canvasHeight || 300,
        targetCols: presetVal[1], targetRows: presetVal[2]
      });
    },

    // 根据当前模式返回对应的裁剪状态（卡通/马赛克各自独立存储）
    _getCropState() {
      const state = this.data.processMode === 'mosaic' ? this._cropStateMosaic : this._cropStateCartoon;
      if (!state) return { confirmed: false, offsetCol: 0, offsetRow: 0 };
      return state;
    },

    // 页面层 toggleProcessMode 在改 gridPresetIndex 之前调用此方法，
    // 把当前完整状态保存到当前模式的 slot，并标记模式切换中（抑制 gridPreset observer）。
    _saveCropStateBeforeSwitch() {
      if (!this._cropStateCartoon || !this._cropStateMosaic) {
        this._cropStateCartoon = { confirmed: false, offsetCol: 0, offsetRow: 0 };
        this._cropStateMosaic = { confirmed: false, offsetCol: 0, offsetRow: 0 };
      }
      const state = this.data.processMode === 'mosaic' ? this._cropStateMosaic : this._cropStateCartoon;
      state.confirmed = this._cropConfirmed;
      state.offsetCol = this._cropOffsetCol;
      state.offsetRow = this._cropOffsetRow;
      state.cachedGridData = this.cachedGridData;
      state.cachedGridInfo = this.cachedGridInfo;
      state.cachedOriginalGridData = this.cachedOriginalGridData;
      state.lastPresetSize = this._lastPresetSize;
      state.lastPresetIndex = this._lastPresetIndex;
      this._modeSwitching = true;
    },

    // 页面层 toggleProcessMode 在 setData({processMode}) 之后调用此方法，
    // 从目标模式的 slot 恢复完整状态并渲染。不依赖 observer（会被 isProcessing 拦截）。
    _restoreCropStateAfterSwitch() {
      this._lastProcessMode = this.data.processMode;
      this._modeSwitching = false;

      const newState = this._getCropState();

      if (newState.cachedOriginalGridData && newState.cachedGridData) {
        // 有缓存：直接恢复 + 渲染
        this.cachedOriginalGridData = newState.cachedOriginalGridData;
        this.cachedGridData = newState.cachedGridData;
        this.cachedGridInfo = newState.cachedGridInfo;
        this._cropConfirmed = newState.confirmed;
        this._cropOffsetCol = newState.offsetCol;
        this._cropOffsetRow = newState.offsetRow;
        this._lastPresetSize = newState.lastPresetSize || '0_0';
        this._lastPresetIndex = newState.lastPresetIndex || 0;

        const gi = this.cachedGridInfo;
        const gd = this.cachedGridData;
        const stats = this.calculateStats(gd, gi.rows, gi.cols);
        this.triggerEvent('statsUpdate', { stats });
        this.triggerEvent('gridInfoUpdate', { cols: gi.cols, rows: gi.rows });
        this.renderToCanvas(gd, gi.cols, gi.rows, gi.gridSize);
        this.setData({ isProcessing: false });
      } else {
        // 无缓存：清空 + 重新生成
        this._cropConfirmed = false;
        this._cropOffsetCol = 0;
        this._cropOffsetRow = 0;
        this.cachedOriginalGridData = null;
        this.cachedGridData = null;
        this.cachedGridInfo = null;
        this.setData({ cropMode: false });
        this._reapplyPipeline(3);
      }
    },

    // 取消裁剪：退出 cropMode，预设回到原图比例（gridPresetIndex=0）
    cancelCrop() {
      this.setData({ cropMode: false });
      // 通知页面层：预设回到原图比例
      this.triggerEvent('cropCanceled');
    },

    // 确认裁剪：由裁剪框位置反算网格行列，从原图快照裁出子网格
    confirmCrop() {
      if (!this.cachedOriginalGridData || !this.cachedGridInfo) return;

      // 点击瞬间立即触发 toast（✂️ 咔嚓），让用户立刻看到反馈
      this.triggerEvent('cropConfirmed');

      const presetVal = this.data.gridPreset;
      const targetCols = presetVal[1];
      const targetRows = presetVal[2];
      if (!targetCols || !targetRows) return;

      const origRows = this.cachedOriginalGridData.length;
      const origCols = this.cachedOriginalGridData[0] ? this.cachedOriginalGridData[0].length : 0;
      const gridSize = this.cachedGridInfo.gridSize;

      const { startCol, startRow } = computeCropStartCell({
        cropWinX: this.data.cropWinX, cropWinY: this.data.cropWinY,
        canvasW: this.data.canvasWidth || 300, canvasH: this.data.canvasHeight || 300,
        userScale: this.data.scale || 1,
        origCols, origRows, gridSize,
        mirrorImage: this.data.mirrorImage,
        targetCols, targetRows
      });

      const cropResult = applyCustomCrop(
        this.cachedOriginalGridData, startCol, startRow, targetCols, targetRows
      );
      this.cachedGridData = cropResult.gridData;
      this.cachedGridInfo = { cols: targetCols, rows: targetRows, gridSize };
      this._cropOffsetCol = startCol;
      this._cropOffsetRow = startRow;
      this._cropConfirmed = true; // 标记已确认，后续重生成用自定义位置裁剪

      // 立即退出裁剪模式，渲染裁剪后网格
      this.setData({ cropMode: false });
      this.resetPreviewState();
      this.renderToCanvas(this.cachedGridData, targetCols, targetRows, gridSize);

      const stats = this.calculateStats(this.cachedGridData, targetRows, targetCols);
      this.triggerEvent('statsUpdate', { stats });
      this.triggerEvent('gridInfoUpdate', { cols: targetCols, rows: targetRows });
      this._clearUndoAndNotify();
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
        const doProcess = () => {
        this.setData({ isProcessing: true });
        try {
        // 数据可能在 _waitForData 触发后、setTimeout 延迟期间被清空
        // （切换图片、改格子数、模式切换等），此时跳过本次后处理，
        // 否则 reapplyColors 会收到 null 网格而崩溃（Cannot read properties of null）
        if (!this.cachedGridData && !this.cachedOriginalGridData) {
          this.setData({ isProcessing: false });
          return;
        }

        if (level >= 2) {
          if (!this._pipeline) this._initPipeline();
          this._pipeline.update({
            vibrantScale: this.data.vibrantScale,
            antiGrayIntensity: this.data.antiGrayIntensity,
            useSpecialColors: this.data.useSpecialColors,
            algorithmVersion: this.data.algorithmVersion,
            mergeThreshold: this.data.mergeThreshold
          });

          // 马赛克模式：保留 processMosaicV2 的聚类结构，只重应用鲜艳度 + 特殊色替换 + 浊色规避
          // （不走 reapplyColors 的聚类，否则会破坏马赛克映射）
          if (this.data.processMode === 'mosaic') {
            if (this.cachedOriginalGridData) {
              const origRows = this.cachedOriginalGridData.length;
              const origCols = this.cachedOriginalGridData[0] ? this.cachedOriginalGridData[0].length : 0;
              const fullGrid = this.deepCloneGridData(this.cachedOriginalGridData, origRows, origCols);
              // 1. 鲜艳度重映射色号（不聚类，保留马赛克结构）
              this._pipeline.reapplyVibrantMosaic(fullGrid, origRows, origCols);
              // 2. 特殊色替换 + 浊色规避
              this._pipeline.replaceSpecialsOnly(fullGrid, origRows, origCols);
              if (this.data.antiGrayIntensity > 0) {
                desaturateGrayColors(fullGrid, origRows, origCols, this.data.antiGrayIntensity);
              }
              // 快照不覆盖（cachedOriginalGridData 保持马赛克原始映射）
              if (!this.data.cropMode) {
                const presetResult = this._applyGridPreset(fullGrid, origCols, origRows, this.data.gridPreset);
                this.cachedGridData = presetResult.gridData;
                this.cachedGridInfo = { cols: presetResult.cols, rows: presetResult.rows, gridSize };
              }
            }
          } else if (this.cachedOriginalGridData) {
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
              // cropMode 下不重裁剪（裁剪框位置由 cropWinX/Y 跟踪，不需要更新中心裁剪结果）
              if (!this.data.cropMode) {
                const presetResult = this._applyGridPreset(fullGrid, origCols, origRows, this.data.gridPreset);
                this.cachedGridData = presetResult.gridData;
                this.cachedGridInfo = { cols: presetResult.cols, rows: presetResult.rows, gridSize };
              }
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
          // 选了新预设：退出 cropMode（交互态）
          this.setData({ cropMode: false });

          if (this.cachedOriginalGridData) {
            const origRows = this.cachedOriginalGridData.length;
            const origCols = this.cachedOriginalGridData[0] ? this.cachedOriginalGridData[0].length : 0;
            const presetVal = this.data.gridPreset;
            const targetCols = presetVal[1];
            const targetRows = presetVal[2];

            if (targetCols === 0 || targetRows === 0) {
              // 原图比例：放弃裁剪，清空确认标志，正常渲染原图
              this._cropConfirmed = false;
              this._cropOffsetCol = 0;
              this._cropOffsetRow = 0;
              const cs = this._getCropState();
              cs.confirmed = false;
              cs.offsetCol = 0;
              cs.offsetRow = 0;
              this.cachedGridData = this.deepCloneGridData(this.cachedOriginalGridData, origRows, origCols);
              this.cachedGridInfo = { cols: origCols, rows: origRows, gridSize };
            } else if (this._cropConfirmed) {
              // 已确认过裁剪（如模式切换恢复）：直接用保存的位置裁剪，不进 cropMode
              this.resetPreviewState();
              const presetResult = this._applyGridPreset(this.cachedOriginalGridData, origCols, origRows, presetVal);
              this.cachedGridData = presetResult.gridData;
              this.cachedGridInfo = { cols: presetResult.cols, rows: presetResult.rows, gridSize };
            } else {
              // 首次选预设：进入裁剪模式
              this.resetPreviewState();
              this.renderToCanvas(this.cachedOriginalGridData, origCols, origRows, gridSize);
              // 算裁剪框初始位置/尺寸（居中，userScale=1）
              const win = computeInitialCropWindow({
                canvasW: this.data.canvasWidth || 300, canvasH: this.data.canvasHeight || 300,
                origCols, origRows, gridSize, targetCols, targetRows
              });
              const presetResult = this._applyGridPreset(this.cachedOriginalGridData, origCols, origRows, presetVal);
              this.cachedGridData = presetResult.gridData;
              this.cachedGridInfo = { cols: presetResult.cols, rows: presetResult.rows, gridSize };
              this.setData({
                cropMode: true,
                cropWinX: win.cropWinX, cropWinY: win.cropWinY,
                cropWinW: win.cropWinW, cropWinH: win.cropWinH
              });
              const gi = this.cachedGridInfo;
              this.triggerEvent('gridInfoUpdate', { cols: gi.cols, rows: gi.rows });
              // 裁剪模式下不走末尾的 renderToCanvas（已在上面渲染原图）
              const stats = this.calculateStats(this.cachedGridData, gi.rows, gi.cols);
              this.triggerEvent('statsUpdate', { stats });
              this.setData({ isProcessing: false });
              if (level >= 1) this._clearUndoAndNotify();
              return;
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
        // 防御：模式切换/重生成期间数据可能被清空，跳过本次渲染
        if (!gi || !gd) {
          this.setData({ isProcessing: false });
          return;
        }
        const stats = this.calculateStats(gd, gi.rows, gi.cols);
        this.triggerEvent('statsUpdate', { stats: stats });
        this.setData({ isProcessing: false });

        if (this.data.cropMode) {
          // cropMode：渲染全图（cachedOriginalGridData），保持遮罩+裁剪框可见
          const orig = this._getOriginalGridSize();
          if (orig) {
            this.renderToCanvas(this.cachedOriginalGridData, orig.cols, orig.rows, gridSize);
          }
        } else {
          this.renderToCanvas(gd, gi.cols, gi.rows, gridSize);
        }

        if (level >= 1) {
          this._clearUndoAndNotify();
        }
        } finally {
          // 兜底：即使中间抛异常，也确保 isProcessing 被重置
          if (this.data.isProcessing) {
            this.setData({ isProcessing: false });
          }
        }
        }; // end doProcess

        // Level 2：显示 loading 并延迟处理，让 loading 先渲染（与 Level 3 一致）
        if (level >= 2) {
          this.triggerEvent('loadingChange', { show: true, text: '正在重新应用色彩...' });
          setTimeout(() => doProcess(), 100);
        } else {
          doProcess();
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
    // 完整后处理：鲜艳度 + 聚合 + 特殊色替换 + 浊色规避 + 边缘标记 + 自动裁边
    _applyColorAndPreset(gridData, rows, cols, gridSize) {
      if (this._pipeline) {
        this._pipeline.reapplyColors(gridData, rows, cols);
      }
      if (this.data.antiGrayIntensity > 0) {
        desaturateGrayColors(gridData, rows, cols, this.data.antiGrayIntensity);
      }
      // 边缘标记 + 自动裁边：必须在色号映射之后，按最终 markCode 连通判定
      const edgeResult = this._markEdgeAndAutoCrop(gridData, rows, cols, gridSize);
      gridData = edgeResult.gridData;
      rows = edgeResult.rows;
      cols = edgeResult.cols;
      this.cachedOriginalGridData = this.deepCloneGridData(gridData, rows, cols);
      const presetResult = this._applyGridPreset(gridData, cols, rows);
      this.cachedGridData = presetResult.gridData;
      this.cachedGridInfo = { cols: presetResult.cols, rows: presetResult.rows, gridSize };
      return presetResult;
    },

    // 马赛克模式专用：应用鲜艳度 + 特殊色替换 + 浊色规避，保留 processMosaicV2 的聚类结构
    _applyMosaicResult(gridData, rows, cols, gridSize, segments) {
      if (this._pipeline) {
        // 1. 鲜艳度重映射色号（从 rawRgb，不聚类，保留马赛克结构）
        this._pipeline.reapplyVibrantMosaic(gridData, rows, cols);
        // 2. 特殊色替换
        this._pipeline.replaceSpecialsOnly(gridData, rows, cols);
      }
      // 3. 浊色规避在快照保存之前执行
      if (this.data.antiGrayIntensity > 0) {
        desaturateGrayColors(gridData, rows, cols, this.data.antiGrayIntensity);
      }
      // 4. 边缘标记 + 自动裁边：必须在色号映射之后，按最终 markCode 连通判定
      const edgeResult = this._markEdgeAndAutoCrop(gridData, rows, cols, gridSize, segments);
      gridData = edgeResult.gridData;
      rows = edgeResult.rows;
      cols = edgeResult.cols;
      this.cachedOriginalGridData = this.deepCloneGridData(gridData, rows, cols);
      const presetResult = this._applyGridPreset(gridData, cols, rows);
      this.cachedGridData = presetResult.gridData;
      this.cachedGridInfo = { cols: presetResult.cols, rows: presetResult.rows, gridSize };
      return presetResult;
    },

    // 按「最终色号 markCode」从四边洪泛标记边缘，并据此自动裁掉整圈边缘底色。
    // 必须在色号映射完成之后调用（否则鲜艳度增强会改变边缘取色的最终色号，导致漏标）。
    // 可选 segments（马赛克模式）：在裁边前把 isEdge 按 row/col 回写，供 segments 渲染/导出路径使用。
    // 返回裁边后的 { gridData, rows, cols }；无边缘或无内容时原样返回。
    _markEdgeAndAutoCrop(gridData, rows, cols, gridSize, segments) {
      const markRes = filterEdgeByMarkCode(gridData, rows, cols);
      if (!markRes.marked) return { gridData, rows, cols };

      // 回写 isEdge 到 segments（此时 gridData 尚未裁边，cell.row/col 与 seg.row/col 一一对应）
      if (segments && segments.length) {
        for (const seg of segments) {
          if (seg.row === undefined || seg.col === undefined) continue;
          const cell = gridData[seg.row] && gridData[seg.row][seg.col];
          if (cell) seg.isEdge = !!cell.isEdge;
        }
      }

      const boundary = findCropBoundaryFromGrid(gridData, rows, cols);
      if (!boundary.hasContent) return { gridData, rows, cols };

      const cropResult = cropMosaicData({ gridData, rows, cols, gridSize }, boundary);
      if (!cropResult.gridData) return { gridData, rows, cols };

      return { gridData: cropResult.gridData, rows: cropResult.rows, cols: cropResult.cols };
    },

    // 覆盖 mixin 的 regenerateFromCache，使用管道处理
    regenerateFromCache() {
      const pixelData = this.getCachedPixelData();
      const cachedWidth = this.cachedWidth;
      const cachedHeight = this.cachedHeight;
      if (!pixelData || cachedWidth === 0) {
        // 提前返回时必须清 isProcessing，否则后续 observer 全部被拦截
        this.setData({ isProcessing: false });
        this.triggerEvent('loadingChange', { show: false, text: '' });
        return;
      }

      // 确保管道已初始化
      if (!this._pipeline) this._initPipeline();

      const qualityGridSize = this.getQualityGridSize(this.data.previewQuality);

      if (this.data.processMode === 'mosaic') {
        // 马赛克模式：暂不支持算法切换，使用 imageProcessor 原版
        // 同步 excludeSpecial 全局状态，让 processMosaicV2 的 fastFindClosestMarkColor 感知特殊色开关
        this._pipeline.syncColorMapper();
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
