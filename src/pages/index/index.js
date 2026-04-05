// pages/index/index.js
Page({
  data: {
    // 当前步骤: 1-选择图片, 2-处理完成
    currentStep: 1,
    // 选择的图片路径
    imagePath: '',
    // 马赛克网格数据
    mosaicData: null,
    // 当前高亮的色号
    highlightCode: null,
    // 是否显示色号标注
    showCode: false,
    // 网格大小
    gridSize: 10,
    // 颜色合并阈值
    mergeThreshold: 5,
    // 预览质量: 1=低(快速), 2=中, 3=高(精细)
    previewQuality: 2,
    // 导出 canvas 尺寸
    exportWidth: 300,
    exportHeight: 300,
    // 是否正在导出
    isExporting: false
  },

  onLoad() {
    // 页面加载
  },

  // 图片选择回调
  onImageSelected(e) {
    const { path } = e.detail;
    wx.showToast({ title: '选择成功: ' + path.substring(0, 20), icon: 'none' });
    this.setData({
      imagePath: path,
      currentStep: 1,
      mosaicData: null,
      highlightCode: null,
      scale: 1
    });
  },

  // 图片清除回调
  onImageCleared() {
    this.setData({
      imagePath: '',
      currentStep: 1,
      mosaicData: null,
      highlightCode: null
    });
  },

  // 马赛克处理完成回调
  onMosaicGenerated(e) {
    console.log('[Index] onMosaicGenerated 收到事件', e.detail);
    const { gridInfo } = e.detail;
    console.log('[Index] gridInfo:', gridInfo ? '有数据' : '无数据');
    wx.showToast({ title: '收到马赛克数据', icon: 'none' });
    this.setData({
      mosaicData: gridInfo,
      currentStep: 2
    });
    console.log('[Index] mosaicData 已设置');
  },

  // 点击颜色色号回调
  onCodeClick(e) {
    const { code, hex } = e.detail;
    this.setData({ highlightCode: code });
  },

  // 切换色号显示
  onToggleShowCode(e) {
    this.setData({ showCode: e.detail.value });
  },

  // 调整预览质量
  onPreviewQualityChange(e) {
    this.setData({
      previewQuality: parseInt(e.detail.value) || 2
    });
  },

  // 调整网格大小
  onGridSizeChange(e) {
    this.setData({
      gridSize: parseInt(e.detail.value) || 10
    });
  },

  // 调整合并阈值
  onThresholdChange(e) {
    this.setData({
      mergeThreshold: parseInt(e.detail.value) || 30
    });
  },

  // 导出 PNG - 完整导出马赛克图+色号+统计
  exportPNG() {
    if (!this.data.mosaicData) {
      wx.showToast({ title: '请先生成马赛克', icon: 'none' });
      return;
    }
    
    // 如果正在导出，不允许重复点击
    if (this.data.isExporting) {
      return;
    }
    
    // 开始导出
    this.setData({ isExporting: true });

    const that = this;
    const { gridData, cols, rows, gridSize } = this.data.mosaicData;
    const { calculateStats } = require('../../utils/statsCalculator');
    const stats = calculateStats(this.data.mosaicData);
    
    // 增大分辨率：导出时使用更大的格子
    const exportScale = 3;  // 放大3倍
    const exportGridSize = gridSize * exportScale;
    
    // 计算尺寸
    const mosaicWidth = cols * exportGridSize;
    const mosaicHeight = rows * exportGridSize;
    
    // 统计行高度
    const statsHeight = 80;
    const statsItemWidth = 100;  // 每个统计项宽度
    const statsItemCount = Math.min(stats.sortedByCount.length, 8);  // 最多显示8种颜色
    const statsWidth = statsItemCount * statsItemWidth;
    
    // 合并后的尺寸
    const canvasWidth = Math.max(mosaicWidth, statsWidth + 40);
    const canvasHeight = mosaicHeight + statsHeight;
    
    // 使用节点查询获取 canvas
    const query = wx.createSelectorQuery();
    query.select('#export-canvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0] || !res[0].node) {
          that.exportPNGLegacy(canvasWidth, canvasHeight);
          return;
        }
        
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        
        // 设置 canvas 尺寸
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        
        // 1. 绘制马赛克主体（使用放大后的格子）
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const cell = gridData[row][col];
            if (cell) {
              const x = col * exportGridSize;
              const y = row * exportGridSize;
              
              // 绘制色块
              ctx.fillStyle = cell.markHex;
              ctx.fillRect(x, y, exportGridSize, exportGridSize);
              
              // 绘制色号（根据放大后的格子调整字号）
              if (exportGridSize >= 15) {
                ctx.fillStyle = '#fff';
                ctx.font = `bold ${Math.max(10, exportGridSize * 0.4)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(cell.markCode, x + exportGridSize / 2, y + exportGridSize / 2);
              }
            }
          }
        }
        
        // 2. 绘制统计行（底部）- 改为小矩形样式
        const statsY = mosaicHeight + 10;
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, mosaicHeight, canvasWidth, statsHeight);
        
        // 绘制统计项：色块 + 数量
        for (let i = 0; i < statsItemCount; i++) {
          const item = stats.sortedByCount[i];
          const x = 20 + i * statsItemWidth;
          
          // 绘制小矩形背景
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = '#e9ecef';
          ctx.lineWidth = 1;
          ctx.fillRect(x, statsY, statsItemWidth - 10, 50);
          ctx.strokeRect(x, statsY, statsItemWidth - 10, 50);
          
          // 绘制色块
          ctx.fillStyle = item.hex;
          ctx.fillRect(x + 8, statsY + 10, 24, 24);
          
          // 绘制数量
          ctx.fillStyle = '#333';
          ctx.font = 'bold 18px sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(`×${item.count}`, x + 40, statsY + 12);
        }
        
        // 导出图片
        wx.canvasToTempFilePath({
          canvas: canvas,
          success: (res) => {
            wx.saveImageToPhotosAlbum({
              filePath: res.tempFilePath,
              success: () => {
                wx.showToast({ title: '保存成功', icon: 'success' });
              },
              fail: (err) => {
                console.error('保存失败:', err);
                wx.showToast({ title: '保存失败', icon: 'none' });
              }
            });
            // 重置导出状态
            that.setData({ isExporting: false });
          },
          fail: (err) => {
            console.error('导出失败:', err);
            wx.showToast({ title: '导出失败', icon: 'none' });
            // 重置导出状态
            that.setData({ isExporting: false });
          }
        }, that);
      });
  },

  // 回退方案：使用传统方式
  exportPNGLegacy(width, height) {
    const ctx = wx.createCanvasContext('export-canvas', this);
    const { gridData, rows, cols } = this.data.mosaicData;
    const { gridSize } = this.data.mosaicData;
    
    // 动态设置 canvas 尺寸
    this.setData({ exportWidth: width, exportHeight: height });
    
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = gridData[row][col];
        if (cell) {
          ctx.setFillStyle(cell.markHex);
          ctx.fillRect(cell.x, cell.y, cell.width, cell.height);
        }
      }
    }
    
    ctx.draw(false, () => {
      setTimeout(() => {
        wx.canvasToTempFilePath({
          canvasId: 'export-canvas',
          success: (res) => {
            wx.saveImageToPhotosAlbum({
              filePath: res.tempFilePath,
              success: () => {
                wx.showToast({ title: '保存成功', icon: 'success' });
                this.setData({ isExporting: false });
              },
              fail: () => {
                wx.showToast({ title: '保存失败', icon: 'none' });
                this.setData({ isExporting: false });
              }
            });
          },
          fail: () => {
            wx.showToast({ title: '导出失败', icon: 'none' });
            this.setData({ isExporting: false });
          }
        }, this);
      }, 200);
    });
  },

  // 分享给好友
  onShareAppMessage() {
    return {
      title: 'Mark 色彩马赛克 - 图片转珠子图案',
      path: '/pages/index/index'
    };
  }
});
