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
   * 映射链路：屏幕坐标 → container CSS 坐标 → canvas 位图坐标 → grid 行列
   *
   * 1. boundingClientRect 获取 wrapper 屏幕位置
   * 2. 逆 CSS transform（translate + scale + transform-origin:center）映射到 container CSS 坐标
   * 3. CSS 坐标 × (actualCanvasWidth / canvasWidth) 映射到 canvas 位图像素
   * 4. 用 renderToCanvas 同一套 offsetX/cellSize 公式映射到 grid 行列
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

    // renderToCanvas 的公式（位图像素空间）
    const totalGridWidth = cols * gridSize;
    const totalGridHeight = rows * gridSize;
    const scaleX = totalGridWidth > 0 ? canvasWidth / totalGridWidth : 1;
    const scaleY = totalGridHeight > 0 ? canvasHeight / totalGridHeight : 1;
    const baseScale = Math.min(scaleX, scaleY, 1);
    const scale = baseScale * userScale;

    const actualCanvasWidth = this.canvasNode ? this.canvasNode.width : canvasWidth * userScale;
    const actualCanvasHeight = this.canvasNode ? this.canvasNode.height : canvasHeight * userScale;
    const baseOffsetX = (actualCanvasWidth - totalGridWidth * scale) / 2;
    const baseOffsetY = (actualCanvasHeight - totalGridHeight * scale) / 2;
    const renderOffsetX = baseOffsetX + dataOffsetX;
    const renderOffsetY = baseOffsetY + dataOffsetY;
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

        const centerCSSX = (viewportWidth / 2 - canvasWidth / 2 - dataOffsetX) / userScale + canvasWidth / 2;
        const centerCSSY = (viewportHeight / 2 - canvasHeight / 2 - dataOffsetY) / userScale + canvasHeight / 2;

        const bitmapCenterX = centerCSSX * (actualCanvasWidth / canvasWidth);
        const bitmapCenterY = centerCSSY * (actualCanvasHeight / canvasHeight);

        const centerCol = (bitmapCenterX - renderOffsetX) / cellSize;
        const centerRow = (bitmapCenterY - renderOffsetY) / cellSize;

        const visibleBitmapWidth = viewportWidth * actualCanvasWidth / canvasWidth / userScale;
        const visibleBitmapHeight = viewportHeight * actualCanvasHeight / canvasHeight / userScale;

        const halfCols = visibleBitmapWidth / cellSize / 2;
        const halfRows = visibleBitmapHeight / cellSize / 2;

        const startCol = Math.max(0, Math.floor(centerCol - halfCols));
        const endCol = Math.min(cols - 1, Math.ceil(centerCol + halfCols));
        const startRow = Math.max(0, Math.floor(centerRow - halfRows));
        const endRow = Math.min(rows - 1, Math.ceil(centerRow + halfRows));

        const subCols = endCol - startCol + 1;
        const subRows = endRow - startRow + 1;

        console.log('[getVisibleGridRange]', JSON.stringify({
          cols, rows, gridSize,
          userScale, canvasWidth, canvasHeight, dataOffsetX, dataOffsetY,
          actualCanvasWidth, actualCanvasHeight,
          baseScale, scale, cellSize,
          baseOffsetX, baseOffsetY, renderOffsetX, renderOffsetY,
          viewportWidth, viewportHeight,
          centerCSSX, centerCSSY, bitmapCenterX, bitmapCenterY,
          centerCol, centerRow,
          visibleBitmapWidth, visibleBitmapHeight,
          halfCols, halfRows,
          startCol, endCol, startRow, endRow, subCols, subRows
        }));

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
