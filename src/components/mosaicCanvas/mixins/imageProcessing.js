/**
 * 图片处理 mixin：图片加载、像素处理、马赛克/卡通模式生成
 */
const { processSimple, processWithSmartRegions, detectEdgeColorFromGrid, detectEdgeColorFromSegments, filterEdgeSegments, filterEdgeBlocks, cropMosaicData, findCropBoundaryFromGrid, convertSegmentsToGridData, processMosaicV2, desaturateGrayColors } = require('../../../utils/imageProcessor');
const { setExcludeSpecial } = require('../../../utils/colorMapper');
const { filterIsolatedRegions, preserveEdgeQuantization, getSpotCleanParams } = require('../../../utils/spotCleaner');

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
    const pixelData = this.getCachedPixelData();
    const cachedWidth = this.cachedWidth;
    const cachedHeight = this.cachedHeight;
    if (!pixelData || cachedWidth === 0) return;

    // 同步特殊色开关到 colorMapper：useSpecialColors=false 时映射直接排除特殊色
    setExcludeSpecial(!this.data.useSpecialColors);

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

    const buffer = cellSize;
    const visibleLeft = -buffer;
    const visibleRight = canvasWidth + buffer;
    const visibleTop = -buffer;
    const visibleBottom = canvasHeight + buffer;

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
    this.setData({ isProcessing: false });
    setExcludeSpecial(!this.data.useSpecialColors);
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
    setExcludeSpecial(!this.data.useSpecialColors);
    this.cachedPixelData = new Uint8ClampedArray(pixelData);
    this.cachedWidth = width;
    this.cachedHeight = height;
    this.triggerEvent('loadingChange', { show: true, text: '正在处理图片...' });
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

    // 浊色规避后处理（默认关闭，由 antiGrayIntensity 控制，>0 时启用）
    if (this.data.antiGrayIntensity > 0) {
      desaturateGrayColors(gridData, result.rows, result.cols, this.data.antiGrayIntensity);
    }

    const presetResult = this._applyColorAndPreset(gridData, result.rows, result.cols, result.gridSize);
    const finalGridData = presetResult.gridData;
    const finalCols = presetResult.cols;
    const finalRows = presetResult.rows;

    // 孤立区域过滤（去杂色）：按 spotCleanLevel 预设强度合并空间孤立的小色块
    if (this.data.spotCleanLevel > 0) {
      const spotParams = getSpotCleanParams(this.data.spotCleanLevel);
      console.log('[spotClean] level=', this.data.spotCleanLevel, 'params=', spotParams, 'rows=', finalRows, 'cols=', finalCols);
      if (spotParams) {
        const modified = filterIsolatedRegions(finalGridData, finalRows, finalCols, spotParams.spotThreshold);
        console.log('[spotClean] modified=', modified);
      }
    }

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

    // 浊色规避后处理（默认关闭，由 antiGrayIntensity 控制，>0 时启用）
    if (this.data.antiGrayIntensity > 0) {
      desaturateGrayColors(result.gridData, result.rows, result.cols, this.data.antiGrayIntensity);
    }

    // 保边量化：在 markCode 映射之后，用原始颜色做连通区域扫描，
    // 让空间相邻、颜色相近的格子统一为同一个 markCode，避免连续色块被切成碎片
    if (this.data.spotCleanLevel > 0) {
      const spotParams = getSpotCleanParams(this.data.spotCleanLevel);
      if (spotParams) {
        const edgeModified = preserveEdgeQuantization(result.gridData, result.rows, result.cols, spotParams.edgeThreshold);
        console.log('[edgeQuantization] level=', this.data.spotCleanLevel, 'threshold=', spotParams.edgeThreshold, 'modified=', edgeModified);
      }
    }

    const presetResult = this._applyColorAndPreset(result.gridData, result.rows, result.cols, qualityGridSize);
    const finalGridData = presetResult.gridData;
    const finalCols = presetResult.cols;
    const finalRows = presetResult.rows;

    // 孤立区域过滤（去杂色）：按 spotCleanLevel 预设强度合并空间孤立的小色块
    if (this.data.spotCleanLevel > 0) {
      const spotParams = getSpotCleanParams(this.data.spotCleanLevel);
      console.log('[spotClean] level=', this.data.spotCleanLevel, 'params=', spotParams, 'rows=', finalRows, 'cols=', finalCols);
      if (spotParams) {
        const modified = filterIsolatedRegions(finalGridData, finalRows, finalCols, spotParams.spotThreshold);
        console.log('[spotClean] modified=', modified);
      }
    }

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
