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
    highlightCode: '',
    // 预计算的统计结果
    flatCells: null,
    // 是否显示色号标注
    showCode: false,
    // 网格大小
    gridSize: 10,
    // 颜色合并阈值
    mergeThreshold: 15,
    // 预览质量: 1=低(快速), 2=中, 3=高(精细)
    previewQuality: 2,
    // 导出 canvas 尺寸
    exportWidth: 300,
    exportHeight: 300,
    // 是否正在导出
    isExporting: false,
    // 触发器，用于强制重新生成
    regenerateTrigger: 0,
    // 真机调试时的 canvasId
    canvasId: 'export-canvas',

    // 下拉框选项
    qualityOptions: [
      { name: '低', value: 1 },
      { name: '中', value: 2 },
      { name: '高', value: 3 }
    ],
    gridOptions: [
      { name: '2', value: 2 },
      { name: '5', value: 5 },
      { name: '8', value: 8 },
      { name: '10', value: 10 },
      { name: '15', value: 15 },
      { name: '20', value: 20 },
      { name: '30', value: 30 },
      { name: '50', value: 50 }
    ],
    thresholdOptions: [
      { name: '不合并', value: 0 },
      { name: '5', value: 5 },
      { name: '15', value: 15 },
      { name: '30', value: 30 },
      { name: '50', value: 50 },
      { name: '100', value: 100 }
    ],
    // 当前选项索引（用于 picker 绑定）
    gridOptionIndex: 3,  // 默认 10
    thresholdOptionIndex: 2  // 默认 15
  },

  onLoad() {
    // 页面加载
  },

  // 图片选择回调
  onImageSelected(e) {
    const { path } = e.detail;
    // 保存原始图片路径，用于参数变化时重新生成
    this._originalImagePath = path;
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
    this._originalImagePath = '';
    this.setData({
      imagePath: '',
      currentStep: 1,
      mosaicData: null,
      highlightCode: null
    });
  },

  // 马赛克处理完成回调
  onMosaicGenerated(e) {
    const { gridInfo } = e.detail;
    // 只保存 gridInfo，不保存 gridData（避免大数据传输）
    this.setData({
      mosaicData: gridInfo,
      currentStep: 2
    });
  },

  // 统计更新回调 - 接收预计算好的统计结果
  onStatsUpdate(e) {
    const { stats } = e.detail;
    // 直接设置统计结果，不再传输大量格子数据
    this.setData({ flatCells: stats });
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
    // 导出中禁止调整
    if (this.data.isExporting) {
      wx.showToast({ title: '导出中，请稍候', icon: 'none' });
      return;
    }

    const index = parseInt(e.detail.value) || 0;
    const newQuality = this.data.qualityOptions[index].value;

    // 直接更新参数，让组件的 observers 检测到变化并重新生成
    // 不清空 imagePath，让组件保留缓存数据
    this.setData({
      previewQuality: newQuality,
      mosaicData: null,
      currentStep: 1
    });
  },

  // 调整网格大小
  onGridSizeChange(e) {
    // 导出中禁止调整
    if (this.data.isExporting) {
      wx.showToast({ title: '导出中，请稍候', icon: 'none' });
      return;
    }

    const index = parseInt(e.detail.value) || 0;
    const newGridSize = this.data.gridOptions[index].value;

    // 直接更新参数
    this.setData({
      gridSize: newGridSize,
      gridOptionIndex: index,
      mosaicData: null,
      currentStep: 1
    });
  },

  // 调整合并阈值
  onThresholdChange(e) {
    // 导出中禁止调整
    if (this.data.isExporting) {
      wx.showToast({ title: '导出中，请稍候', icon: 'none' });
      return;
    }

    const index = parseInt(e.detail.value) || 0;
    const newThreshold = this.data.thresholdOptions[index].value;

    // 直接更新参数
    this.setData({
      mergeThreshold: newThreshold,
      thresholdOptionIndex: index,
      mosaicData: null,
      currentStep: 1
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

    // 从组件获取 gridData（避免通过 setData 传输大数据）
    const mosaicCanvas = this.selectComponent('#mosaic-canvas');
    if (!mosaicCanvas || !mosaicCanvas.getExportData) {
      wx.showToast({ title: '导出组件异常', icon: 'none' });
      this.setData({ isExporting: false });
      return;
    }

    const exportData = mosaicCanvas.getExportData();
    const { cols, rows, gridSize } = exportData.gridInfo;
    const gridData = exportData.gridData;

    if (!gridData) {
      wx.showToast({ title: '请先生成马赛克', icon: 'none' });
      this.setData({ isExporting: false });
      return;
    }

    // 直接从 flatCells 获取统计结果
    const stats = this.data.flatCells || { sortedByCount: [] };
    
    // 增大分辨率：导出时使用更大的格子
    // 限制最大导出尺寸在 4096 像素内，避免 Canvas 2D 导出失败
    const exportScale = 2;  // 放大2倍，保证在尺寸限制内
    const exportGridSize = gridSize * exportScale;
    
    // 计算尺寸
    const mosaicWidth = cols * exportGridSize;
    const mosaicHeight = rows * exportGridSize;
    
    // 统计行：显示所有颜色，按数量排序
    const statsList = stats.sortedByCount;
    const itemsPerRow = 10;  // 每行10个，与图片等宽
    const statsItemHeight = 50; // 统计项高度
    const statsItemCount = statsList.length;
    const statsRowCount = Math.ceil(statsItemCount / itemsPerRow);
    const statsHeight = statsItemHeight * statsRowCount + 20;
    const canvasWidth = mosaicWidth;
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
        // 跳过 isRegionMember 的格子（它们会被根格子覆盖）
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const cell = gridData[row] && gridData[row][col];
            // 跳过无效格子或区域成员格子
            if (!cell || !cell.markCode || cell.isRegionMember) continue;

            // 使用格子的实际宽高（合并后），并进行缩放
            const cellWidth = (cell.width || gridSize) * exportScale;
            const cellHeight = (cell.height || gridSize) * exportScale;

            const x = col * gridSize * exportScale;
            const y = row * gridSize * exportScale;

            // 绘制色块
            ctx.fillStyle = cell.markHex;
            ctx.fillRect(x, y, cellWidth, cellHeight);

            // 绘制色号（根据实际的格子大小调整字号）
            if (cellWidth >= 15 && cellHeight >= 15) {
              // 根据色块颜色自动选择文字颜色
              const isLight = this.isLightColor(cell.markHex);
              ctx.fillStyle = isLight ? '#333' : '#fff';
              // 使用实际的 cellWidth 来计算字号，确保文字适应格子大小
              const fontSize = Math.max(8, Math.min(cellWidth, cellHeight) * 0.35);
              ctx.font = `bold ${fontSize.toFixed(0)}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(cell.markCode, x + cellWidth / 2, y + cellHeight / 2);
            }
          }
        }
        
        // 2. 绘制统计行（底部）- 玻璃拟态圆角按钮样式
        const statsY = mosaicHeight + 10;
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, mosaicHeight, canvasWidth, statsHeight);
        
        // 每行10个，与图片等宽
        const itemsPerRow = 10;
        
        // 绘制统计项：玻璃拟态圆角按钮样式
        for (let i = 0; i < statsItemCount; i++) {
          const item = statsList[i];
          const row = Math.floor(i / itemsPerRow);
          const col = i % itemsPerRow;
          
          // 均匀分布，每行等分
          const itemWidth = canvasWidth / itemsPerRow;
          const x = col * itemWidth + 8;
          const y = statsY + row * statsItemHeight;
          const btnWidth = itemWidth - 16;
          const btnHeight = statsItemHeight - 5;
          const radius = 15;
          
          // 格式化色号（省略第二个字符的0）
          let displayCode = item.code;
          if (displayCode.length >= 2 && displayCode[1] === '0') {
            displayCode = displayCode.charAt(0) + displayCode.substring(2);
          }
          
          const isLightColor = this.isLightColor(item.hex);
          
          // 绘制圆角按钮背景（玻璃拟态效果）
          // 1. 先绘制按钮背景
          ctx.fillStyle = item.hex;
          this.drawRoundedRect(ctx, x, y, btnWidth, btnHeight, radius);
          
          // 2. 绘制顶部高光
          ctx.save();
          this.drawRoundedRect(ctx, x, y, btnWidth, btnHeight, radius);
          ctx.clip();
          const gradient = ctx.createLinearGradient(x, y, x, y + btnHeight * 0.4);
          gradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
          gradient.addColorStop(1, 'rgba(255, 255, 255, 0.1)');
          ctx.fillStyle = gradient;
          ctx.fillRect(x, y, btnWidth, btnHeight * 0.4);
          ctx.restore();
          
          // 3. 绘制边框（玻璃拟态的亮边框）
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.lineWidth = 1;
          this.drawRoundedRect(ctx, x, y, btnWidth, btnHeight, radius);
          
          // 4. 绘制文字
          ctx.fillStyle = isLightColor ? '#333' : '#fff';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
          ctx.shadowBlur = 1;
          ctx.shadowOffsetX = 1;
          ctx.shadowOffsetY = 1;
          ctx.fillText(`${displayCode} (${item.count})`, x + btnWidth / 2, y + btnHeight / 2);
          ctx.shadowColor = 'transparent';
        }
        
        // 导出图片 - Canvas 2D 需要延迟等待渲染完成
        // 延长等待时间到 1 秒，确保大图也能导出成功
        console.log('准备导出，canvas对象:', typeof canvas);

        setTimeout(() => {
          const exportOptions = {
            success: (res) => {
              console.log('导出成功，临时文件路径:', res.tempFilePath);
              that.saveToPhotoAlbum(res.tempFilePath);
            },
            fail: (err) => {
              console.error('导出失败详细信息:', JSON.stringify(err));
              wx.showToast({ title: '导出失败，请重试' + JSON.stringify(err), icon: 'none' });
              that.setData({ isExporting: false });
            }
          };

          // 优先使用 canvas 对象
          if (typeof canvas === 'object' && canvas !== null) {
            exportOptions.canvas = canvas;
          } else if (that.data.canvasId) {
            exportOptions.canvasId = that.data.canvasId;
          }

          wx.canvasToTempFilePath(exportOptions, that);
        }, 3000); // 1秒等待
      });
  },

  // 保存图片到相册（带权限检查）
  saveToPhotoAlbum(tempFilePath) {
    const that = this;
    console.log('准备保存到相册, 文件路径:', tempFilePath);

    // 检查相册权限
    wx.getSetting({
      success(res) {
        console.log('权限设置:', JSON.stringify(res.authSetting));
        if (!res.authSetting['scope.writePhotosAlbum']) {
          // 没有权限，请求授权
          wx.authorize({
            scope: 'scope.writePhotosAlbum',
            success() {
              that.doSaveImage(tempFilePath);
            },
            fail(err) {
              console.error('授权失败:', err);
              // 用户拒绝，引导去设置页面
              wx.showModal({
                title: '需要相册权限',
                content: '保存图片需要相册权限，请在设置中开启',
                confirmText: '去设置',
                success(res) {
                  if (res.confirm) {
                    wx.openSetting();
                  }
                },
                complete() {
                  that.setData({ isExporting: false });
                }
              });
            }
          });
        } else {
          // 已有权限，直接保存
          that.doSaveImage(tempFilePath);
        }
      },
      fail(err) {
        console.error('获取设置失败:', err);
        // 尝试直接保存
        that.doSaveImage(tempFilePath);
      }
    });
  },

  // 执行保存图片
  doSaveImage(tempFilePath) {
    const that = this;
    wx.saveImageToPhotosAlbum({
      filePath: tempFilePath,
      success() {
        wx.showToast({ title: '保存成功', icon: 'success' });
      },
      fail(err) {
        // 如果是权限问题，引导去设置
        if (err.errMsg && err.errMsg.includes('auth deny')) {
          wx.showModal({
            title: '需要相册权限',
            content: '保存图片需要相册权限，请开启权限后重试',
            confirmText: '知道了',
            showCancel: false
          });
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      },
      complete() {
        that.setData({ isExporting: false });
      }
    });
  },

  // 回退方案：使用 Canvas 2D API
  exportPNGLegacy(width, height) {
    const that = this;

    // 从组件获取 gridData
    const mosaicCanvas = this.selectComponent('#mosaic-canvas');
    if (!mosaicCanvas || !mosaicCanvas.getExportData) {
      wx.showToast({ title: '导出组件异常', icon: 'none' });
      this.setData({ isExporting: false });
      return;
    }

    const exportData = mosaicCanvas.getExportData();
    const { rows, cols, gridSize } = exportData.gridInfo;
    const gridData = exportData.gridData;

    if (!gridData) {
      wx.showToast({ title: '请先生成马赛克', icon: 'none' });
      this.setData({ isExporting: false });
      return;
    }

    // 使用节点查询获取 canvas
    const query = wx.createSelectorQuery();
    query.select('#export-canvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0] || !res[0].node) {
          wx.showToast({ title: 'Canvas 初始化失败', icon: 'none' });
          that.setData({ isExporting: false });
          return;
        }

        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');

        // 设置 canvas 尺寸
        canvas.width = width;
        canvas.height = height;

        // 绘制
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const cell = gridData[row] && gridData[row][col];
            if (cell && cell.markCode) {
              ctx.fillStyle = cell.markHex;
              ctx.fillRect(cell.x, cell.y, cell.width, cell.height);
            }
          }
        }

        // 导出 - Canvas 2D 需要延迟等待渲染完成
        // 延长等待时间到 1 秒，确保大图也能导出成功
        setTimeout(() => {
          wx.canvasToTempFilePath({
            canvas: canvas,
            success: (res) => {
              console.log('导出临时文件路径:', res.tempFilePath);
              that.saveToPhotoAlbum(res.tempFilePath);
            },
            fail: (err) => {
              console.error('导出失败:', err);
              wx.showToast({ title: '导出失败，请重试', icon: 'none' });
              that.setData({ isExporting: false });
            }
          }, that);
        }, 3000); // 1秒等待
      });
  },

  // 分享给好友
  onShareAppMessage() {
    return {
      title: 'Mark 色彩马赛克 - 图片转珠子图案',
      path: '/pages/index/index'
    };
  },

  // 绘制圆角矩形
  drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  },

  // 判断颜色是否为浅色（需要深色文字）
  isLightColor(hex) {
    if (!hex) return false;
    // 去掉 #
    hex = hex.replace('#', '');
    // 解析 RGB
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
    // 计算亮度
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 150;
  },

  // 使用 canvasId 导出（真机调试兼容方案）
  exportWithCanvasId(width, height, retryCount) {
    const that = this;
    const maxRetries = 3;
    const delay = 300 * (retryCount + 1);
    
    setTimeout(() => {
      // 从组件获取数据
      const mosaicCanvas = that.selectComponent('#mosaic-canvas');
      if (!mosaicCanvas || !mosaicCanvas.getExportData) {
        wx.showToast({ title: '导出组件异常', icon: 'none' });
        that.setData({ isExporting: false });
        return;
      }
      
      const exportData = mosaicCanvas.getExportData();
      const { rows, cols, gridSize } = exportData.gridInfo;
      const gridData = exportData.gridData;
      
      if (!gridData) {
        wx.showToast({ title: '请先生成马赛克', icon: 'none' });
        that.setData({ isExporting: false });
        return;
      }
      
      // 使用节点查询获取 canvas
      const query = wx.createSelectorQuery();
      query.select('#export-canvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0] || !res[0].node) {
            // 使用传统 canvas
            that.exportPNGLegacy(width, height);
            return;
          }
          
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          
          // 设置尺寸
          canvas.width = width;
          canvas.height = height;
          
          // 绘制马赛克
          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
              const cell = gridData[row] && gridData[row][col];
              if (cell && cell.markCode && !cell.isRegionMember) {
                ctx.fillStyle = cell.markHex;
                ctx.fillRect(cell.x, cell.y, cell.width, cell.height);
              }
            }
          }
          
          // 尝试导出
          wx.canvasToTempFilePath({
            canvasId: 'export-canvas',
            success: (res) => {
              that.saveToPhotoAlbum(res.tempFilePath);
            },
            fail: (err) => {
              console.error('canvasId导出失败:', err);
              if (retryCount < maxRetries) {
                that.exportWithCanvasId(width, height, retryCount + 1);
              } else {
                // 回退到传统方式
                that.exportPNGLegacy(width, height);
              }
            }
          }, that);
        });
    }, delay);
  }
});
