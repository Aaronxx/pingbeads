/**
 * 触摸交互 mixin：缩放、拖动、点击、事件节流
 */

module.exports = {
  initialTouchDistance: 0,
  initialScale: 1,
  isRendering: false,
  pendingRender: null,
  lastTouchTime: 0,
  TOUCH_THROTTLE: 20,

  handleTouchStart(e) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      this.initialTouchDistance = Math.hypot(dx, dy);
      this.initialScale = this.data.scale;
      this.initialCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      this.initialCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      this.initialOffsetX = this.data.offsetX;
      this.initialOffsetY = this.data.offsetY;
      this.setData({ isDragging: false });
    } else if (e.touches.length === 1) {
      this.setData({ isDragging: true, lastTouch: e.touches[0] });
    }
  },

  handleTouchMove(e) {
    if (e.touches.length === 2) {
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
      this.setData({ lastTouch: null, isDragging: false });
      this.initialTouchDistance = 0;
      this.initialCenterX = 0;
      this.initialCenterY = 0;

      if (this.cachedGridData && this.cachedGridInfo) {
        const { cols, rows, gridSize } = this.cachedGridInfo;
        this.renderToCanvas(this.cachedGridData, cols, rows, gridSize);
      }
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
  }
};
