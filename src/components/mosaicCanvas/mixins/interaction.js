/**
 * 触摸交互 mixin：缩放、拖动、点击、事件节流
 *
 * 性能要点：
 *   - lastTouch 只在 interaction 内部使用，存到实例属性 (_lastTouch)，
 *     不走 setData（避免每帧把 Touch 对象序列化到渲染层）
 *   - 单指拖动 / 双指缩放都用 setData 同步偏移（保证下次 move 读到最新值），
 *     但移除 lastTouch 字段后单次 setData 载荷显著减小
 *   - TOUCH_THROTTLE 当前作为双指缩放的最小帧间隔保险（节流冗余更新）
 */

module.exports = {
  initialTouchDistance: 0,
  initialScale: 1,
  isRendering: false,
  pendingRender: null,
  lastTouchTime: 0,
  TOUCH_THROTTLE: 20,
  // _lastTouch: 单指拖动时记录上一次触摸点（实例属性，不进 data）

  handleTouchStart(e) {
    // 缓存可见区域实际尺寸（异步，后续 touchMove 用缓存值）
    if (!this._viewportSize) {
      this._cacheViewportSize();
    }

    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      this.initialTouchDistance = Math.hypot(dx, dy);
      this.initialScale = this.data.scale;
      this.initialCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      this.initialCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      this.initialOffsetX = this.data.offsetX;
      this.initialOffsetY = this.data.offsetY;
      // 进入双指状态，清掉单指残留
      this._lastTouch = null;
      this.setData({ isDragging: false });
    } else if (e.touches.length === 1) {
      // 只保留用到的两个坐标，避免序列化完整 Touch 对象
      this._lastTouch = { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
      this.setData({ isDragging: true });
    }
  },

  handleTouchMove(e) {
    if (e.touches.length === 2) {
      // 双指缩放：基于 initial* 基准计算，相对稳定；用 TOUCH_THROTTLE 节流冗余帧
      const now = Date.now();
      if (now - this.lastTouchTime < this.TOUCH_THROTTLE) return;
      this.lastTouchTime = now;

      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const currentDistance = Math.hypot(dx, dy);

      const currentCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const currentCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      if (this.initialTouchDistance > 0) {
        const scaleFactor = Math.sqrt(currentDistance / this.initialTouchDistance);
        const newScale = Math.max(1.0, Math.min(20, this.initialScale * scaleFactor));

        const scaleDelta = newScale / this.initialScale;
        const canvasWidth = this.data.canvasWidth;
        const canvasHeight = this.data.canvasHeight;

        let newOffsetX = this.initialOffsetX * scaleDelta + (currentCenterX - this.initialCenterX);
        let newOffsetY = this.initialOffsetY * scaleDelta + (currentCenterY - this.initialCenterY);

        const limits = this._getDragLimits(newScale);
        newOffsetX = Math.max(limits.minX, Math.min(limits.maxX, newOffsetX));
        newOffsetY = Math.max(limits.minY, Math.min(limits.maxY, newOffsetY));

        this.setData({ scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY });
      }
    } else if (e.touches.length === 1 && this._lastTouch) {
      // 单指拖动：用实例属性 _lastTouch，不再走 setData 同步 lastTouch
      const current = e.touches[0];
      const last = this._lastTouch;
      const deltaX = current.clientX - last.clientX;
      const deltaY = current.clientY - last.clientY;

      if (this.data.scale >= 1.0) {
        const limits = this._getDragLimits();

        let newOffsetX = this.data.offsetX + deltaX;
        let newOffsetY = this.data.offsetY + deltaY;

        const clampedX = Math.max(limits.minX, Math.min(limits.maxX, newOffsetX));
        const clampedY = Math.max(limits.minY, Math.min(limits.maxY, newOffsetY));

        this._lastTouch = { clientX: current.clientX, clientY: current.clientY };
        this.setData({ offsetX: clampedX, offsetY: clampedY });
      }
    }
  },

  handleTouchEnd(e) {
    if (e.touches.length === 0) {
      this._lastTouch = null;
      this.setData({ isDragging: false });
      this.initialTouchDistance = 0;
      this.initialCenterX = 0;
      this.initialCenterY = 0;
      this._cacheViewportSize();
    }
  },

  handleCellTap(e) {
    const code = e.currentTarget.dataset.code;
    this.triggerEvent('cellClick', { code });
  },

  preventBubbling(e) {
    // 仅阻止事件冒泡，不做其他处理
  },

  scheduleRender() {
    if (this.pendingRender) return;

    this.pendingRender = true;
    wx.nextTick(() => {
      this.pendingRender = false;
      if (this.cachedGridData && this.cachedGridInfo) {
        const { cols, rows, gridSize } = this.cachedGridInfo;
        this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
      }
    });
  },

  /**
   * 计算拖动限制范围
   *
   * 拖动通过 CSS transform: translate(offsetX, offsetY) scale(scale) 实现
   * transform-origin: center center
   *
   * 限制：放大后的图片不能拖出可见区域（wrapper 的边界）
   * - 使用 _viewportSize（boundingClientRect 缓存）而非 canvasWidth，更准确
   * - 缩放后图片溢出量 = (viewportWidth × scale - viewportWidth) / 2
   */
  _getDragLimits(targetScale) {
    const viewportWidth = this._viewportSize ? this._viewportSize.width : (this.data.canvasWidth || 300);
    const viewportHeight = this._viewportSize ? this._viewportSize.height : (this.data.canvasHeight || 300);
    const scale = targetScale != null ? targetScale : (this.data.scale || 1);

    const imageWidth = viewportWidth * scale;
    const imageHeight = viewportHeight * scale;

    const overflowX = imageWidth - viewportWidth;
    const overflowY = imageHeight - viewportHeight;

    if (overflowX <= 0 && overflowY <= 0) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }

    const maxOffsetX = overflowX > 0 ? overflowX / 2 : 0;
    const maxOffsetY = overflowY > 0 ? overflowY / 2 : 0;

    return {
      minX: -maxOffsetX,
      maxX: maxOffsetX,
      minY: -maxOffsetY,
      maxY: maxOffsetY
    };
  },

  _cacheViewportSize() {
    const query = this.createSelectorQuery();
    query.select('#mosaic-wrapper').boundingClientRect();
    query.exec((res) => {
      if (res[0]) {
        this._viewportSize = { width: res[0].width, height: res[0].height };
      }
    });
  }
};
