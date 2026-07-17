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
  _cropConfirmed: false,
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
    'gridSize, previewQuality': function() {
      // 改格子数的参数：退出 cropMode + 清缓存 + 完整重生成
      if (this.data.isProcessing) return;
      const key = `${this.data.gridSize}_${this.data.previewQuality}`;
      if (this._lastGridSizeKey === key) return;
      this._lastGridSizeKey = key;

      if (this._pipeline) {
        this._pipeline.update({ mergeThreshold: this.data.mergeThreshold });
      }

      // 格子数变更 → 裁剪定位失效，退出裁剪模式
      if (this.data.cropMode) {
        this.setData({ cropMode: false });
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
    'mergeThreshold, processMode': function() {
      // 不改格子数的参数：不清缓存，不退出 cropMode
      if (this.data.isProcessing) return;
      const key = `${this.data.mergeThreshold}_${this.data.processMode}`;
      if (this._lastMergeProcessKey === key) return;
      this._lastMergeProcessKey = key;

      if (this._pipeline) {
        this._pipeline.update({ mergeThreshold: this.data.mergeThreshold });
      }

      if (this.data.processMode === 'mosaic') {
        this.cachedGridData = null;
        this.cachedGridInfo = null;
        this.cachedSegments = null;
        this.cachedOriginalGridData = null;
        this._cropOffsetCol = 0;
        this._cropOffsetRow = 0;
      }

      // 不退出 cropMode（格子数未变）
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
        if (this.data.cropMode && this.cachedOriginalGridData) {
          const orig = this._getOriginalGridSize();
          if (orig) this.renderToCanvas(this.cachedOriginalGridData, orig.cols, orig.rows, gridSize);
        } else {
          this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
        }
      });
    },
    'mirrorImage': function() {
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
      // 用实例变量去重（oldVal 在组件重渲染时可能为 undefined，不可靠）
      if (this._lastPresetIndex === newVal[0]) return;
      this._lastPresetIndex = newVal[0];
      this._reapplyPipeline(1);
    },
    'scale': function() {
      if (this._isResetting) return;
      if (!this.data.hasUserZoomed) {
        this.setData({ hasUserZoomed: true });
      }
      if (this.isRendering) return;
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
      if (this.isRendering) return;
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
      const canvasW = this.data.canvasWidth || 300;
      const canvasH = this.data.canvasHeight || 300;
      const userScale = this.data.scale || 1;
      // 复用 renderer 的 baseScale 计算
      const baseScale = Math.min(
        origCols * gridSize > 0 ? canvasW / (origCols * gridSize) : 1,
        origRows * gridSize > 0 ? canvasH / (origRows * gridSize) : 1,
        1
      );
      const newCellSize = gridSize * baseScale * userScale;

      const presetVal = this.data.gridPreset;
      const targetCols = presetVal[1];
      const targetRows = presetVal[2];
      const newCropWinW = targetCols * newCellSize;
      const newCropWinH = targetRows * newCellSize;

      // 保持裁剪框中心点不变
      const oldCenterX = (this.data.cropWinX || 0) + (this.data.cropWinW || 0) / 2;
      const oldCenterY = (this.data.cropWinY || 0) + (this.data.cropWinH || 0) / 2;
      let newCropWinX = oldCenterX - newCropWinW / 2;
      let newCropWinY = oldCenterY - newCropWinH / 2;

      // clamp 到 canvas 范围
      const maxX = Math.max(0, canvasW - newCropWinW);
      const maxY = Math.max(0, canvasH - newCropWinH);
      newCropWinX = Math.max(0, Math.min(maxX, newCropWinX));
      newCropWinY = Math.max(0, Math.min(maxY, newCropWinY));

      this.setData({
        cropWinW: newCropWinW,
        cropWinH: newCropWinH,
        cropWinX: newCropWinX,
        cropWinY: newCropWinY
      });
    },

    // 裁剪模式下缩放上限：放大到最大时，裁剪框两侧各留 2 格色块的可见空间，
    // 保证即使放到最大仍能拖动微调（不会让裁剪框填满或超出可见区域）
    _getCropModeMaxScale() {
      if (!this.cachedOriginalGridData || !this.cachedGridInfo) return 20;
      const presetVal = this.data.gridPreset;
      const targetCols = presetVal[1];
      const targetRows = presetVal[2];
      if (!targetCols || !targetRows) return 20;

      const origRows = this.cachedOriginalGridData.length;
      const origCols = this.cachedOriginalGridData[0] ? this.cachedOriginalGridData[0].length : 0;
      const gridSize = this.cachedGridInfo.gridSize;
      const canvasW = this.data.canvasWidth || 300;
      const canvasH = this.data.canvasHeight || 300;
      const baseScale = Math.min(
        origCols * gridSize > 0 ? canvasW / (origCols * gridSize) : 1,
        origRows * gridSize > 0 ? canvasH / (origRows * gridSize) : 1,
        1
      );
      // 最大时：裁剪框 + 两侧各 2 格 ≤ canvas，即占用 (targetCols + 4) 格宽
      // 但不能超过原图本身的格数，否则会算出过大的上限
      const availColsW = Math.min(origCols, targetCols + 4);
      const availRowsH = Math.min(origRows, targetRows + 4);
      const maxByW = canvasW / (availColsW * gridSize * baseScale);
      const maxByH = canvasH / (availRowsH * gridSize * baseScale);
      // 下限至少 1（不能小于初始 scale）
      return Math.max(1, Math.min(maxByW, maxByH));
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

      // 用 CSS 空间反算（和裁剪框尺寸计算一致）
      const canvasW = this.data.canvasWidth || 300;
      const canvasH = this.data.canvasHeight || 300;
      const userScale = this.data.scale || 1;
      const baseScale = Math.min(
        origCols * gridSize > 0 ? canvasW / (origCols * gridSize) : 1,
        origRows * gridSize > 0 ? canvasH / (origRows * gridSize) : 1,
        1
      );
      const cssCellSize = gridSize * baseScale * userScale;
      // 原图网格居中在 canvas 里，CSS 空间起始坐标
      const cssGridOffsetX = (canvasW - origCols * cssCellSize) / 2;
      const cssGridOffsetY = (canvasH - origRows * cssCellSize) / 2;

      let startCol = Math.round((this.data.cropWinX - cssGridOffsetX) / cssCellSize);
      let startRow = Math.round((this.data.cropWinY - cssGridOffsetY) / cssCellSize);

      // clamp 到原图范围内
      startCol = Math.max(0, Math.min(origCols - targetCols, startCol));
      startRow = Math.max(0, Math.min(origRows - targetRows, startRow));

      const cropResult = this._applyCustomCrop(
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

    // 自定义裁剪：从原图快照裁出指定起始位置的子网格
    _applyCustomCrop(originalGrid, startCol, startRow, targetCols, targetRows) {
      const origRows = originalGrid.length;
      const origCols = originalGrid[0] ? originalGrid[0].length : 0;
      const newGridData = [];

      for (let r = 0; r < targetRows; r++) {
        newGridData[r] = [];
        for (let c = 0; c < targetCols; c++) {
          const srcR = startRow + r;
          const srcC = startCol + c;
          if (srcR >= 0 && srcR < origRows && srcC >= 0 && srcC < origCols
              && originalGrid[srcR] && originalGrid[srcR][srcC]) {
            newGridData[r][c] = { ...originalGrid[srcR][srcC] };
          } else {
            const refCell = originalGrid[0] && originalGrid[0][0] ? originalGrid[0][0] : { width: 10, height: 10 };
            newGridData[r][c] = {
              x: c * (refCell.width || 10),
              y: r * (refCell.height || 10),
              width: refCell.width || 10,
              height: refCell.height || 10,
              rawRgb: { r: 240, g: 240, b: 240 },
              originalRgb: { r: 240, g: 240, b: 240 },
              originalMarkCode: '',
              markCode: '',
              markHex: '#F0F0F0',
              markRgb: { r: 240, g: 240, b: 240 },
              isEmpty: true
            };
          }
        }
      }
      return { gridData: newGridData };
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
          // 选了新预设：重置裁剪模式状态，清空已确认标志（中心裁剪）
          this._cropConfirmed = false;
          this.setData({ cropMode: false });

          if (this.cachedOriginalGridData) {
            const origRows = this.cachedOriginalGridData.length;
            const origCols = this.cachedOriginalGridData[0] ? this.cachedOriginalGridData[0].length : 0;
            const presetVal = this.data.gridPreset;
            const targetCols = presetVal[1];
            const targetRows = presetVal[2];

            if (targetCols === 0 || targetRows === 0) {
              // 原图比例：不裁剪，正常渲染原图
              this._cropOffsetCol = 0;
              this._cropOffsetRow = 0;
              this.cachedGridData = this.deepCloneGridData(this.cachedOriginalGridData, origRows, origCols);
              this.cachedGridInfo = { cols: origCols, rows: origRows, gridSize };
            } else {
              // 选了预设：进入裁剪模式
              // 1. 先渲染原图网格（供裁剪框叠加）
              this.renderToCanvas(this.cachedOriginalGridData, origCols, origRows, gridSize);
              // 2. 算裁剪框尺寸（CSS 空间 cellSize = gridSize * baseScale * userScale）
              const canvasW = this.data.canvasWidth || 300;
              const canvasH = this.data.canvasHeight || 300;
              const userScale = this.data.scale || 1;
              const baseScale = Math.min(
                origCols * gridSize > 0 ? canvasW / (origCols * gridSize) : 1,
                origRows * gridSize > 0 ? canvasH / (origRows * gridSize) : 1,
                1
              );
              const cssCellSize = gridSize * baseScale * userScale;
              const cropWinW = targetCols * cssCellSize;
              const cropWinH = targetRows * cssCellSize;
              // 裁剪框初始居中（相对 canvas 左上角）
              const cropWinX = (canvasW - cropWinW) / 2;
              const cropWinY = (canvasH - cropWinH) / 2;
              // 3. 记录中心裁剪结果（cachedGridData 保持裁剪后的，供取消裁剪模式时使用）
              const presetResult = this._applyGridPreset(this.cachedOriginalGridData, origCols, origRows, presetVal);
              this.cachedGridData = presetResult.gridData;
              this.cachedGridInfo = { cols: presetResult.cols, rows: presetResult.rows, gridSize };
              // 4. 进入裁剪模式
              this.resetPreviewState();
              this.setData({
                cropMode: true,
                cropWinX, cropWinY, cropWinW, cropWinH
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
