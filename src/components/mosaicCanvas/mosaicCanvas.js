// components/mosaicCanvas/mosaicCanvas.js
const { processSimple, processWithSmartRegions, detectEdgeColorFromGrid, detectEdgeColorFromSegments, filterEdgeSegments, filterEdgeBlocks, cropMosaicData, findCropBoundaryFromGrid, convertSegmentsToGridData, processMosaicV2 } = require('../../utils/imageProcessor');
const { isLightColor, formatMarkCode } = require('../../utils/colorHelpers');
const { REGION_SIZE, getColCode, getRegionCells } = require('../../utils/regionUtils');
const { isSpecialColor, getAlternativeColor } = require('../../utils/colorMapper');

Component({
  properties: {
    imagePath: { type: String, value: '' },
    gridSize: { type: Number, value: 10 },
    mergeThreshold: { type: Number, value: 5 },
    // 处理模式: 'normal' | 'smart' - smart 模式会保留黑色边界并合并色块
    processMode: { type: String, value: 'normal' },
    useSpecialColors: { type: Boolean, value: true },  // 是否使用特殊色
    removeEdge: { type: Boolean, value: true },  // 是否去除边缘底色
    highlightCode: { type: String, value: null },
    showCode: { type: Boolean, value: false },
    scale: { type: Number, value: 1 },
    previewQuality: { type: Number, value: 2 },
    regenerateTrigger: { type: Number, value: 0 },
    vibrantScale: { type: Number, value: 0 },  // 鲜艳度增强系数 (0-1)
    mirrorImage: { type: Boolean, value: false },  // 是否镜像翻转
    forceGridSize: { type: Number, value: null },  // 强制使用的网格大小（跳过检测）
    // 网格预设：[预设索引, 目标列数, 目标行数]
    gridPreset: { type: Array, value: [0, 0, 0 ] }
  },

  data: {
    canvasWidth: 300,
    canvasHeight: 300,
    isProcessing: false,
    gridInfo: null,
    scale: 1,
    // 用户是否进行过缩放/拖拽操作（初始false，不显示色号）
    hasUserZoomed: false,
    // 拖动偏移量
    offsetX: 0,
    offsetY: 0,
    isNewTouch: true,
    // 拖动状态：按住时为 true，停止渲染，手指离开时恢复渲染
    isDragging: false,
    flatCells: [],
    // 不再在此存储大数组，改用普通属性
    cachedWidth: 0,
    cachedHeight: 0,
    // 鲜艳度增强系数 (0-1)，0 表示不增强
    vibrantScale: 0
  },

  // 使用普通属性存储大数组，避免通过 setData 传输
  cachedPixelData: null,

  // 智能模式下的色段数据
  cachedSegments: null,

  // 原始 gridData（用于网格预设切换和颜色恢复）
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
      // 防止重复处理
      if (this.data.isProcessing) return;

      // 防止处理完成后 gridInfo 更新再次触发 observer
      // 如果参数与上次处理的相同，不需要重新处理
      const key = `${this.data.gridSize}_${this.data.mergeThreshold}_${this.data.previewQuality}_${this.data.processMode}`;
      if (this._lastProcessedKey === key) return;
      this._lastProcessedKey = key;

      // 这些参数变化时需要完全重新生成
      if (this.data.processMode === 'mosaic') {
        this.cachedGridData = null;
        this.cachedGridInfo = null;
        this.cachedSegments = null;
      }
      // 清理失效的缓存，避免内存溢出
      this.cachedOriginalGridData = null;

      if (this.cachedPixelData && this.cachedWidth > 0) {
        wx.showLoading({ title: '正在处理图片...', mask: true });
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
      // 特殊色开关变化时，从快照恢复并重新应用鲜艳度处理
      this._waitForData((rows, cols, gridSize) => {
        this.resetToOriginalColors(this.cachedGridData, rows, cols);
        this.reapplyVibrantScale(this.cachedGridData, rows, cols);
        const stats = this.calculateStats(this.cachedGridData, rows, cols);
        this.triggerEvent('statsUpdate', { stats: stats });
        this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
      });
    },
    'removeEdge': function() {
      // 去边缘开关变化时，不需要重新生成 gridData，只重新渲染
      this._waitForData((rows, cols, gridSize) => {
        this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
      });
    },
    'mirrorImage': function() {
      // 镜像开关变化时，只需要重新渲染
      this._waitForData((rows, cols, gridSize) => {
        this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
      });
    },
    'vibrantScale': function() {
      // 鲜艳度变化时，不清空缓存，直接重新应用鲜艳度
      this._waitForData((rows, cols, gridSize) => {
        this.setData({ isProcessing: true });
        this.resetToOriginalColors(this.cachedGridData, rows, cols);
        this.reapplyVibrantScale(this.cachedGridData, rows, cols);
        const stats = this.calculateStats(this.cachedGridData, rows, cols);
        this.triggerEvent('statsUpdate', { stats: stats });
        this.setData({ isProcessing: false });
        this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
      });
    },
    'gridPreset': function(newVal, oldVal) {
      // 网格预设变化时，使用原始缓存数据重新裁剪
      if (oldVal && oldVal[0] === newVal[0]) return; // 索引没变，不需要处理

      // 等待 cachedOriginalGridData 就绪（最多 1 秒）
      const waitForOriginal = (retryCount) => {
        if (retryCount > 10) {
          console.warn('[mosaicCanvas] gridPreset: 等待 cachedOriginalGridData 超时');
          return;
        }
        if (!this.cachedOriginalGridData) {
          setTimeout(() => waitForOriginal(retryCount + 1), 100);
          return;
        }

        const targetCols = newVal[1];
        const targetRows = newVal[2];
        const origCols = this.cachedOriginalGridData[0] ? this.cachedOriginalGridData[0].length : 0;
        const origRows = this.cachedOriginalGridData.length;
        const gridSize = this.cachedGridInfo ? this.cachedGridInfo.gridSize : 10;

        // 原图比例：恢复原始数据
        if (targetCols === 0 || targetRows === 0) {
          this.cachedGridData = this.cachedOriginalGridData;
          this.cachedGridInfo = { cols: origCols, rows: origRows, gridSize };
        } else {
          // 应用裁剪
          const presetResult = this._applyGridPreset(this.cachedOriginalGridData, origCols, origRows);
          this.cachedGridData = presetResult.gridData;
          this.cachedGridInfo = { cols: presetResult.cols, rows: presetResult.rows, gridSize };
        }

        const stats = this.calculateStats(this.cachedGridData, this.cachedGridInfo.rows, this.cachedGridInfo.cols);
        this.triggerEvent('statsUpdate', { stats });
        // 通知页面更新 mosaicData 的行列数
        this.triggerEvent('gridInfoUpdate', {
          cols: this.cachedGridInfo.cols,
          rows: this.cachedGridInfo.rows
        });
        // 重置缩放和拖拽状态
        this.resetPreviewState();
        this.renderToCanvas(this.cachedGridData, this.cachedGridInfo.cols, this.cachedGridInfo.rows, gridSize);
      };
      waitForOriginal(0);
    },
    'scale': function() {
      // 程序重置时不要自动设置 hasUserZoomed
      if (this._isResetting) return;
      // 用户进行了缩放，标记状态
      if (!this.data.hasUserZoomed) {
        this.setData({ hasUserZoomed: true });
      }
      if (this.cachedGridData && this.cachedGridInfo) {
        const { cols, rows, gridSize } = this.cachedGridInfo;
        this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
      }
    },
    'offsetX,offsetY': function() {
      // 拖动时只移动视图，不渲染
      if (this.data.isDragging) return;

      // 使用 cachedGridData 渲染
      if (this.cachedGridData && this.cachedGridInfo) {
        const { cols, rows, gridSize } = this.cachedGridInfo;
        this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
      }
    }
  },

  methods: {
    // 等待 cachedGridData 就绪后执行回调（替代无限 setTimeout 轮询）
    // 最多重试 10 次（共 1 秒），超时后放弃
    _waitForData(callback, retryCount) {
      retryCount = retryCount || 0;
      if (this.cachedGridData && this.cachedGridInfo) {
        const { rows, cols, gridSize } = this.cachedGridInfo;
        callback.call(this, rows, cols, gridSize);
        return;
      }
      if (retryCount >= 10) {
        console.warn('[mosaicCanvas] _waitForData: 等待数据就绪超时');
        return;
      }
      setTimeout(() => {
        this._waitForData(callback, retryCount + 1);
      }, 100);
    },

    // 重置预览状态（缩放、平移）
    resetPreviewState() {
      this._isResetting = true;
      this.setData({
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        hasUserZoomed: false
      }, () => {
        this._isResetting = false;
      });
    },

    // 使用实例属性存储像素数据，避免通过 setData 传输
    getCachedPixelData() {
      return this.cachedPixelData;
    },
    
    setCachedPixelData(pixelData, width, height) {
      // 深拷贝避免原始数据被修改
      this.cachedPixelData = new Uint8ClampedArray(pixelData);
      this.cachedWidth = width;
      this.cachedHeight = height;
    },
    
    regenerateFromCache() {
      const pixelData = this.getCachedPixelData();
      const cachedWidth = this.cachedWidth;
      const cachedHeight = this.cachedHeight;
      if (!pixelData || cachedWidth === 0) return;

      const qualityGridSize = this.getQualityGridSize(this.data.previewQuality);

      if (this.data.processMode === 'mosaic') {
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
          console.warn('回退到旧版算法');
          try {
            const result = processWithSmartRegions(pixelData, cachedWidth, cachedHeight, qualityGridSize);
            this._finishSimpleResult(result, qualityGridSize);
          } catch (e2) {
            console.error('回退也失败了:', e2);
            this.setData({ isProcessing: false });
          }
        }
      } else {
        const result = processSimple(pixelData, cachedWidth, cachedHeight, qualityGridSize, this.data.mergeThreshold, this.data.vibrantScale);
        this._finishSimpleResult(result, qualityGridSize);
      }
    },

    // 计算统计结果（基于 gridData）
    /**
     * 替换特殊色为替代色
     * 当 useSpecialColors 为 false 时调用
     * @param {Array} gridData - 网格数据
     * @param {number} rows - 行数
     * @param {number} cols - 列数
     */
    replaceSpecialColors(gridData, rows, cols) {
      const useSpecial = this.data.useSpecialColors;
      if (useSpecial) return; // 如果使用特殊色，不替换

      let specialCount = 0;
      let nonSpecialCount = 0;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cell = gridData[row] && gridData[row][col];
          if (!cell || !cell.markCode) continue;

          if (isSpecialColor(cell.markCode)) {
            specialCount++;
            const altColor = getAlternativeColor(cell.markCode);
            if (altColor) {
              cell.markCode = altColor.code;
              cell.markHex = altColor.hex;
              cell.markRgb = altColor.rgb;
            }
          } else {
            nonSpecialCount++;
          }
        }
      }
    },

    // 重新应用鲜艳度增强（在 replaceSpecialColors 之后调用）
    // 使用批量处理优化性能
    // vibrantScale 范围：-10 到 10，负数表示降低鲜艳度，正数表示增强
    reapplyVibrantScale(gridData, rows, cols) {
      const vibrantScale = this.data.vibrantScale;

      const { batchMapColors } = require('../../utils/colorMapper');
      const { aggregateSimilarColors, enhanceVibrant } = require('../../utils/imageProcessor');

      // 如果鲜艳度为0，恢复原始颜色
      if (vibrantScale === 0) {
        this.resetToOriginalColors(gridData, rows, cols);
        if (!this.data.useSpecialColors) {
          this.replaceSpecialColors(gridData, rows, cols);
        }
        return;
      }

      // 第一遍：收集所有需要处理的格子位置和计算增强后的颜色
      const cellsToProcess = [];
      const colorsToMap = [];

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cell = gridData[row] && gridData[row][col];
          if (!cell || !cell.rawRgb) continue;

          let processedColor;
          if (vibrantScale > 0) {
            // 正数：增强鲜艳度
            const scale = vibrantScale / 10;
            processedColor = enhanceVibrant(cell.rawRgb, scale);
          } else {
            // 负数：降低鲜艳度（让颜色更灰/暗淡）
            const scale = Math.abs(vibrantScale) / 10;
            processedColor = this.reduceVibrant(cell.rawRgb, scale);
          }

          cellsToProcess.push({ row, col });
          colorsToMap.push(processedColor);
        }
      }

      // 批量映射所有颜色
      const mappedColors = batchMapColors(colorsToMap);

      // 第二遍：应用映射结果，同时更新 originalRgb 为增强后的颜色（供颜色聚合使用）
      // rawRgb 保持不变，作为真正的原始颜色
      for (let i = 0; i < cellsToProcess.length; i++) {
        const { row, col } = cellsToProcess[i];
        const cell = gridData[row][col];
        const markColor = mappedColors[i];
        // 更新增强后的颜色到 originalRgb，但 rawRgb 保持不变
        cell.originalRgb = colorsToMap[i];
        cell.markCode = markColor.code;
        cell.markHex = markColor.hex;
        cell.markRgb = markColor.rgb;
      }

      // 颜色聚合：如果设置了 mergeThreshold，需要重新执行颜色聚合
      const mergeThreshold = this.data.mergeThreshold;
      if (mergeThreshold > 0) {
        aggregateSimilarColors(gridData, rows, cols, mergeThreshold);
      }

      // 特殊色替换：如果特殊色开关是关闭的，需要重新替换特殊色
      if (!this.data.useSpecialColors) {
        this.replaceSpecialColors(gridData, rows, cols);
      }
    },

    // 从快照恢复原始颜色数据（仅恢复数据，不做特殊色处理）
    resetToOriginalColors(gridData, rows, cols) {
      const snapshot = this.cachedOriginalGridData;
      if (!snapshot) return;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cell = gridData[row] && gridData[row][col];
          const snapCell = snapshot[row] && snapshot[row][col];
          if (!cell || !snapCell) continue;

          cell.rawRgb = snapCell.rawRgb ? { ...snapCell.rawRgb } : null;
          cell.originalRgb = snapCell.rawRgb ? { ...snapCell.rawRgb } : null;
          cell.originalMarkCode = snapCell.originalMarkCode;
          cell.markCode = snapCell.markCode;
          cell.markHex = snapCell.markHex;
          cell.markRgb = snapCell.markRgb ? { ...snapCell.markRgb } : null;
          cell.isEdge = snapCell.isEdge;
        }
      }
    },

    // 深拷贝 gridData（用于保存原始快照）
    // 保存完整的初始颜色信息：markCode, markHex, markRgb
    // 这样恢复时直接使用，不重新计算，保证完全一致
    deepCloneGridData(gridData, rows, cols) {
      const cloned = [];
      for (let row = 0; row < rows; row++) {
        cloned[row] = [];
        for (let col = 0; col < cols; col++) {
          const cell = gridData[row] && gridData[row][col];
          if (cell) {
            cloned[row][col] = {
              x: cell.x,
              y: cell.y,
              width: cell.width,
              height: cell.height,
              row: cell.row,
              col: cell.col,
              rawRgb: cell.rawRgb ? { ...cell.rawRgb } : null,
              originalRgb: cell.originalRgb ? { ...cell.originalRgb } : null,
              originalMarkCode: cell.originalMarkCode,
              // 保存完整的初始颜色信息，不再重新计算
              initialMarkCode: cell.markCode,
              initialMarkHex: cell.markHex,
              initialMarkRgb: cell.markRgb ? { ...cell.markRgb } : null,
              markCode: cell.markCode,
              markHex: cell.markHex,
              markRgb: cell.markRgb ? { ...cell.markRgb } : null,
              isEdge: cell.isEdge
            };
          } else {
            cloned[row][col] = null;
          }
        }
      }
      return cloned;
    },

    // 降低鲜艳度（让颜色更灰/暗淡）
    // scale: 0-1，表示降低程度
    reduceVibrant(rgb, scale) {
      if (!rgb) return rgb;

      const r = rgb.r / 255;
      const g = rgb.g / 255;
      const b = rgb.b / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;

      // RGB 转 HSV
      let h = 0, s = max === 0 ? 0 : d / max, v = max;
      if (d !== 0) {
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        else if (max === g) h = ((b - r) / d + 2) / 6;
        else h = ((r - g) / d + 4) / 6;
      }

      // 降低饱和度
      s = Math.max(0, s * (1 - scale * 0.5));
      // 略微降低亮度
      v = Math.max(0, v * (1 - scale * 0.2));

      // HSV 转 RGB
      const i = Math.floor(h * 6);
      const f = h * 6 - i;
      const p = v * (1 - s);
      const q = v * (1 - f * s);
      const t = v * (1 - (1 - f) * s);
      let rn, gn, bn;

      switch (i % 6) {
        case 0: rn = v; gn = t; bn = p; break;
        case 1: rn = q; gn = v; bn = p; break;
        case 2: rn = p; gn = v; bn = t; break;
        case 3: rn = p; gn = q; bn = v; break;
        case 4: rn = t; gn = p; bn = v; break;
        case 5: rn = v; gn = p; bn = q; break;
      }

      // 对比度降低
      const contrast = 1.0 - scale * 0.3; // 1.0 到 0.7
      return {
        r: Math.max(0, Math.min(255, Math.round(128 + (rn * 255 - 128) * contrast))),
        g: Math.max(0, Math.min(255, Math.round(128 + (gn * 255 - 128) * contrast))),
        b: Math.max(0, Math.min(255, Math.round(128 + (bn * 255 - 128) * contrast)))
      };
    },

    calculateStats(gridData, rows, cols) {
      // 根据 removeEdge 设置决定是否跳过边缘单元格
      const shouldRemoveEdge = this.data.removeEdge !== false;  // 默认去除边缘

      const colorCounts = {};
      let totalCount = 0;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cell = gridData[row] && gridData[row][col];
          if (!cell || !cell.markCode) continue;
          // 根据 removeEdge 设置决定是否跳过边缘底色色块
          if (shouldRemoveEdge && cell.isEdge) continue;
          const code = cell.markCode;
          // 使用格式化后的色号作为key（去掉前导0）
          const formattedCode = formatMarkCode(code);
          if (!colorCounts[formattedCode]) {
            colorCounts[formattedCode] = {
              code: formattedCode,
              originalCode: code,
              hex: cell.markHex || '#000000',
              count: 0
            };
          }
          colorCounts[formattedCode].count++;
          totalCount++;
        }
      }

      return {
        colorCount: Object.keys(colorCounts).length,
        totalCount: totalCount,
        sortedByCount: Object.values(colorCounts).sort((a, b) => b.count - a.count)
      };
    },

    // 获取导出数据（供导出使用）
    getExportData() {
      // 马赛克模式返回转换后的 gridData
      if (this.data.processMode === 'mosaic' && this.cachedGridData && this.cachedGridInfo) {
        return {
          gridInfo: this.cachedGridInfo,
          gridData: this.cachedGridData,
          segments: this.cachedSegments,
          imageWidth: this.cachedSegmentsWidth,
          imageHeight: this.cachedSegmentsHeight
        };
      }
      return {
        gridInfo: this.cachedGridInfo,
        gridData: this.cachedGridData
      };
    },

    // 辅助方法：应用颜色处理和网格预设，返回裁剪后的数据
    // 用于 _finishMosaicResult 和 _finishSimpleResult 中减少重复代码
    _applyColorAndPreset(gridData, rows, cols, gridSize) {
      // 保存原始未裁剪数据（用于网格预设切换和颜色恢复）
      this.cachedOriginalGridData = this.deepCloneGridData(gridData, rows, cols);

      // 应用特殊色和鲜艳度处理
      this.replaceSpecialColors(gridData, rows, cols);
      this.reapplyVibrantScale(gridData, rows, cols);

      // 应用网格预设（截取/填充）
      const presetResult = this._applyGridPreset(gridData, cols, rows);

      // 更新缓存
      this.cachedGridData = presetResult.gridData;
      this.cachedGridInfo = { cols: presetResult.cols, rows: presetResult.rows, gridSize };

      return presetResult;
    },

    _finishMosaicResult(result, qualityGridSize, srcWidth, srcHeight) {
      const edgeDetection = detectEdgeColorFromSegments(result.segments, result.cols, result.rows, 30);
      if (edgeDetection && edgeDetection.hasEdge) {
        filterEdgeSegments(result.segments, result.cols, result.rows, edgeDetection.edgeColor, 25);
      }

      const gridData = convertSegmentsToGridData(result.segments, result.cols, result.rows);

      let edgeCount = 0, nonEdgeCount = 0, nullCount = 0;
      for (let r = 0; r < result.rows; r++) {
        for (let c = 0; c < result.cols; c++) {
          const cell = gridData[r] && gridData[r][c];
          if (!cell) { nullCount++; }
          else if (cell.isEdge) { edgeCount++; }
          else { nonEdgeCount++; }
        }
      }

      if (nonEdgeCount > 0 && edgeCount > 0) {
        const contentBoundary = findCropBoundaryFromGrid(gridData, result.rows, result.cols);
        if (contentBoundary.hasContent) {
          const cropResult = cropMosaicData(
            { gridData, rows: result.rows, cols: result.cols, gridSize: result.gridSize },
            contentBoundary
          );
          if (cropResult.gridData) {
            gridData.splice(0, gridData.length, ...cropResult.gridData);
            result.rows = cropResult.rows;
            result.cols = cropResult.cols;
          }
        }
      } else if (nonEdgeCount === 0) {
        console.log('[_finishMosaicResult] ⚠️ 所有格子都被标记为边缘，内容为空！');
      }

      // 应用颜色处理和网格预设（使用辅助方法）
      const presetResult = this._applyColorAndPreset(gridData, result.rows, result.cols, result.gridSize);
      const finalGridData = presetResult.gridData;
      const finalCols = presetResult.cols;
      const finalRows = presetResult.rows;

      // 保存马赛克模式特有的缓存
      this.cachedSegments = result.segments;
      this.cachedSegmentsWidth = srcWidth;
      this.cachedSegmentsHeight = srcHeight;
      this.cachedSegmentsGridSize = qualityGridSize;

      const stats = this.calculateStats(finalGridData, finalRows, finalCols);
      this.setData({
        gridInfo: { cols: finalCols, rows: finalRows, gridSize: result.gridSize },
        isProcessing: false
      });
      wx.hideLoading();
      this.triggerEvent('statsUpdate', { stats });

      setTimeout(() => {
        this.renderToCanvas(finalGridData, finalCols, finalRows, result.gridSize);
      }, 100);

      this.triggerEvent('mosaicGenerated', {
        gridInfo: { cols: finalCols, rows: finalRows, gridSize: result.gridSize },
        hasGridLines: result.hasGridLines || false
      });
    },

    _finishSimpleResult(result, qualityGridSize) {
      try {
        const pixelData = this.getCachedPixelData();
        const hasPixelData = pixelData && this.cachedWidth > 0 && this.cachedHeight > 0;

        const hasExistingIsEdge = result.gridData.some(row =>
          row && row.some(cell => cell && cell.isEdge)
        );

        let edgeDetection = null;
        let boundary = { hasEdge: false };

        if (hasExistingIsEdge) {
          edgeDetection = { hasEdge: true, edgeColor: null };
          boundary = { hasEdge: true, top: 0, bottom: result.rows, left: 0, right: result.cols };
        } else if (hasPixelData) {
          edgeDetection = detectEdgeColorFromGrid(result.gridData, result.rows, result.cols, qualityGridSize, 30);
          if (edgeDetection && edgeDetection.hasEdge) {
            boundary = { hasEdge: true, top: 0, bottom: result.rows, left: 0, right: result.cols };
          }
        }

        if (edgeDetection && edgeDetection.hasEdge) {
          const cropResult = filterEdgeBlocks(result.gridData, result.rows, result.cols, qualityGridSize, edgeDetection.edgeColor, boundary);
          if (cropResult.marked) {
            const contentBoundary = findCropBoundaryFromGrid(result.gridData, result.rows, result.cols);
            if (contentBoundary.hasContent) {
              const finalCropResult = cropMosaicData(
                { gridData: result.gridData, rows: result.rows, cols: result.cols, gridSize: qualityGridSize },
                contentBoundary
              );
              if (finalCropResult.gridData) {
                result.gridData = finalCropResult.gridData;
                result.rows = finalCropResult.rows;
                result.cols = finalCropResult.cols;
              }
            }
          }
        }
      } catch (e) {
        // ignore
      }

      // 应用颜色处理和网格预设（使用辅助方法）
      const presetResult = this._applyColorAndPreset(result.gridData, result.rows, result.cols, qualityGridSize);
      const finalGridData = presetResult.gridData;
      const finalCols = presetResult.cols;
      const finalRows = presetResult.rows;

      const stats = this.calculateStats(finalGridData, finalRows, finalCols);
      this.setData({
        gridInfo: { cols: finalCols, rows: finalRows, gridSize: qualityGridSize },
        isProcessing: false
      });
      wx.hideLoading();
      this.triggerEvent('statsUpdate', { stats });

      setTimeout(() => {
        this.renderToCanvas(finalGridData, finalCols, finalRows, qualityGridSize);
      }, 100);

      this.triggerEvent('mosaicGenerated', {
        gridInfo: { cols: finalCols, rows: finalRows, gridSize: qualityGridSize },
        hasGridLines: false
      });
    },

    getQualityGridSize(quality) {
      const baseGridSize = this.data.gridSize;
      // 调整：让预览使用更大的格子，保持高分辨率
      switch (quality) {
        case 1: return baseGridSize * 2;  // 低质量用较大格子
        case 2: return baseGridSize;
        case 3: return Math.ceil(baseGridSize / 2);
        default: return baseGridSize;
      }
    },

    processImage(imagePath) {
      // 清理旧缓存，避免内存溢出
      this.cachedPixelData = null;
      this.cachedGridData = null;
      this.cachedGridInfo = null;
      this.cachedOriginalGridData = null;
      this.cachedSegments = null;

      this.setData({ isProcessing: true });

      const that = this;
      const actualGridSize = this.data.gridSize;
      
      wx.getImageInfo({
        src: imagePath,
        success(res) {
          const systemInfo = wx.getSystemInfoSync();

          let displayWidth = systemInfo.windowWidth * 0.81;
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

    processWithSimpleAlgorithm(width, height, _gridSize) {
      this.setData({ isProcessing: false });
      const qualityGridSize = this.getQualityGridSize(this.data.previewQuality);
      let pixelData = this.getCachedPixelData();

      if (this.data.processMode === 'mosaic') {
        const result = processWithSmartRegions(null, width, height, qualityGridSize);
        this._finishMosaicResult(result, qualityGridSize, width, height);
        return;
      }

      const result = processSimple(pixelData, width, height, qualityGridSize, this.data.mergeThreshold, this.data.vibrantScale);
      this._finishSimpleResult(result, qualityGridSize);
    },

    processPixelData(pixelData, width, height) {
      this.cachedPixelData = new Uint8ClampedArray(pixelData);
      this.cachedWidth = width;
      this.cachedHeight = height;
      this.setData({ isProcessing: true });

      const qualityGridSize = this.getQualityGridSize(this.data.previewQuality);

      if (this.data.processMode === 'mosaic') {
        try {
          const result = processMosaicV2(pixelData, width, height, {
            gridSize: qualityGridSize,
            forceGridSize: this.data.forceGridSize || null,
            blurRadius: 2,
            morphRadius: 1,
            minCellArea: 30,
            mergeThreshold: this.data.mergeThreshold
          });
          this._finishMosaicResult(result, qualityGridSize, width, height);
        } catch (e) {
          console.error('马赛克模式处理失败:', e);
          console.warn('回退到旧版算法');
          const result = processWithSmartRegions(pixelData, width, height, qualityGridSize);
          this._finishMosaicResult(result, qualityGridSize, width, height);
        }
      } else {
        const result = processSimple(pixelData, width, height, qualityGridSize, this.data.mergeThreshold, this.data.vibrantScale);
        this._finishSimpleResult(result, qualityGridSize);
      }
    },

    // 渲染马赛克到 Canvas
    renderToCanvas(gridData, cols, rows, gridSize) {
      const that = this;
      this.isRendering = true;

      // 使用组件实例的 createSelectorQuery
      const query = this.createSelectorQuery();
      query.select('#mosaic-render-canvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0]) {
            
            // 重试
            setTimeout(() => {
              that.renderToCanvas(gridData, cols, rows, gridSize);
            }, 200);
            return;
          }
          if (!res[0].node) {
            
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
          
          
          
          
          // 设置 canvas 尺寸 - 应用用户缩放比例以保持高分辨率
          const userScale = that.data.scale || 1;
          // 限制 Canvas 最大尺寸为 16384（微信小程序限制）
          const MAX_CANVAS_DIMENSION = 16384;
          let scaledWidth = canvasWidth * userScale;
          let scaledHeight = canvasHeight * userScale;
          // 如果缩放后超出限制，则缩小比例
          if (scaledWidth > MAX_CANVAS_DIMENSION || scaledHeight > MAX_CANVAS_DIMENSION) {
            const scaleRatio = MAX_CANVAS_DIMENSION / Math.max(scaledWidth, scaledHeight);
            scaledWidth *= scaleRatio;
            scaledHeight *= scaleRatio;
          }
          canvas.width = Math.floor(scaledWidth);
          canvas.height = Math.floor(scaledHeight);

          
          
          // 存储引用
          that.canvasNode = canvas;
          that.canvasCtx = ctx;
          
          // 清空画布 - 使用浅灰色背景（使用实际Canvas尺寸）
          ctx.fillStyle = '#f0f0f0';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          // 计算缩放以适应 Canvas
          const totalGridWidth = cols * gridSize;
          const totalGridHeight = rows * gridSize;
          
          
          
          // 计算缩放比例，让整个马赛克适应 Canvas
          const scaleX = totalGridWidth > 0 ? canvasWidth / totalGridWidth : 1;
          const scaleY = totalGridHeight > 0 ? canvasHeight / totalGridHeight : 1;
          const baseScale = Math.min(scaleX, scaleY, 1);

          // 叠加用户的缩放比例（已经在上面定义了userScale）
          const scale = baseScale * userScale;
          
          
          
          // 居中偏移 - 使用实际的 Canvas 尺寸
          const actualCanvasWidth = canvas.width;
          const actualCanvasHeight = canvas.height;
          const baseOffsetX = (actualCanvasWidth - totalGridWidth * scale) / 2;
          const baseOffsetY = (actualCanvasHeight - totalGridHeight * scale) / 2;
          // 加上用户的拖动偏移
          const offsetX = baseOffsetX + (this.data.offsetX || 0);
          const offsetY = baseOffsetY + (this.data.offsetY || 0);

          
          
          
          
          // 计算可见区域（只渲染可见的格子）
          const cellSize = gridSize * scale;
          const buffer = cellSize;
          const visibleLeft = -buffer;
          const visibleRight = actualCanvasWidth + buffer;
          const visibleTop = -buffer;
          const visibleBottom = actualCanvasHeight + buffer;

          // 计算可见的行列范围（镜像时需用镜像后的坐标反推原始列号）
          let startCol, endCol;
          if (that.data.mirrorImage) {
            // 镜像后 cell 左边缘 = actualCanvasWidth - offsetX - (col+1)*cellSize
            // 可见条件：左边缘 < visibleRight 且 右边缘 > visibleLeft
            startCol = Math.max(0, Math.ceil((actualCanvasWidth - offsetX - visibleRight - cellSize) / cellSize));
            endCol = Math.min(cols - 1, Math.floor((actualCanvasWidth - offsetX - visibleLeft) / cellSize));
          } else {
            startCol = Math.max(0, Math.floor((visibleLeft - offsetX) / cellSize));
            endCol = Math.min(cols - 1, Math.ceil((visibleRight - offsetX) / cellSize));
          }
          const startRow = Math.max(0, Math.floor((visibleTop - offsetY) / cellSize));
          const endRow = Math.min(rows - 1, Math.ceil((visibleBottom - offsetY) / cellSize));

          // 绘制可见区域的格子
          const shouldRemoveEdge = that.data.removeEdge !== false;  // 默认去除边缘
          for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
              const cell = gridData[row] && gridData[row][col];
              // 跳过无效单元格（空白格子也要渲染）
              if (!cell || (shouldRemoveEdge && cell.isEdge)) continue;

              const cellWidth = cellSize;
              const cellHeight = cellSize;

              let x = offsetX + col * cellSize;
              const y = offsetY + row * cellSize;

              // 应用镜像变换
              if (that.data.mirrorImage) {
                x = actualCanvasWidth - x - cellWidth;
              }

              // 空白格子使用浅灰色
              if (cell.isEmpty) {
                ctx.fillStyle = '#F0F0F0';
              } else {
                ctx.fillStyle = cell.markHex;
              }
              ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(cellWidth), Math.ceil(cellHeight));

              // 绘制格子边框
              ctx.strokeStyle = cell.isEmpty ? 'rgba(0, 0, 0, 0.05)' : 'rgba(0, 0, 0, 0.1)';
              ctx.lineWidth = 1;
              ctx.strokeRect(Math.floor(x) + 0.5, Math.floor(y) + 0.5, Math.ceil(cellWidth) - 1, Math.ceil(cellHeight) - 1);

              // 绘制色号（空白格子不绘制）
              const size = Math.min(cellWidth, cellHeight);
              if (!cell.isEmpty && that.data.showCode && that.data.hasUserZoomed && size >= 8 && (!shouldRemoveEdge || !cell.isEdge)) {
            const isLight = that.isLightColor(cell.markHex);
                ctx.fillStyle = isLight ? '#333333' : '#ffffff';
                ctx.font = `${Math.max(6, size * 0.25)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
            ctx.fillText(that.formatMarkCode(cell.markCode), x + cellWidth / 2, y + cellHeight / 2);
              }
            }
          }

          // 绘制参考线（用户缩放后且实际色块>=8px时才显示）
          if (that.data.hasUserZoomed && cellSize >= 8) {
            that.drawGuideLines(ctx, offsetX, offsetY, cols, rows, gridSize, scale, startCol, endCol, startRow, endRow, that.data.mirrorImage, actualCanvasWidth);
          }

          // 绘制大区水印（用户缩放后且实际色块>=8px时才显示）
          if (that.data.hasUserZoomed && cellSize >= 8) {
            that.drawRegionWatermarks(ctx, offsetX, offsetY, cols, rows, gridSize, scale, startCol, endCol, startRow, endRow, that.data.mirrorImage, actualCanvasWidth);
          }

          // 渲染完成，释放节流标志
          that.isRendering = false;
        });
    },

    // 绘制参考线（只绘制可见区域内的）
    drawGuideLines(ctx, offsetX, offsetY, cols, rows, gridSize, scale, startCol, endCol, startRow, endRow, mirrorImage, canvasWidth) {
      const lineColor = 'rgba(70, 130, 180, 0.8)';
      const lineWidth = 1;
      const cellSize = gridSize * scale;

      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineWidth;

      // 计算需要绘制参考线的列（每10列）
      const firstLineCol = Math.ceil(startCol / 10) * 10;
      // 绘制垂直参考线（每10列，只画可见的）
      for (let col = firstLineCol; col <= endCol; col += 10) {
        let x = offsetX + col * cellSize;
        if (mirrorImage) x = canvasWidth - x;
        ctx.beginPath();
        ctx.moveTo(x, offsetY + startRow * cellSize);
        ctx.lineTo(x, offsetY + (endRow + 1) * cellSize);
        ctx.stroke();
      }

      // 计算需要绘制参考线的行（每10行）
      const firstLineRow = Math.ceil(startRow / 10) * 10;
      // 绘制水平参考线（每10行，只画可见的）
      for (let row = firstLineRow; row <= endRow; row += 10) {
        const y = offsetY + row * cellSize;
        ctx.beginPath();
        let leftX = offsetX + startCol * cellSize;
        let rightX = offsetX + (endCol + 1) * cellSize;
        if (mirrorImage) {
          leftX = canvasWidth - leftX;
          rightX = canvasWidth - rightX;
        }
        ctx.moveTo(Math.min(leftX, rightX), y);
        ctx.lineTo(Math.max(leftX, rightX), y);
        ctx.stroke();
      }
    },

    // 绘制大区水印（只绘制可见区域内的）
    drawRegionWatermarks(ctx, offsetX, offsetY, cols, rows, gridSize, scale, startCol, endCol, startRow, endRow, mirrorImage, canvasWidth) {
      const cellSize = gridSize * scale;
      const regionPixelSize = REGION_SIZE * cellSize; // 大区像素尺寸

      // 计算大区编号范围（从 0 开始）
      const regionStartCol = Math.floor(startCol / REGION_SIZE);
      const regionEndCol = Math.ceil(endCol / REGION_SIZE);
      const regionStartRow = Math.floor(startRow / REGION_SIZE);
      const regionEndRow = Math.ceil(endRow / REGION_SIZE);

      // 大区数量
      const totalRegionCols = Math.ceil(cols / REGION_SIZE);
      const totalRegionRows = Math.ceil(rows / REGION_SIZE);

      // 字体大小：大区尺寸的 40%
      const fontSize = Math.max(8, regionPixelSize * 0.4);

      ctx.save();
      ctx.globalAlpha = 0.15; // 透明度 15%
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#333333';

      // 遍历可见的大区
      for (let regionRow = regionStartRow; regionRow < regionEndRow && regionRow < totalRegionRows; regionRow++) {
        for (let regionCol = regionStartCol; regionCol < regionEndCol && regionCol < totalRegionCols; regionCol++) {
          // 计算大区中心位置
          let regionCenterX = offsetX + (regionCol * REGION_SIZE + REGION_SIZE / 2) * cellSize;
          if (mirrorImage) regionCenterX = canvasWidth - regionCenterX;
          const regionCenterY = offsetY + (regionRow * REGION_SIZE + REGION_SIZE / 2) * cellSize;

          // 生成大区编号：列编号 + 行号（从 1 开始）
          const colCode = getColCode(regionCol);
          const regionCode = colCode + (regionRow + 1);

          ctx.fillText(regionCode, regionCenterX, regionCenterY);
        }
      }

      ctx.restore();
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

    // 格式化色号（现已不需要转换，数据已不带前缀0）
    formatMarkCode(code) {
      if (!code) return '';
      return code;
    },

    // 解析色号（兼容大小写和前导0）
    parseMarkCode(input) {
      if (!input) return null;
      // 转换为大写并去除空格
      const normalized = input.toUpperCase().trim();
      // 匹配格式：字母+数字（如 A1, A01, a1, m9, M09, ZG1 等，支持双字母前缀）
      const match = normalized.match(/^([A-Z]{1,2})(\d+)$/);
      if (!match) return null;
      const letter = match[1];
      const num = parseInt(match[2], 10);
      // 输出时不加前缀0
      return `${letter}${num}`;
    },

    // 重试渲染（延迟执行）
    renderToCanvasRetry(gridData, cols, rows, gridSize) {

      this.renderToCanvas(gridData, cols, rows, gridSize);
    },

    // 渲染智能模式的色段到 Canvas
    renderSegmentsToCanvas(segments, imageWidth, imageHeight) {
      const that = this;
      this.isRendering = true;

      // 使用组件实例的 createSelectorQuery
      const query = this.createSelectorQuery();
      query.select('#mosaic-render-canvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0] || !res[0].node) {
            // 重试
            setTimeout(() => {
              that.renderSegmentsToCanvas(segments, imageWidth, imageHeight);
            }, 200);
            return;
          }

          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');

          // 使用组件 data 中的尺寸
          let canvasWidth = that.data.canvasWidth || 300;
          let canvasHeight = that.data.canvasHeight || 300;

          // 使用 Canvas 极限尺寸 4096
          const MAX_CANVAS_SIZE = 4096;
          canvasWidth = Math.min(canvasWidth, MAX_CANVAS_SIZE);
          canvasHeight = Math.min(canvasHeight, MAX_CANVAS_SIZE);

          // 设置 canvas 尺寸
          const userScale = that.data.scale || 1;
          const MAX_CANVAS_DIMENSION = 16384;
          let scaledWidth = canvasWidth * userScale;
          let scaledHeight = canvasHeight * userScale;
          if (scaledWidth > MAX_CANVAS_DIMENSION || scaledHeight > MAX_CANVAS_DIMENSION) {
            const scaleRatio = MAX_CANVAS_DIMENSION / Math.max(scaledWidth, scaledHeight);
            scaledWidth *= scaleRatio;
            scaledHeight *= scaleRatio;
          }
          canvas.width = Math.floor(scaledWidth);
          canvas.height = Math.floor(scaledHeight);

          // 存储引用
          that.canvasNode = canvas;
          that.canvasCtx = ctx;

          // 清空画布
          ctx.fillStyle = '#f0f0f0';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // 计算缩放比例，让整个图案适应 Canvas
          const scaleX = imageWidth > 0 ? canvasWidth / imageWidth : 1;
          const scaleY = imageHeight > 0 ? canvasHeight / imageHeight : 1;
          const baseScale = Math.min(scaleX, scaleY, 1);
          const scale = baseScale * userScale;

          // 居中偏移
          const actualCanvasWidth = canvas.width;
          const actualCanvasHeight = canvas.height;
          const totalSegmentWidth = imageWidth * scale;
          const totalSegmentHeight = imageHeight * scale;
          const baseOffsetX = (actualCanvasWidth - totalSegmentWidth) / 2;
          const baseOffsetY = (actualCanvasHeight - totalSegmentHeight) / 2;
          const offsetX = baseOffsetX + (this.data.offsetX || 0);
          const offsetY = baseOffsetY + (this.data.offsetY || 0);

          // 计算可见区域
          const buffer = 50;
          const visibleLeft = -buffer;
          const visibleRight = actualCanvasWidth + buffer;
          const visibleTop = -buffer;
          const visibleBottom = actualCanvasHeight + buffer;

          // 智能模式：计算网格信息（用于参考线和大区编号）
          let gridSize = 10;
          let maxCol = 0, maxRow = 0;
          if (segments.length > 0) {
            // 使用所有 segments 计算网格大小和行列数
            let gridSizeW = 0, gridSizeH = 0;
            let sizeCount = 0;
            for (const seg of segments) {
              if (seg.col !== undefined) {
                maxCol = Math.max(maxCol, seg.col);
                maxRow = Math.max(maxRow, seg.row);
              }
              // 统计所有 segment 的尺寸来计算 gridSize
              if (seg.width > 0 && seg.height > 0) {
                gridSizeW += seg.width;
                gridSizeH += seg.height;
                sizeCount++;
              }
            }
            if (sizeCount > 0) {
              gridSize = Math.round((gridSizeW / sizeCount + gridSizeH / sizeCount) / 2) || 10;
            }
          }
          const cols = maxCol + 1;
          const rows = maxRow + 1;

          // 渲染色段（使用原始坐标，保持位置准确）
          for (const segment of segments) {
            // 直接使用 segment 的原始坐标和尺寸
            const x = offsetX + segment.x * scale;
            const y = offsetY + segment.y * scale;
            const width = segment.width * scale;
            const height = segment.height * scale;

            // 跳过不可见的区域
            if (x + width < visibleLeft || x > visibleRight ||
                y + height < visibleTop || y > visibleBottom) {
              continue;
            }

            // 绘制色段（紧密排列，不留间隙）
            // 根据 removeEdge 设置决定是否跳过边缘色段
            const shouldRemoveEdge = that.data.removeEdge !== false;  // 默认去除边缘
            if (shouldRemoveEdge && segment.isEdge) continue;

            ctx.fillStyle = segment.markHex || '#cccccc';
            ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(width), Math.ceil(height));

            // 绘制色段边框
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
            ctx.lineWidth = 1;
            ctx.strokeRect(Math.floor(x) + 0.5, Math.floor(y) + 0.5, Math.ceil(width) - 1, Math.ceil(height) - 1);

            // 绘制色号（根据 removeEdge 设置决定是否绘制边缘色号）- 使用实际的 cell 尺寸
            const cellSize = Math.min(width, height);
            if (that.data.showCode && that.data.hasUserZoomed && cellSize >= 8 && (!shouldRemoveEdge || !segment.isEdge)) {
            const isLight = that.isLightColor(segment.markHex);
              ctx.fillStyle = isLight ? '#333333' : '#ffffff';
              ctx.font = `${Math.max(6, cellSize * 0.25)}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
            ctx.fillText(that.formatMarkCode(segment.markCode), x + width / 2, y + height / 2);
            }
          }

          // 绘制参考线和大区编号
          if (segments.length > 0) {
            const cellSize = gridSize * scale;
            // 计算可见的行列范围（镜像时需反推原始列号）
            let startCol, endCol;
            if (that.data.mirrorImage) {
              startCol = Math.max(0, Math.ceil((actualCanvasWidth - offsetX - visibleRight - cellSize) / cellSize));
              endCol = Math.min(cols - 1, Math.floor((actualCanvasWidth - offsetX - visibleLeft) / cellSize));
            } else {
              startCol = Math.max(0, Math.floor((visibleLeft - offsetX) / cellSize));
              endCol = Math.min(cols - 1, Math.ceil((visibleRight - offsetX) / cellSize));
            }
            const startRow = Math.max(0, Math.floor((visibleTop - offsetY) / cellSize));
            const endRow = Math.min(rows - 1, Math.ceil((visibleBottom - offsetY) / cellSize));

            // 绘制参考线和大区编号（用户缩放后且实际色块>=8px时才显示）
            if (that.data.hasUserZoomed && gridSize * scale >= 8) {
              that.drawGuideLines(ctx, offsetX, offsetY, cols, rows, gridSize, scale, startCol, endCol, startRow, endRow, that.data.mirrorImage, actualCanvasWidth);

              that.drawRegionWatermarks(ctx, offsetX, offsetY, cols, rows, gridSize, scale, startCol, endCol, startRow, endRow, that.data.mirrorImage, actualCanvasWidth);
            }
          }

          // 渲染完成
          that.isRendering = false;
        });
    },

    // 获取可见区域范围
    getVisibleRange() {
      if (!this.cachedGridData || !this.cachedGridInfo) {
        return null;
      }
      const { cols, rows, gridSize } = this.cachedGridInfo;
      const scale = this.data.scale || 1;
      const offsetX = this.data.offsetX || 0;
      const offsetY = this.data.offsetY || 0;

      const cellSize = gridSize * scale;
      const canvasWidth = this.data.canvasWidth || 300;
      const canvasHeight = this.data.canvasHeight || 300;

      // 计算可见区域
      const buffer = cellSize;
      const visibleLeft = -buffer;
      const visibleRight = canvasWidth + buffer;
      const visibleTop = -buffer;
      const visibleBottom = canvasHeight + buffer;

      // 计算居中偏移
      const totalGridWidth = cols * gridSize;
      const totalGridHeight = rows * gridSize;
      const baseScaleX = canvasWidth / totalGridWidth;
      const baseScaleY = canvasHeight / totalGridHeight;
      const baseScale = Math.min(baseScaleX, baseScaleY, 1);
      const actualScale = baseScale * scale;
      const baseOffsetX = (canvasWidth - totalGridWidth * actualScale) / 2;
      const baseOffsetY = (canvasHeight - totalGridHeight * actualScale) / 2;

      const finalOffsetX = baseOffsetX + offsetX;
      const finalOffsetY = baseOffsetY + offsetY;

      // 计算可见的行列范围
      const startCol = Math.max(0, Math.floor((visibleLeft - finalOffsetX) / cellSize));
      const endCol = Math.min(cols - 1, Math.ceil((visibleRight - finalOffsetX) / cellSize));
      const startRow = Math.max(0, Math.floor((visibleTop - finalOffsetY) / cellSize));
      const endRow = Math.min(rows - 1, Math.ceil((visibleBottom - finalOffsetY) / cellSize));

      return {
        startCol,
        endCol,
        startRow,
        endRow
      };
    },

    // 替换颜色
    replaceColor(fromCode, toCode, scope, positions) {
      // 马赛克模式使用 cachedGridData（转换后的 2D 网格）
      if (this.data.processMode === 'mosaic' && this.cachedGridData && this.cachedGridInfo) {
        return this._replaceColorInSegments(fromCode, toCode, scope, positions);
      }

      // 卡通模式使用 cachedGridData
      if (!this.cachedGridData || !this.cachedGridInfo) {
        return { success: false, message: '没有可替换的数据' };
      }

      const { cols, rows, gridSize } = this.cachedGridInfo;
      const gridData = this.cachedGridData;

      // 获取替换目标色号的信息
      const toColorHex = this._findColorHexByCode(toCode);

      if (!toColorHex) {
        return { success: false, message: '替换色号不存在' };
      }

      // 确定需要替换的范围
      let startCol = 0, endCol = cols - 1, startRow = 0, endRow = rows - 1;
      let positionList = null;

      if (positions && positions.length > 0) {
        // 使用指定的位置列表
        positionList = positions;
        startCol = Math.min(...positions.map(p => p.col !== undefined ? p.col : p[1]));
        endCol = Math.max(...positions.map(p => p.col !== undefined ? p.col : p[1]));
        startRow = Math.min(...positions.map(p => p.row !== undefined ? p.row : p[0]));
        endRow = Math.max(...positions.map(p => p.row !== undefined ? p.row : p[0]));
      } else if (scope === 'visible') {
        const visibleRange = this.getVisibleRange();
        if (visibleRange) {
          startCol = visibleRange.startCol;
          endCol = visibleRange.endCol;
          startRow = visibleRange.startRow;
          endRow = visibleRange.endRow;
        }
      }

      // 执行替换
      const replacedPositions = [];
      let count = 0;

      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          const cell = gridData[row] && gridData[row][col];
          if (!cell || !cell.markCode) continue;

          // 如果指定了位置列表，检查当前位置是否在列表中
          if (positionList) {
            const pos = positionList.find(p => (p.row !== undefined ? p.row : p[0]) === row && (p.col !== undefined ? p.col : p[1]) === col);
            if (!pos) continue;
          }

          // 检查是否匹配被替换的色号
          if (cell.markCode === fromCode) {
            // 保存原始信息用于撤销
            replacedPositions.push({
              row,
              col,
              oldCode: cell.markCode,
              oldHex: cell.markHex
            });

            // 替换
            cell.markCode = toCode;
            cell.markHex = toColorHex;
            count++;
          }
        }
      }

      if (count === 0) {
        return { success: false, message: '没有找到匹配的色块', count: 0 };
      }


      // 重新计算统计
      const stats = this.calculateStats(gridData, rows, cols);
      this.setData({
        gridInfo: { cols, rows, gridSize }
      });
      this.triggerEvent('statsUpdate', { stats: stats });

      // 重新渲染 - 使用 setTimeout 确保 Canvas 准备好
      setTimeout(() => {
        this.renderToCanvas(gridData, cols, rows, gridSize);
      }, 50);

      return {
        success: true,
        count,
        positions: replacedPositions
      };
    },

    // 根据色号查找颜色hex（懒初始化 Map 缓存，O(1) 查找）
    _findColorHexByCode(code) {
      if (!this._codeToHexCache) {
        const colorPalettes = require('../../data/colorPalettes.js');
        const colorMapping = colorPalettes.colorMapping;
        this._codeToHexCache = new Map();
        for (const hex in colorMapping) {
          const color = colorMapping[hex];
          if (color.MARD) {
            this._codeToHexCache.set(color.MARD, hex);
          }
        }
      }
      return this._codeToHexCache.get(code) || null;
    },

    // 马赛克模式：在 cachedGridData 中替换颜色
    _replaceColorInSegments(fromCode, toCode, scope, positions) {
      const { cols, rows, gridSize } = this.cachedGridInfo;
      const gridData = this.cachedGridData;

      if (!gridData) {
        return { success: false, message: '没有可替换的数据' };
      }

      // 获取替换目标色号的信息
      const toColorHex = this._findColorHexByCode(toCode);
      if (!toColorHex) {
        return { success: false, message: '替换色号不存在' };
      }


      // 确定需要替换的范围
      let startCol = 0, endCol = cols - 1, startRow = 0, endRow = rows - 1;
      let positionList = null;

      if (positions && positions.length > 0) {
        positionList = positions;
        startCol = Math.min(...positions.map(p => p.col !== undefined ? p.col : p[1]));
        endCol = Math.max(...positions.map(p => p.col !== undefined ? p.col : p[1]));
        startRow = Math.min(...positions.map(p => p.row !== undefined ? p.row : p[0]));
        endRow = Math.max(...positions.map(p => p.row !== undefined ? p.row : p[0]));
      }

      // 执行替换
      const replacedPositions = [];
      let count = 0;

      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          const cell = gridData[row] && gridData[row][col];
          if (!cell || !cell.markCode) continue;

          // 如果指定了位置列表，检查当前位置是否在列表中
          if (positionList) {
            const pos = positionList.find(p => (p.row !== undefined ? p.row : p[0]) === row && (p.col !== undefined ? p.col : p[1]) === col);
            if (!pos) continue;
          }

          // 检查是否匹配被替换的色号
          if (cell.markCode === fromCode) {
            replacedPositions.push({
              row,
              col,
              oldCode: cell.markCode,
              oldHex: cell.markHex
            });

            // 替换
            cell.markCode = toCode;
            cell.markHex = toColorHex;
            count++;
          }
        }
      }

      if (count === 0) {
        return { success: false, message: '没有找到匹配的色块', count: 0 };
      }


      // 同步更新 cachedSegments
      if (this.cachedSegments) {
        for (const pos of replacedPositions) {
          const segment = this.cachedSegments.find(s => s.row === pos.row && s.col === pos.col);
          if (segment) {
            segment.markCode = toCode;
            segment.markHex = toColorHex;
          }
        }
      }


      // 重新计算统计
      const stats = this.calculateStats(gridData, rows, cols);
      this.triggerEvent('statsUpdate', { stats: stats });

      // 重新渲染
      setTimeout(() => {
        this.renderToCanvas(gridData, cols, rows, gridSize);
      }, 50);

      return {
        success: true,
        count,
        positions: replacedPositions
      };
    },

    // 马赛克模式：大区替换（使用已裁剪的 cachedGridData）
    _replaceByRegionInSegments(regionCode, fromCode, toCode) {
      const { cols, rows, gridSize } = this.cachedGridInfo;
      const gridData = this.cachedGridData;

      if (!gridData) {
        return { success: false, message: '没有可替换的数据' };
      }

      // 获取目标大区内的所有色块位置
      const positions = getRegionCells(regionCode, cols, rows);


      if (positions.length === 0) {
        return { success: false, message: '大区编号无效或超出范围' };
      }

      // 获取替换目标色号的信息
      const toColorHex = this._findColorHexByCode(toCode);
      if (!toColorHex) {
        return { success: false, message: '替换色号不存在' };
      }

      // 执行替换（使用 cachedGridData，与卡通模式一致）
      const replacedPositions = [];
      let count = 0;

      for (let i = 0; i < positions.length; i++) {
        const { row, col } = positions[i];
        const cell = gridData[row] && gridData[row][col];
        if (!cell || !cell.markCode) continue;

        // 检查是否匹配被替换的色号
        if (cell.markCode === fromCode) {
          replacedPositions.push({
            row,
            col,
            oldCode: cell.markCode,
            oldHex: cell.markHex
          });

          // 替换
          cell.markCode = toCode;
          cell.markHex = toColorHex;
          count++;
        }
      }

      if (count === 0) {
        return { success: false, message: '该大区内没有匹配的色块', count: 0 };
      }

      // 同步更新 cachedSegments（用于保持一致性）
      if (this.cachedSegments) {
        for (const pos of replacedPositions) {
          const segment = this.cachedSegments.find(s => s.row === pos.row && s.col === pos.col);
          if (segment) {
            segment.markCode = toCode;
            segment.markHex = toColorHex;
          }
        }
      }

      // 重新计算统计（使用 gridData）
      const stats = this.calculateStats(gridData, rows, cols);
      this.triggerEvent('statsUpdate', { stats: stats });

      // 重新渲染
      setTimeout(() => {
        this.renderToCanvas(gridData, cols, rows, gridSize);
      }, 50);

      return {
        success: true,
        count,
        positions: replacedPositions
      };
    },

    // 大区替换：替换指定大区内的指定色号
    replaceByRegion(regionCode, fromCode, toCode) {
      // 马赛克模式使用 cachedGridData（转换后的 2D 网格）
      if (this.data.processMode === 'mosaic' && this.cachedGridData && this.cachedGridInfo) {
        return this._replaceByRegionInSegments(regionCode, fromCode, toCode);
      }

      // 卡通模式使用 cachedGridData
      if (!this.cachedGridData || !this.cachedGridInfo) {
        return { success: false, message: '没有可替换的数据' };
      }

      const { cols, rows, gridSize } = this.cachedGridInfo;
      const gridData = this.cachedGridData;

      // 获取目标大区内的所有色块位置
      const positions = getRegionCells(regionCode, cols, rows);

      if (positions.length === 0) {
        return { success: false, message: '大区编号无效或超出范围' };
      }

      // 获取替换目标色号的信息
      const toColorHex = this._findColorHexByCode(toCode);

      if (!toColorHex) {
        return { success: false, message: '替换色号不存在' };
      }

      // 执行替换
      const replacedPositions = [];
      let count = 0;

      for (let i = 0; i < positions.length; i++) {
        const { row, col } = positions[i];
        const cell = gridData[row] && gridData[row][col];
        if (!cell || !cell.markCode) continue;

        // 检查是否匹配被替换的色号
        if (cell.markCode === fromCode) {
          // 保存原始信息用于撤销
          replacedPositions.push({
            row,
            col,
            oldCode: cell.markCode,
            oldHex: cell.markHex
          });

          // 替换
          cell.markCode = toCode;
          cell.markHex = toColorHex;
          count++;
        }
      }

      if (count === 0) {
        return { success: false, message: '该大区内没有匹配的色块', count: 0 };
      }

      // 重新计算统计
      const stats = this.calculateStats(gridData, rows, cols);
      this.setData({
        gridInfo: { cols, rows, gridSize }
      });
      this.triggerEvent('statsUpdate', { stats: stats });

      // 重新渲染
      this.renderToCanvas(gridData, cols, rows, gridSize);

      return {
        success: true,
        count,
        positions: replacedPositions
      };
    },

    // 绘制网格数据到 canvas
    _drawGrid(ctx, canvas, gridData, cols, rows, gridSize) {
      const scale = this.data.scale || 1;
      const offsetX = this.data.offsetX || 0;
      const offsetY = this.data.offsetY || 0;
      const canvasWidth = this.data.canvasWidth || 300;
      const canvasHeight = this.data.canvasHeight || 300;

      const totalGridWidth = cols * gridSize;
      const totalGridHeight = rows * gridSize;
      const scaleX = totalGridWidth > 0 ? canvasWidth / totalGridWidth : 1;
      const scaleY = totalGridHeight > 0 ? canvasHeight / totalGridHeight : 1;
      const baseScale = Math.min(scaleX, scaleY, 1);
      const finalScale = baseScale * scale;

      const actualCanvasWidth = canvas.width;
      const actualCanvasHeight = canvas.height;
      const baseOffsetX = (actualCanvasWidth - totalGridWidth * finalScale) / 2;
      const baseOffsetY = (actualCanvasHeight - totalGridHeight * finalScale) / 2;
      const finalOffsetX = baseOffsetX + offsetX;
      const finalOffsetY = baseOffsetY + offsetY;

      // 清空画布
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cellSize = gridSize * finalScale;
      const buffer = cellSize;
      const visibleLeft = -buffer;
      const visibleRight = actualCanvasWidth + buffer;
      const visibleTop = -buffer;
      const visibleBottom = actualCanvasHeight + buffer;

      const startCol = Math.max(0, Math.floor((visibleLeft - finalOffsetX) / cellSize));
      const endCol = Math.min(cols - 1, Math.ceil((visibleRight - finalOffsetX) / cellSize));
      const startRow = Math.max(0, Math.floor((visibleTop - finalOffsetY) / cellSize));
      const endRow = Math.min(rows - 1, Math.ceil((visibleBottom - finalOffsetY) / cellSize));

      // 根据 removeEdge 设置决定是否跳过边缘单元格
      const shouldRemoveEdge = this.data.removeEdge !== false;  // 默认去除边缘

      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          const cell = gridData[row] && gridData[row][col];
          if (!cell || !cell.markCode || (shouldRemoveEdge && cell.isEdge)) continue;

          const cellWidth = cellSize;
          const cellHeight = cellSize;
          const x = finalOffsetX + col * cellSize;
          const y = finalOffsetY + row * cellSize;

          // 绘制色块（根据 removeEdge 设置决定是否绘制边缘）
          ctx.fillStyle = cell.markHex;
          ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(cellWidth), Math.ceil(cellHeight));

          ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
          ctx.lineWidth = 1;
          ctx.strokeRect(Math.floor(x) + 0.5, Math.floor(y) + 0.5, Math.ceil(cellWidth) - 1, Math.ceil(cellHeight) - 1);

          // 绘制色号（根据 removeEdge 设置决定是否绘制边缘色号）
          const size = Math.min(cellWidth, cellHeight);
          if (this.data.showCode && this.data.hasUserZoomed && size >= 8 && (!shouldRemoveEdge || !cell.isEdge)) {
            const isLight = isLightColor(cell.markHex);
            ctx.fillStyle = isLight ? '#333333' : '#ffffff';
            ctx.font = `${Math.max(6, size * 0.25)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(formatMarkCode(cell.markCode), x + cellWidth / 2, y + cellHeight / 2);
          }
        }
      }

    },

    handleCellTap(e) {
      const code = e.currentTarget.dataset.code;
      this.triggerEvent('cellClick', { code });
    },

    // 记录初始双指距离
    initialTouchDistance: 0,
    initialScale: 1,
    // 节流标志和渲染队列
    isRendering: false,
    pendingRender: null,
    // 操作间隔控制
    lastTouchTime: 0,
    TOUCH_THROTTLE: 20,

    handleTouchStart(e) {
      if (e.touches.length === 2) {
        // 双指触摸，记录初始距离、缩放和中心点
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        this.initialTouchDistance = Math.hypot(dx, dy);
        this.initialScale = this.data.scale;
        // 记录双指中心点（用于缩放时的偏移调整）
        this.initialCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        this.initialCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        this.initialOffsetX = this.data.offsetX;
        this.initialOffsetY = this.data.offsetY;
        // 双指时结束拖动状态
        this.setData({ isDragging: false });
      } else if (e.touches.length === 1) {
        // 开始拖动状态
        this.setData({ isDragging: true, lastTouch: e.touches[0] });
      }
    },

    handleTouchMove(e) {
      // 拖动时不受 isRendering 节流影响
      if (!this.data.isDragging && this.isRendering) {
        return;
      }

      if (e.touches.length === 2) {
        // 双指缩放（以手指中心点为基准）
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const currentDistance = Math.hypot(dx, dy);

        // 当前双指中心点
        const currentCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const currentCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

        if (this.initialTouchDistance > 0) {
          // 使用平方根曲线，让缩放更温和
          const scaleFactor = Math.sqrt(currentDistance / this.initialTouchDistance);
          const newScale = Math.max(1.0, Math.min(20, this.initialScale * scaleFactor));

          // 根据中心点变化调整偏移，保持缩放中心稳定
          const scaleDelta = newScale / this.initialScale;
          const canvasWidth = this.data.canvasWidth;
          const canvasHeight = this.data.canvasHeight;

          // 计算新的偏移量，使中心点相对于画布的位置保持不变
          let newOffsetX = this.initialOffsetX * scaleDelta + (currentCenterX - this.initialCenterX);
          let newOffsetY = this.initialOffsetY * scaleDelta + (currentCenterY - this.initialCenterY);

          // 计算合理的偏移边界
          const maxOffset = Math.max(2000, canvasWidth * newScale);
          newOffsetX = Math.max(-maxOffset, Math.min(maxOffset, newOffsetX));
          newOffsetY = Math.max(-maxOffset, Math.min(maxOffset, newOffsetY));

          this.setData({ scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY });
        }
      } else if (e.touches.length === 1 && this.data.lastTouch) {
        const current = e.touches[0];
        const last = this.data.lastTouch;
        const deltaX = current.clientX - last.clientX;
        const deltaY = current.clientY - last.clientY;

        // 任何缩放级别都可以拖动（scale >= 1.0）
        if (this.data.scale >= 1.0) {
          const canvasWidth = this.data.canvasWidth;
          const canvasHeight = this.data.canvasHeight;
          const maxOffset = Math.max(2000, canvasWidth * this.data.scale);

          let newOffsetX = this.data.offsetX + deltaX;
          let newOffsetY = this.data.offsetY + deltaY;
          newOffsetX = Math.max(-maxOffset, Math.min(maxOffset, newOffsetX));
          newOffsetY = Math.max(-maxOffset, Math.min(maxOffset, newOffsetY));

          this.setData({ offsetX: newOffsetX, offsetY: newOffsetY, lastTouch: current });
        }
      }
    },

    handleTouchEnd(e) {
      if (e.touches.length === 0) {
        // 结束拖动状态，触发渲染
        this.setData({ lastTouch: null, isDragging: false });
        this.initialTouchDistance = 0;
        this.initialCenterX = 0;
        this.initialCenterY = 0;

        // 拖动结束后渲染
        if (this.cachedGridData && this.cachedGridInfo) {
          const { cols, rows, gridSize } = this.cachedGridInfo;
          this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
        }
      }
    },

    // 阻止触摸事件冒泡（防止页面滚动）
    preventBubbling(e) {
      // 仅阻止事件冒泡，不做其他处理
    },

    // 延迟渲染，使用 requestAnimationFrame
    scheduleRender() {
      if (this.pendingRender) return;

      this.pendingRender = true;
      wx.nextTick(() => {
        this.pendingRender = false;
        // 使用 cachedGridData 渲染
        if (this.cachedGridData && this.cachedGridInfo) {
          const { cols, rows, gridSize } = this.cachedGridInfo;
          this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
        }
      });
    },

    // ========== 网格预设：截取/填充 ==========
    _applyGridPreset(gridData, cols, rows) {
      const preset = this.data.gridPreset;
      const presetIndex = preset[0];
      const targetCols = preset[1];
      const targetRows = preset[2];

      // 原图比例：不处理
      if (presetIndex === 0 || targetCols === 0 || targetRows === 0) {
        return { gridData, cols, rows };
      }

      // 从中心截取/填充
      const startCol = Math.max(0, Math.floor((cols - targetCols) / 2));
      const startRow = Math.max(0, Math.floor((rows - targetRows) / 2));

      const newCols = targetCols;
      const newRows = targetRows;
      const newGridData = [];

      for (let r = 0; r < newRows; r++) {
        newGridData[r] = [];
        for (let c = 0; c < newCols; c++) {
          const srcR = startRow + r;
          const srcC = startCol + c;
          if (srcR >= 0 && srcR < rows && srcC >= 0 && srcC < cols && gridData[srcR] && gridData[srcR][srcC]) {
            // 复制原始色块数据
            newGridData[r][c] = { ...gridData[srcR][srcC] };
          } else {
            // 空白填充
            newGridData[r][c] = {
              x: c * (gridData[0] && gridData[0][0] ? gridData[0][0].width || 10 : 10),
              y: r * (gridData[0] && gridData[0][0] ? gridData[0][0].height || 10 : 10),
              width: gridData[0] && gridData[0][0] ? gridData[0][0].width || 10 : 10,
              height: gridData[0] && gridData[0][0] ? gridData[0][0].height || 10 : 10,
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

      return { gridData: newGridData, cols: newCols, rows: newRows };
    }
  }
});
