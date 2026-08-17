/**
 * Canvas 渲染 mixin：绘制网格、色段、参考线、大区水印、分割线
 */
const { isLightColor, formatMarkCode, parseMarkCode } = require('../../../utils/colorHelpers');
const { REGION_SIZE, getColCode } = require('../../../utils/regionUtils');

module.exports = {
  isLightColor(hex) {
    return isLightColor(hex);
  },

  formatMarkCode(code) {
    return formatMarkCode(code);
  },

  parseMarkCode(input) {
    return parseMarkCode(input);
  },

  /**
   * 获取设备基准性能等级（缓存，避免每次渲染都调用同步 IPC wx.getSystemInfoSync）
   * benchmarkLevel 在会话内不会变化，首次调用后复用即可。
   */
  _getBenchmarkLevel() {
    if (this._cachedBenchmarkLevel === undefined) {
      try {
        const sysInfo = wx.getSystemInfoSync();
        this._cachedBenchmarkLevel = sysInfo.benchmarkLevel || 10;
      } catch (e) {
        this._cachedBenchmarkLevel = 10;
      }
    }
    return this._cachedBenchmarkLevel;
  },

  /**
   * 根据 benchmarkLevel 推导 Canvas 最大允许边长
   */
  _getMaxCanvasDimension() {
    const benchmarkLevel = this._getBenchmarkLevel();
    if (benchmarkLevel >= 30) return 16384;
    if (benchmarkLevel >= 23) return 8192;
    return 4096;
  },

  renderToCanvasRetry(gridData, cols, rows, gridSize) {
    this.renderToCanvas(gridData, cols, rows, gridSize);
  },

  renderToCanvas(gridData, cols, rows, gridSize) {
    if (this.isRendering) {
      // 渲染进行中：记录最新请求，完成后自动补渲一次（覆盖式，最多补一次）
      this._pendingReRender = { gridData, cols, rows, gridSize };
      return;
    }
    this.isRendering = true;
    const that = this;

    if (this._showTouchLoading) {
      this._showTouchLoading = false;
      this.triggerEvent('loadingChange', { show: true, text: '正在渲染...' });
      this._loadingShown = true;
    }

    const query = this.createSelectorQuery();
    query.select('#mosaic-render-canvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0]) {
          setTimeout(() => {
            that.renderToCanvas(gridData, cols, rows, gridSize);
          }, 200);
          return;
        }
        if (!res[0].node) {
          setTimeout(() => {
            that.renderToCanvas(gridData, cols, rows, gridSize);
          }, 200);
          return;
        }

        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');

        let canvasWidth = that.data.canvasWidth || 300;
        let canvasHeight = that.data.canvasHeight || 300;

        const MAX_CANVAS_SIZE = 4096;
        canvasWidth = Math.min(canvasWidth, MAX_CANVAS_SIZE);
        canvasHeight = Math.min(canvasHeight, MAX_CANVAS_SIZE);

        if (res[0].width > canvasWidth || res[0].height > canvasHeight) {
          canvasWidth = Math.min(res[0].width, MAX_CANVAS_SIZE);
          canvasHeight = Math.min(res[0].height, MAX_CANVAS_SIZE);
        }

        const userScale = that.data.scale || 1;

        // 性能：benchmarkLevel 缓存到实例属性，避免每次渲染都同步 IPC 取系统信息
        const MAX_CANVAS_DIMENSION = that._getMaxCanvasDimension();

        let scaledWidth = canvasWidth * userScale;
        let scaledHeight = canvasHeight * userScale;
        if (scaledWidth > MAX_CANVAS_DIMENSION || scaledHeight > MAX_CANVAS_DIMENSION) {
          const scaleRatio = MAX_CANVAS_DIMENSION / Math.max(scaledWidth, scaledHeight);
          scaledWidth *= scaleRatio;
          scaledHeight *= scaleRatio;
        }
        canvas.width = Math.floor(scaledWidth);
        canvas.height = Math.floor(scaledHeight);

        that.canvasNode = canvas;
        that.canvasCtx = ctx;

        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const totalGridWidth = cols * gridSize;
        const totalGridHeight = rows * gridSize;

        const scaleX = totalGridWidth > 0 ? canvasWidth / totalGridWidth : 1;
        const scaleY = totalGridHeight > 0 ? canvasHeight / totalGridHeight : 1;
        const baseScale = Math.min(scaleX, scaleY, 1);
        const scale = baseScale * userScale;

        const actualCanvasWidth = canvas.width;
        const actualCanvasHeight = canvas.height;
        const baseOffsetX = (actualCanvasWidth - totalGridWidth * scale) / 2;
        const baseOffsetY = (actualCanvasHeight - totalGridHeight * scale) / 2;
        const offsetX = baseOffsetX + (this.data.offsetX || 0);
        const offsetY = baseOffsetY + (this.data.offsetY || 0);

        const cellSize = gridSize * scale;

        that._lastRenderParams = {
          canvasWidth,
          canvasHeight,
          actualCanvasWidth,
          actualCanvasHeight,
          userScale,
          baseScale,
          scale,
          baseOffsetX,
          baseOffsetY,
          offsetX,
          offsetY,
          cellSize,
          cols,
          rows,
          gridSize
        };

        const buffer = cellSize;
        const visibleLeft = -buffer;
        const visibleRight = actualCanvasWidth + buffer;
        const visibleTop = -buffer;
        const visibleBottom = actualCanvasHeight + buffer;

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

        const shouldRemoveEdge = that.data.removeEdge === true;
        const showCode = that.data.showCode && that.data.hasUserZoomed && cellSize >= 15;
        // 预计算循环不变量（HIGH3 优化）
        const ceilCellW = Math.ceil(cellSize);
        const ceilCellH = Math.ceil(cellSize);
        const fontSize = Math.max(4, cellSize * 0.25);
        const fontStr = fontSize + 'px sans-serif';
        ctx.lineWidth = 1;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let row = startRow; row <= endRow; row++) {
          for (let col = startCol; col <= endCol; col++) {
            const cell = gridData[row] && gridData[row][col];
            if (!cell || (shouldRemoveEdge && cell.isEdge)) continue;

            let x = offsetX + col * cellSize;
            const y = offsetY + row * cellSize;

            if (that.data.mirrorImage) {
              x = actualCanvasWidth - x - cellSize;
            }

            const floorX = Math.floor(x);
            const floorY = Math.floor(y);

            if (cell.isEmpty) {
              ctx.fillStyle = '#F0F0F0';
            } else {
              ctx.fillStyle = cell.markHex;
            }
            ctx.fillRect(floorX, floorY, ceilCellW, ceilCellH);

            ctx.strokeStyle = cell.isEmpty ? 'rgba(0, 0, 0, 0.05)' : 'rgba(0, 0, 0, 0.1)';
            ctx.strokeRect(floorX + 0.5, floorY + 0.5, ceilCellW - 1, ceilCellH - 1);

            if (showCode && !cell.isEmpty && (!shouldRemoveEdge || !cell.isEdge)) {
              const isLight = isLightColor(cell.markHex);
              ctx.fillStyle = isLight ? '#333333' : '#ffffff';
              ctx.font = fontStr;
              ctx.fillText(formatMarkCode(cell.markCode), x + cellSize / 2, y + cellSize / 2);
            }
          }
        }

        if (that.data.hasUserZoomed && cellSize >= 15) {
          that.drawGuideLines(ctx, offsetX, offsetY, cols, rows, gridSize, scale, startCol, endCol, startRow, endRow, that.data.mirrorImage, actualCanvasWidth);
        }

        if (that.data.hasUserZoomed && cellSize >= 15) {
          that.drawRegionWatermarks(ctx, offsetX, offsetY, cols, rows, gridSize, scale, startCol, endCol, startRow, endRow, that.data.mirrorImage, actualCanvasWidth);
        }

        that.drawSplitLines(ctx, offsetX, offsetY, cols, rows, gridSize, scale);

        that.isRendering = false;
        that.triggerEvent('loadingChange', { show: false, text: '' });
        that._loadingShown = false;
        that._flushPendingRender();
      });
  },

  _flushPendingRender() {
    const pending = this._pendingReRender;
    this._pendingReRender = null;
    if (pending) {
      this.renderToCanvas(pending.gridData, pending.cols, pending.rows, pending.gridSize);
    }
  },

  drawGuideLines(ctx, offsetX, offsetY, cols, rows, gridSize, scale, startCol, endCol, startRow, endRow, mirrorImage, canvasWidth) {
    const lineColor = 'rgba(70, 130, 180, 0.8)';
    const lineWidth = 1;
    const cellSize = gridSize * scale;

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;

    const firstLineCol = Math.ceil(startCol / 10) * 10;
    for (let col = firstLineCol; col <= endCol; col += 10) {
      let x = offsetX + col * cellSize;
      if (mirrorImage) x = canvasWidth - x;
      ctx.beginPath();
      ctx.moveTo(x, offsetY + startRow * cellSize);
      ctx.lineTo(x, offsetY + (endRow + 1) * cellSize);
      ctx.stroke();
    }

    const firstLineRow = Math.ceil(startRow / 10) * 10;
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

  drawRegionWatermarks(ctx, offsetX, offsetY, cols, rows, gridSize, scale, startCol, endCol, startRow, endRow, mirrorImage, canvasWidth) {
    const cellSize = gridSize * scale;
    const regionPixelSize = REGION_SIZE * cellSize;

    const regionStartCol = Math.floor(startCol / REGION_SIZE);
    const regionEndCol = Math.ceil(endCol / REGION_SIZE);
    const regionStartRow = Math.floor(startRow / REGION_SIZE);
    const regionEndRow = Math.ceil(endRow / REGION_SIZE);

    const totalRegionCols = Math.ceil(cols / REGION_SIZE);
    const totalRegionRows = Math.ceil(rows / REGION_SIZE);

    const fontSize = Math.max(8, regionPixelSize * 0.4);

    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#333333';

    for (let regionRow = regionStartRow; regionRow < regionEndRow && regionRow < totalRegionRows; regionRow++) {
      for (let regionCol = regionStartCol; regionCol < regionEndCol && regionCol < totalRegionCols; regionCol++) {
        let regionCenterX = offsetX + (regionCol * REGION_SIZE + REGION_SIZE / 2) * cellSize;
        if (mirrorImage) regionCenterX = canvasWidth - regionCenterX;
        const regionCenterY = offsetY + (regionRow * REGION_SIZE + REGION_SIZE / 2) * cellSize;

        const colCode = getColCode(regionCol);
        const regionCode = colCode + (regionRow + 1);

        ctx.fillText(regionCode, regionCenterX, regionCenterY);
      }
    }

    ctx.restore();
  },

  drawSplitLines(ctx, offsetX, offsetY, cols, rows, gridSize, scale) {
    const splitMode = this.data.splitMode;
    if (!splitMode) return;

    const totalWidth = cols * gridSize * scale;
    const totalHeight = rows * gridSize * scale;
    const cellSize = gridSize * scale;

    const drawGridLines = (lineWidth, strokeColor, dashOffset) => {
      ctx.setLineDash([12, 8]);
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = strokeColor;
      ctx.lineDashOffset = dashOffset || 0;

      if (splitMode === 'grid52' || splitMode === 'grid104') {
        const blockSize = splitMode === 'grid52' ? 52 : 104;

        for (let c = blockSize; c < cols; c += blockSize) {
          const x = offsetX + c * cellSize;
          ctx.beginPath();
          ctx.moveTo(x, offsetY);
          ctx.lineTo(x, offsetY + totalHeight);
          ctx.stroke();
        }
        for (let r = blockSize; r < rows; r += blockSize) {
          const y = offsetY + r * cellSize;
          ctx.beginPath();
          ctx.moveTo(offsetX, y);
          ctx.lineTo(offsetX + totalWidth, y);
          ctx.stroke();
        }
      } else if (splitMode === 'horizontal') {
        const midY = offsetY + totalHeight / 2;
        ctx.beginPath();
        ctx.moveTo(offsetX, midY);
        ctx.lineTo(offsetX + totalWidth, midY);
        ctx.stroke();
      } else if (splitMode === 'vertical') {
        const midX = offsetX + totalWidth / 2;
        ctx.beginPath();
        ctx.moveTo(midX, offsetY);
        ctx.lineTo(midX, offsetY + totalHeight);
        ctx.stroke();
      } else if (splitMode === 'grid2x2') {
        const midY = offsetY + totalHeight / 2;
        const midX = offsetX + totalWidth / 2;
        ctx.beginPath();
        ctx.moveTo(offsetX, midY);
        ctx.lineTo(offsetX + totalWidth, midY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(midX, offsetY);
        ctx.lineTo(midX, offsetY + totalHeight);
        ctx.stroke();
      }
    };

    ctx.save();
    drawGridLines(3, 'rgba(255, 255, 255, 0.7)', 0);
    drawGridLines(1.5, 'rgba(0, 0, 0, 0.4)', 10);
    ctx.restore();
  }
};
