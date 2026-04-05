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
    exportHeight: 300
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

    const that = this;
    const { gridData, cols, rows, gridSize } = this.data.mosaicData;
    const { calculateStats } = require('../../utils/statsCalculator');
    const stats = calculateStats(this.data.mosaicData);
    
    // 计算尺寸
    const mosaicWidth = cols * gridSize;
    const mosaicHeight = rows * gridSize;
    
    // 统计行高度
    const statsHeight = 60;
    const cellSize = Math.min(24, gridSize * 1.5);  // 统计区域的色块稍大一点
    const statsRowCount = Math.min(stats.sortedByCount.length, 10);  // 最多显示10种颜色
    const statsWidth = statsRowCount * cellSize;
    
    // 合并后的尺寸
    const canvasWidth = Math.max(mosaicWidth, statsWidth);
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
        
        // 1. 绘制马赛克主体
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const cell = gridData[row][col];
            if (cell) {
              // 绘制色块
              ctx.fillStyle = cell.markHex;
              ctx.fillRect(cell.x, cell.y, cell.width, cell.height);
              
              // 绘制色号（如果格子足够大）
              if (gridSize >= 8) {
                ctx.fillStyle = '#fff';
                ctx.font = `bold ${Math.max(8, gridSize * 0.5)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(cell.markCode, cell.x + cell.width / 2, cell.y + cell.height / 2);
              }
            }
          }
        }
        
        // 2. 绘制统计行（底部）
        const statsY = mosaicHeight + 10;
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(0, mosaicHeight, canvasWidth, statsHeight);
        
        // 绘制颜色统计色块
        for (let i = 0; i < statsRowCount; i++) {
          const item = stats.sortedByCount[i];
          const x = i * cellSize + 10;
          
          // 色块
          ctx.fillStyle = item.hex;
          ctx.fillRect(x, statsY, cellSize - 2, cellSize - 2);
          
          // 色号+数量
          ctx.fillStyle = '#333';
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${item.code}`, x + cellSize / 2, statsY + cellSize + 10);
          ctx.fillText(`${item.count}`, x + cellSize / 2, statsY + cellSize + 22);
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
          },
          fail: (err) => {
            console.error('导出失败:', err);
            wx.showToast({ title: '导出失败', icon: 'none' });
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
              },
              fail: () => {
                wx.showToast({ title: '保存失败', icon: 'none' });
              }
            });
          },
          fail: () => {
            wx.showToast({ title: '导出失败', icon: 'none' });
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
