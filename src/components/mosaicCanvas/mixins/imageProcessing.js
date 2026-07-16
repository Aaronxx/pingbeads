/**
 * 图片处理 mixin：图片加载、像素处理辅助方法
 *
 * regenerateFromCache / _applyColorAndPreset 已在 mosaicCanvas.js 主文件中覆盖，
 * 通过 colorPipeline.js 统一处理色彩算法。
 */
const { detectEdgeColorFromGrid, detectEdgeColorFromSegments, filterEdgeSegments, filterEdgeBlocks, cropMosaicData, findCropBoundaryFromGrid, convertSegmentsToGridData, desaturateGrayColors } = require('../../../utils/imageProcessor');

module.exports = {
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

  getCachedPixelData() {
    return this.cachedPixelData;
  },

  // 获取原图（未应用 gridPreset 裁剪）网格尺寸。
  // cachedOriginalGridData 在 _applyColorAndPreset 入口处保存裁剪前的完整网格，
  // 其行列数即原图网格尺寸，作为预设列表过滤的稳定基准。
  _getOriginalGridSize() {
    if (this.cachedOriginalGridData && this.cachedOriginalGridData.length > 0) {
      const rows = this.cachedOriginalGridData.length;
      const cols = this.cachedOriginalGridData[0] ? this.cachedOriginalGridData[0].length : 0;
      return { cols, rows };
    }
    return null;
  },

  setCachedPixelData(pixelData, width, height) {
    this.cachedPixelData = new Uint8ClampedArray(pixelData);
    this.cachedWidth = width;
    this.cachedHeight = height;
  },

  getQualityGridSize(quality) {
    const baseGridSize = this.data.gridSize;
    switch (quality) {
      case 1: return baseGridSize * 2;
      case 2: return baseGridSize;
      case 3: return Math.ceil(baseGridSize / 2);
      default: return baseGridSize;
    }
  },

  regenerateFromCache() {
    // 已在 mosaicCanvas.js 主文件中覆盖，通过 colorPipeline 处理
    // 此处保留空函数防止 mixin 展开时报错
  },

  calculateStats(gridData, rows, cols) {
    const { formatMarkCode } = require('../../../utils/colorHelpers');
    const shouldRemoveEdge = this.data.removeEdge === true;

    const colorCounts = {};
    let totalCount = 0;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = gridData[row] && gridData[row][col];
        if (!cell || !cell.markCode) continue;
        if (shouldRemoveEdge && cell.isEdge) continue;
        const code = cell.markCode;
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

  // 统计指定范围内的颜色
  calculateStatsInRange(gridData, startRow, endRow, startCol, endCol) {
    const { formatMarkCode } = require('../../../utils/colorHelpers');
    const shouldRemoveEdge = this.data.removeEdge === true;

    const colorCounts = {};
    let totalCount = 0;

    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const cell = gridData[row] && gridData[row][col];
        if (!cell || !cell.markCode) continue;
        if (shouldRemoveEdge && cell.isEdge) continue;
        const code = cell.markCode;
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

  /**
   * 获取当前可见区域对应的网格行列范围
   *
   * 使用「中心点 + 可见半径」方案：
   * 1. 用 boundingClientRect 获取 wrapper 实际可见区域尺寸
   * 2. 逆 CSS transform 将可见区域中心映射到 container 的 CSS 坐标
   * 3. 用 renderToCanvas 同一套 baseScale/baseOffset 公式映射到 grid 行列
   * 4. 从中心向两侧扩展可见半径
   *
   * @returns {Promise<{startCol, endCol, startRow, endRow, subCols, subRows} | null>}
   */
  getVisibleGridRange() {
    if (!this.cachedGridData || !this.cachedGridInfo) return Promise.resolve(null);
    const { cols, rows, gridSize } = this.cachedGridInfo;
    const userScale = this.data.scale || 1;
    const canvasWidth = this.data.canvasWidth || 300;
    const canvasHeight = this.data.canvasHeight || 300;
    const dataOffsetX = this.data.offsetX || 0;
    const dataOffsetY = this.data.offsetY || 0;

    const totalGridWidth = cols * gridSize;
    const totalGridHeight = rows * gridSize;
    const sx = totalGridWidth > 0 ? canvasWidth / totalGridWidth : 1;
    const sy = totalGridHeight > 0 ? canvasHeight / totalGridHeight : 1;
    const baseScale = Math.min(sx, sy, 1);
    const scale = baseScale * userScale;

    const actualCanvasWidth = this.canvasNode ? this.canvasNode.width : canvasWidth * userScale;
    const actualCanvasHeight = this.canvasNode ? this.canvasNode.height : canvasHeight * userScale;
    const baseOffsetX = (actualCanvasWidth - totalGridWidth * scale) / 2;
    const baseOffsetY = (actualCanvasHeight - totalGridHeight * scale) / 2;

    const cellSize = gridSize * scale;
    const canvasObj = this;

    return new Promise((resolve) => {
      const query = canvasObj.createSelectorQuery();
      query.select('#mosaic-wrapper').boundingClientRect();
      query.exec((res) => {
        const wrapperRect = res[0];
        if (!wrapperRect) {
          resolve(null);
          return;
        }

        const viewportWidth = wrapperRect.width;
        const viewportHeight = wrapperRect.height;

        // wrapper 中心在屏幕上的位置
        const wrapperCenterScreenX = wrapperRect.left + viewportWidth / 2;
        const wrapperCenterScreenY = wrapperRect.top + viewportHeight / 2;

        // CSS transform: translate(offsetX, offsetY) scale(userScale)
        // transform-origin: center center
        //
        // container CSS 左上角 (0,0) 映射到屏幕位置：
        //   screenX = wrapperRect.left + (0 - canvasWidth/2) * userScale + canvasWidth/2 + dataOffsetX
        //          = wrapperRect.left + canvasWidth * (1 - userScale) / 2 + dataOffsetX
        // 同理 Y 方向
        const contScreenLeft = wrapperRect.left + canvasWidth * (1 - userScale) / 2 + dataOffsetX;
        const contScreenTop = wrapperRect.top + canvasHeight * (1 - userScale) / 2 + dataOffsetY;

        // wrapper 中心在 container CSS 坐标中的位置（逆 transform）
        const centerCSSX = (wrapperCenterScreenX - contScreenLeft) / userScale;
        const centerCSSY = (wrapperCenterScreenY - contScreenTop) / userScale;

        // container CSS 坐标映射到 canvas 位图坐标
        // canvas 位图中 grid 的偏移 = baseOffsetX + dataOffsetX * (canvas位图像素/container CSS像素)
        // 但 renderToCanvas 用的是 offsetX = baseOffsetX + dataOffsetX
        // 注意：renderToCanvas 的 offsetX 是在 canvas 位图像素空间中的
        //
        // CSS 坐标到 canvas 位图像素的映射：
        // canvas 位图像素 = CSS坐标 * (actualCanvasWidth / canvasWidth) 
        // 但 canvas 实际像素宽度可能与 canvasWidth * userScale 不同（被 MAX_CANVAS_DIMENSION 限制）
        //
        // 更直接：用 renderToCanvas 同一套公式
        // renderToCanvas: offsetX = baseOffsetX + dataOffsetX
        // cell 在 canvas 中的 x = offsetX + col * cellSize
        // 所以 col = (canvasX - offsetX) / cellSize
        //
        // centerCSSX 是 container 的 CSS 坐标（范围 0~canvasWidth）
        // 对应 canvas 位图坐标 = centerCSSX * (actualCanvasWidth / canvasWidth) 不对...
        // 
        // 实际上 renderToCanvas 中 grid 的绘制直接基于 actualCanvasWidth，
        // 不存在 CSS→位图的额外缩放。renderToCanvas 的坐标都在位图像素空间。
        //
        // 但 CSS 坐标到 canvas 位图坐标的映射取决于 canvas.width 与 container CSS 宽度的比。
        // container CSS 宽度 = canvasWidth
        // canvas.width = actualCanvasWidth
        // 所以：canvas位图x = centerCSSX * (actualCanvasWidth / canvasWidth) ... 不完全对
        //
        // 回到 renderToCanvas 公式：
        //   canvas.width = actualCanvasWidth (可能被 cap 限制)
        //   scale = baseScale * userScale
        //   baseOffsetX = (actualCanvasWidth - totalGridWidth * scale) / 2
        //   offsetX = baseOffsetX + dataOffsetX
        //   cell x = offsetX + col * cellSize
        //
        // 我们需要把 wrapper 中心映射到这个坐标空间。
        // wrapper 中心对应的 canvas 位图 x = 
        //   需要知道 wrapper 中心相对于 canvas 位图原点的偏移
        //
        // 简化思路：直接用 CSS 坐标系中的映射
        // CSS 坐标 (centerCSSX, centerCSSY) 就是 container CSS 坐标
        // 在 CSS 坐标系中，grid 绘制位置（与 renderToCanvas 同理但用 CSS 尺寸）：
        //   cssBaseScale = baseScale (同)
        //   cssBaseOffsetX = (canvasWidth - totalGridWidth * baseScale) / 2
        //   cssOffsetX = cssBaseOffsetX + dataOffsetX
        //   col = (centerCSSX - cssOffsetX) / (gridSize * baseScale)
        //
        // 等等，renderToCanvas 中的 scale 包含了 userScale，
        // 而 CSS 坐标系中的"绘制"不包含 userScale（userScale 是 CSS transform）
        // 所以在 CSS 坐标系中，grid 相当于用 baseScale 绘制在 canvasWidth 的空间中，
        // 然后整个空间被 CSS scale(userScale) 放大

        const cssBaseScale = baseScale;
        const cssBaseOffsetX = (canvasWidth - totalGridWidth * cssBaseScale) / 2;
        const cssBaseOffsetY = (canvasHeight - totalGridHeight * cssBaseScale) / 2;
        const cssOffsetX = cssBaseOffsetX + dataOffsetX;
        const cssOffsetY = cssBaseOffsetY + dataOffsetY;
        const cssCellSize = gridSize * cssBaseScale;

        const centerCol = (centerCSSX - cssOffsetX) / cssCellSize;
        const centerRow = (centerCSSY - cssOffsetY) / cssCellSize;

        // 可见区域在 container CSS 坐标中的宽度 = viewportWidth / userScale
        const visibleCSSWidth = viewportWidth / userScale;
        const visibleCSSHeight = viewportHeight / userScale;

        const halfCols = visibleCSSWidth / cssCellSize / 2;
        const halfRows = visibleCSSHeight / cssCellSize / 2;

        const startCol = Math.max(0, Math.floor(centerCol - halfCols));
        const endCol = Math.min(cols - 1, Math.ceil(centerCol + halfCols));
        const startRow = Math.max(0, Math.floor(centerRow - halfRows));
        const endRow = Math.min(rows - 1, Math.ceil(centerRow + halfRows));

        const subCols = endCol - startCol + 1;
        const subRows = endRow - startRow + 1;

        resolve({ startCol, endCol, startRow, endRow, subCols, subRows });
      });
    });
  },

  getVisibleRange() {
    if (!this.cachedGridData || !this.cachedGridInfo) return null;
    const { cols, rows, gridSize } = this.cachedGridInfo;

    const userScale = this.data.scale || 1;
    const canvasWidth = this.data.canvasWidth || 300;
    const canvasHeight = this.data.canvasHeight || 300;
    const totalGridWidth = cols * gridSize;
    const totalGridHeight = rows * gridSize;
    const scaleX = totalGridWidth > 0 ? canvasWidth / totalGridWidth : 1;
    const scaleY = totalGridHeight > 0 ? canvasHeight / totalGridHeight : 1;
    const baseScale = Math.min(scaleX, scaleY, 1);
    const scale = baseScale * userScale;
    const actualCanvasWidth = canvasWidth * userScale;
    const actualCanvasHeight = canvasHeight * userScale;
    const baseOffsetX = (actualCanvasWidth - totalGridWidth * scale) / 2;
    const baseOffsetY = (actualCanvasHeight - totalGridHeight * scale) / 2;
    const offsetX = baseOffsetX;
    const offsetY = baseOffsetY;
    const cellSize = gridSize * scale;
    const buffer = cellSize;

    return {
      startCol: Math.max(0, Math.floor((-buffer - offsetX) / cellSize)),
      endCol: Math.min(cols - 1, Math.ceil((actualCanvasWidth + buffer - offsetX) / cellSize)),
      startRow: Math.max(0, Math.floor((-buffer - offsetY) / cellSize)),
      endRow: Math.min(rows - 1, Math.ceil((actualCanvasHeight + buffer - offsetY) / cellSize))
    };
  },

  processImage(imagePath) {
    this.cachedPixelData = null;
    this.cachedGridData = null;
    this.cachedGridInfo = null;
    this.cachedOriginalGridData = null;
    this.cachedSegments = null;
    this._cropOffsetCol = 0;
    this._cropOffsetRow = 0;

    this.triggerEvent('loadingChange', { show: true, text: '正在处理图片...' });
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
        that._viewportSize = null;

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
    // 像素数据获取失败的回退路径：直接调用主文件的 regenerateFromCache
    this.setData({ isProcessing: false });
    if (this.regenerateFromCache) {
      this.regenerateFromCache();
    }
  },

  processPixelData(pixelData, width, height) {
    this.cachedPixelData = new Uint8ClampedArray(pixelData);
    this.cachedWidth = width;
    this.cachedHeight = height;
    this.triggerEvent('loadingChange', { show: true, text: '正在处理图片...' });
    this.setData({ isProcessing: true });

    // 通过主文件的 regenerateFromCache（使用 colorPipeline）处理
    this.regenerateFromCache();
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

    // 浊色规避已移入 _applyMosaicResult 内部
    // 马赛克模式专用：不走 reapplyColors，保留 processMosaicV2 的色号映射
    const presetResult = this._applyMosaicResult(gridData, result.rows, result.cols, result.gridSize);
    const finalGridData = presetResult.gridData;
    const finalCols = presetResult.cols;
    const finalRows = presetResult.rows;

    this.cachedSegments = result.segments;
    this.cachedSegmentsWidth = srcWidth;
    this.cachedSegmentsHeight = srcHeight;
    this.cachedSegmentsGridSize = qualityGridSize;

    const stats = this.calculateStats(finalGridData, finalRows, finalCols);
    this.setData({
      gridInfo: { cols: finalCols, rows: finalRows, gridSize: result.gridSize },
      isProcessing: false
    });
    this.triggerEvent('statsUpdate', { stats });

    this.renderToCanvas(finalGridData, finalCols, finalRows, result.gridSize);

    this.triggerEvent('mosaicGenerated', {
      gridInfo: { cols: finalCols, rows: finalRows, gridSize: result.gridSize },
      // 原图（未应用 gridPreset 裁剪）网格尺寸，供页面层过滤预设列表
      originalGridSize: this._getOriginalGridSize(),
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

    // 浊色规避已移入 _applyColorAndPreset 内部，确保快照包含浊色规避结果
    const presetResult = this._applyColorAndPreset(result.gridData, result.rows, result.cols, qualityGridSize);

    const finalGridData = presetResult.gridData;
    const finalCols = presetResult.cols;
    const finalRows = presetResult.rows;

    const stats = this.calculateStats(finalGridData, finalRows, finalCols);
    this.setData({
      gridInfo: { cols: finalCols, rows: finalRows, gridSize: qualityGridSize },
      isProcessing: false
    });
    this.triggerEvent('statsUpdate', { stats });

    this.renderToCanvas(finalGridData, finalCols, finalRows, qualityGridSize);

    this.triggerEvent('mosaicGenerated', {
      gridInfo: { cols: finalCols, rows: finalRows, gridSize: qualityGridSize },
      // 原图（未应用 gridPreset 裁剪）网格尺寸，供页面层过滤预设列表
      originalGridSize: this._getOriginalGridSize(),
      hasGridLines: false
    });
  }
};
