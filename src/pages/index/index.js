// pages/index/index.js
const { isLightColor, formatMarkCode, parseMarkCode } = require('../../utils/colorHelpers');

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
    showCode: true,
    // 网格大小
    gridSize: 10,
    // 色彩阈值
    mergeThreshold: 15,
    // 处理模式: 'cartoon' | 'mosaic' - cartoon=卡通(普通模式), mosaic=马赛克(智能模式)
    processMode: 'cartoon',
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
      { name: '10', value: 10 },
      { name: '15', value: 15 },
      { name: '20', value: 20 },
      { name: '30', value: 30 }
    ],
    // 当前选项索引（用于 picker 绑定）
    gridOptionIndex: 3,  // 默认 10
    thresholdOptionIndex: 2,  // 默认 15

    // 替换功能
    showReplacePanel: false,  // 是否显示替换面板
    replaceRegionCode: '',  // 大区编号（如 A1）
    replaceFromCode: '',  // 被替换的色号
    replaceToCode: '',  // 替换的色号
    replaceScope: 'all',  // 替换范围：region=大区，all=全图

    // 撤销功能
    undoStack: [],  // 撤销栈，最多20步
    canUndo: false  // 是否可以撤销
  },

  onLoad() {
    // 页面加载
  },

  // 预览区点击事件（未选择图片时触发选择图片）
  onPreviewAreaClick() {
    if (!this.data.imagePath) {
      // 触发 imagePicker 组件的选择图片功能
      const imagePicker = this.selectComponent('#image-picker');
      if (imagePicker && imagePicker.chooseImage) {
        imagePicker.chooseImage();
      }
    }
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
    const { code } = e.detail;
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

  // 切换处理模式：卡通/马赛克
  toggleProcessMode() {
    // 导出中禁止调整
    if (this.data.isExporting) {
      wx.showToast({ title: '导出中，请稍候', icon: 'none' });
      return;
    }

    const newMode = this.data.processMode === 'cartoon' ? 'mosaic' : 'cartoon';
    this.setData({
      processMode: newMode,
      mosaicData: null,
      currentStep: 1
    });
  },

  // 切换替换面板显示
  toggleReplacePanel() {
    this.setData({
      showReplacePanel: !this.data.showReplacePanel
    });
  },

  // 被替换色号输入
  onReplaceFromInput(e) {
    this.setData({
      replaceFromCode: e.detail.value
    });
  },

  // 替换色号输入
  onReplaceToInput(e) {
    this.setData({
      replaceToCode: e.detail.value
    });
  },

  // 大区编号输入
  onReplaceRegionInput(e) {
    this.setData({
      replaceRegionCode: e.detail.value
    });
  },

  // 替换范围切换
  onReplaceScopeChange(e) {
    this.setData({
      replaceScope: e.detail.value
    });
  },

  // 确认替换
  onReplaceConfirm() {
    const { replaceRegionCode, replaceFromCode, replaceToCode, replaceScope } = this.data;

    // 检查色号是否输入
    if (!replaceFromCode || !replaceToCode) {
      wx.showToast({ title: '请输入色号', icon: 'none' });
      return;
    }

    // 检查大区编号（如果是选择大区替换）
    if (replaceScope === 'region' && !replaceRegionCode) {
      wx.showToast({ title: '请输入大区编号', icon: 'none' });
      return;
    }

    // 解析色号（兼容大小写和前导0）
    const fromCode = parseMarkCode(replaceFromCode);
    const toCode = parseMarkCode(replaceToCode);
    if (!fromCode || !toCode) {
      wx.showToast({ title: '色号格式错误', icon: 'none' });
      return;
    }

    // 获取马赛克组件
    const mosaicCanvas = this.selectComponent('#mosaic-canvas');
    if (!mosaicCanvas) {
      wx.showToast({ title: '组件异常', icon: 'none' });
      return;
    }

    let result;
    if (replaceScope === 'region') {
      // 大区替换
      result = mosaicCanvas.replaceByRegion(replaceRegionCode, fromCode, toCode);
    } else {
      // 全图替换
      result = mosaicCanvas.replaceColor(fromCode, toCode, 'all', null);
    }

    if (result.success) {
      // 记录撤销操作
      this._addUndoOperation({
        type: 'replace',
        fromCode: fromCode,
        toCode: toCode,
        positions: result.positions,
        scope: replaceScope
      });

      wx.showToast({ title: `已替换 ${result.count} 个色块`, icon: 'none' });
    } else {
      wx.showToast({ title: result.message || '替换失败', icon: 'none' });
    }
  },

  // 添加撤销操作
  _addUndoOperation(operation) {
    let { undoStack } = this.data;
    undoStack.push(operation);
    // 最多保留20步
    if (undoStack.length > 20) {
      undoStack = undoStack.slice(-20);
    }
    this.setData({
      undoStack: undoStack,
      canUndo: undoStack.length > 0
    });
  },

  // 撤销操作
  onUndo() {
    const { undoStack } = this.data;
    if (undoStack.length === 0) {
      wx.showToast({ title: '没有可撤销的操作', icon: 'none' });
      return;
    }

    // 获取最新的操作
    const lastOperation = undoStack[undoStack.length - 1];

    // 获取马赛克组件
    const mosaicCanvas = this.selectComponent('#mosaic-canvas');
    if (!mosaicCanvas) {
      wx.showToast({ title: '组件异常', icon: 'none' });
      return;
    }

    if (lastOperation.type === 'replace') {
      // 撤销替换：将色块恢复为原来的色号
      const result = mosaicCanvas.replaceColor(
        lastOperation.toCode,
        lastOperation.fromCode,
        lastOperation.scope,
        lastOperation.positions
      );

      if (result.success) {
        // 移除最新的操作
        undoStack.pop();
        this.setData({
          undoStack: undoStack,
          canUndo: undoStack.length > 0
        });
        wx.showToast({ title: `已撤销 ${result.count} 个色块`, icon: 'none' });
      }
    }
  },

  // 导出 PNG - 完整导出马赛克图+色号+统计
  exportPNG() {
    if (!this.data.mosaicData) {
      wx.showToast({ title: '请先生成拼豆图纸', icon: 'none' });
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
    const segments = exportData.segments;

    // 智能模式或普通模式都需要有数据
    if (!gridData && !segments) {
      wx.showToast({ title: '请先生成拼豆图纸', icon: 'none' });
      this.setData({ isExporting: false });
      return;
    }

    // 检查是否为智能模式
    const isMosaicMode = !!segments;

    // 直接从 flatCells 获取统计结果
    const stats = this.data.flatCells || { sortedByCount: [] };

    // 统计行：显示所有颜色，按数量排序（需要先计算statsHeight）
    const statsList = stats.sortedByCount;
    const itemsPerRow = 10;  // 每行10个，与图片等宽
    const statsItemHeight = 50; // 统计项高度
    const statsItemCount = statsList.length;
    const statsRowCount = Math.ceil(statsItemCount / itemsPerRow);
    const statsHeight = statsItemHeight * statsRowCount + 20;

    // 增大分辨率：导出时使用更大的格子
    // 动态计算放大倍数，限制最大导出尺寸在 4000 像素内，避免 Canvas 2D 导出失败
    const maxExportDimension = 4000;
    const baseWidth = cols * gridSize + 40; // 加上左侧标尺
    const baseHeight = rows * gridSize + 30 + statsHeight; // 加上顶部标尺和统计行

    // 计算合适的放大倍数，确保最长边不超过限制
    const scaleX = maxExportDimension / baseWidth;
    const scaleY = maxExportDimension / baseHeight;
    const exportScale = Math.min(2, Math.max(1, Math.min(scaleX, scaleY)));

    const exportGridSize = gridSize * exportScale;

    // 计算尺寸
    const mosaicWidth = cols * exportGridSize;
    const mosaicHeight = rows * exportGridSize;

    // 标尺区域尺寸
    const rulerWidth = 40;   // 左侧标尺宽度
    const rulerHeight = 30;  // 顶部标尺高度

    // 包含标尺的画布尺寸
    const canvasWidth = mosaicWidth + rulerWidth;
    const canvasHeight = mosaicHeight + rulerHeight + statsHeight;
    
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

        // 0. 绘制背景
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // 1. 绘制顶部列标尺 - 每个色块显示列号
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(rulerWidth, 0, mosaicWidth, rulerHeight);
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 1;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 动态计算字体大小，确保能显示下所有列号
        const colFontSize = Math.max(6, Math.min(10, mosaicWidth / cols * 0.7));
        ctx.font = `${colFontSize}px sans-serif`;

        for (let col = 1; col <= cols; col++) {
          const x = rulerWidth + (col - 0.5) * gridSize * exportScale;
          // 刻度线
          ctx.beginPath();
          ctx.moveTo(rulerWidth + (col - 1) * gridSize * exportScale, rulerHeight - 5);
          ctx.lineTo(rulerWidth + (col - 1) * gridSize * exportScale, rulerHeight);
          ctx.stroke();
          // 列号（从1开始）
          ctx.fillStyle = '#666666';
          ctx.fillText(col.toString(), x, rulerHeight / 2);
        }

        // 2. 绘制左侧行标尺 - 每个色块显示行号
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, rulerHeight, rulerWidth, mosaicHeight);
        // 标尺分隔线
        ctx.beginPath();
        ctx.moveTo(rulerWidth, 0);
        ctx.lineTo(rulerWidth, mosaicHeight + rulerHeight);
        ctx.stroke();

        // 动态计算字体大小
        const rowFontSize = Math.max(6, Math.min(10, mosaicHeight / rows * 0.7));
        ctx.font = `${rowFontSize}px sans-serif`;

        for (let row = 1; row <= rows; row++) {
          const y = rulerHeight + (row - 0.5) * gridSize * exportScale;
          // 刻度线
          ctx.beginPath();
          ctx.moveTo(rulerWidth - 5, rulerHeight + (row - 1) * gridSize * exportScale);
          ctx.lineTo(rulerWidth, rulerHeight + (row - 1) * gridSize * exportScale);
          ctx.stroke();
          // 行号（从1开始）
          ctx.fillStyle = '#666666';
          ctx.textAlign = 'right';
          ctx.fillText(row.toString(), rulerWidth - 5, y);
        }

        // 3. 绘制马赛克主体（使用放大后的格子）
        // 偏移位置：加上标尺的宽度和高度
        const offsetX = rulerWidth;
        const offsetY = rulerHeight;

        if (isMosaicMode && gridData) {
          // 智能模式：使用裁剪后的 gridData 绘制
          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
              const cell = gridData[row] && gridData[row][col];
              // 跳过无效格子或边缘底色格子
              if (!cell || !cell.markCode || cell.isEdge) continue;

              const x = offsetX + col * gridSize * exportScale;
              const y = offsetY + row * gridSize * exportScale;
              const width = (cell.width || gridSize) * exportScale;
              const height = (cell.height || gridSize) * exportScale;

              // 绘制色块
              ctx.fillStyle = cell.markHex || '#cccccc';
              ctx.fillRect(x, y, width, height);

              // 绘制色号（降低阈值到 4 像素，确保小图也能显示色号）
              if (width >= 4 && height >= 4) {
                const isLight = isLightColor(cell.markHex);
                ctx.fillStyle = isLight ? '#333' : '#fff';
                const fontSize = Math.max(4, Math.min(width, height) * 0.35);
                ctx.font = `bold ${fontSize.toFixed(0)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(formatMarkCode(cell.markCode), x + width / 2, y + height / 2);
              }
            }
          }
        } else if (isMosaicMode && segments) {
          // 智能模式：直接绘制 segments（降级处理）
          const imageWidth = cols * gridSize;
          const imageHeight = rows * gridSize;
          const segScaleX = mosaicWidth / imageWidth;
          const segScaleY = mosaicHeight / imageHeight;

          for (const segment of segments) {
            const x = offsetX + segment.x * segScaleX;
            const y = offsetY + segment.y * segScaleY;
            const width = segment.width * segScaleX;
            const height = segment.height * segScaleY;

            // 绘制色段
            ctx.fillStyle = segment.markHex || '#cccccc';
            ctx.fillRect(x, y, width, height);

            // 绘制色号（降低阈值到 4 像素，确保小图也能显示色号）
            if (width >= 4 && height >= 4) {
              const isLight = isLightColor(segment.markHex);
              ctx.fillStyle = isLight ? '#333' : '#fff';
              // 马赛克模式：色块通常较小，使用更大的比例和更小的最小值
              const fontSize = Math.max(4, Math.min(width, height) * 0.35);
              ctx.font = `bold ${fontSize.toFixed(0)}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(formatMarkCode(segment.markCode), x + width / 2, y + height / 2);
            }
          }
        } else {
          // 普通模式：使用 gridData 绘制
          // 跳过 isRegionMember 的格子（它们会被根格子覆盖）
          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
              const cell = gridData[row] && gridData[row][col];
              // 跳过无效格子、区域成员格子或边缘底色格子
              if (!cell || !cell.markCode || cell.isRegionMember || cell.isEdge) continue;

              // 使用格子的实际宽高（合并后），并进行缩放
              const cellWidth = (cell.width || gridSize) * exportScale;
              const cellHeight = (cell.height || gridSize) * exportScale;

              const x = offsetX + col * gridSize * exportScale;
              const y = offsetY + row * gridSize * exportScale;

              // 绘制色块
              ctx.fillStyle = cell.markHex;
              ctx.fillRect(x, y, cellWidth, cellHeight);

              // 绘制色号（根据实际的格子大小调整字号，降低阈值到 4 像素）
              if (cellWidth >= 4 && cellHeight >= 4) {
                // 根据色块颜色自动选择文字颜色
                const isLight = isLightColor(cell.markHex);
                ctx.fillStyle = isLight ? '#333' : '#fff';
                // 使用实际的 cellWidth 来计算字号，确保文字适应格子大小
                const fontSize = Math.max(8, Math.min(cellWidth, cellHeight) * 0.35);
                ctx.font = `bold ${fontSize.toFixed(0)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(formatMarkCode(cell.markCode), x + cellWidth / 2, y + cellHeight / 2);
              }
            }
          }
        }

        // 绘制参考线（每10行/列一条浅蓝色线）
        this.drawExportGuideLines(ctx, offsetX, offsetY, cols, rows, gridSize * exportScale);

        // 2. 绘制统计行（底部）- 玻璃拟态圆角按钮样式
        // 统计行位置（加上顶部标尺高度）
        const statsY = rulerHeight + mosaicHeight + 10;
        ctx.fillStyle = '#f8f9fa';
        // 统计行背景（从标尺下方开始）
        ctx.fillRect(0, rulerHeight + mosaicHeight, canvasWidth, statsHeight);

        // 每行10个，与图片等宽
        const itemsPerRow = 10;

        // 绘制统计项：玻璃拟态圆角按钮样式
        for (let i = 0; i < statsItemCount; i++) {
          const item = statsList[i];
          const row = Math.floor(i / itemsPerRow);
          const col = i % itemsPerRow;

          // 均匀分布，基于马赛克图宽度（不含标尺）
          const itemWidth = mosaicWidth / itemsPerRow;
          // 统计项从标尺右侧开始
          const x = rulerWidth + col * itemWidth + 8;
          const y = statsY + row * statsItemHeight;
          const btnWidth = itemWidth - 16;
          const btnHeight = statsItemHeight - 5;
          const radius = 15;
          
          // 格式化色号（省略第二个字符的0）
          let displayCode = item.code;
          if (displayCode.length >= 2 && displayCode[1] === '0') {
            displayCode = displayCode.charAt(0) + displayCode.substring(2);
          }
          
          const isLight = isLightColor(item.hex);
          
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

        // 4. 绘制水印 - 多行倾斜覆盖全图
        this.drawWatermark(ctx, canvasWidth, canvasHeight);

        // 导出图片 - Canvas 2D 需要延迟等待渲染完成
        // 延长等待时间到 3 秒，确保大图也能导出成功
        setTimeout(() => {
          const exportOptions = {
            success: (res) => {
              that.saveToPhotoAlbum(res.tempFilePath);
            },
            fail: () => {
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

          try {
            wx.canvasToTempFilePath(exportOptions, that);
          } catch (e) {
            wx.showToast({ title: '导出失败，请重试', icon: 'none' });
            that.setData({ isExporting: false });
          }
        }, 3000); // 3秒等待
      });
  },

  // 保存图片到相册（带权限检查）
  saveToPhotoAlbum(tempFilePath) {
    const that = this;
    

    // 直接尝试保存，让系统弹窗来处理权限请求
    // 如果权限未决定，会弹出系统授权弹窗
    // 如果用户拒绝，再引导去设置
    that.doSaveImage(tempFilePath);
  },

  // 显示权限被拒绝的弹窗
  showAuthDeniedModal(tempFilePath) {
    const that = this;
    wx.showModal({
      title: '需要相册权限',
      content: '保存图片需要授权访问相册权限',
      confirmText: '去设置',
      success(res) {
        if (res.confirm) {
          // 打开系统设置页面
          wx.openAppAuthorizeSetting({
            success() {
              // 用户设置完后，重新尝试保存
              that.doSaveImage(tempFilePath);
            },
            fail() {
              that.setData({ isExporting: false });
            }
          });
        } else {
          that.setData({ isExporting: false });
        }
      },
      fail() {
        that.setData({ isExporting: false });
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
        that.setData({ isExporting: false });
      },
      fail(err) {
        
        // 如果是权限问题（auth deny），引导去设置
        if (err.errMsg && (err.errMsg.includes('auth deny') || err.errMsg.includes('fail auth deny'))) {
          that.showAuthDeniedModal(tempFilePath);
        } else {
          wx.showToast({ title: '保存失败: ' + (err.errMsg || ''), icon: 'none', duration: 2000 });
          that.setData({ isExporting: false });
        }
      }
    });
  },

  // 绘制水印 - 多行倾斜覆盖全图
  drawWatermark(ctx, canvasWidth, canvasHeight) {
    const text = '拼豆酥';
    const fontSize = 24;
    const angle = -30 * Math.PI / 180; // 倾斜30度

    ctx.save();
    ctx.globalAlpha = 0.3; // 透明度30%
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = '#888888';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 计算倾斜后的文字区域
    const textWidth = ctx.measureText(text).width;

    // 斜向绘制：计算行列
    const spacingX = textWidth + 150;
    const spacingY = fontSize + 80;

    // 整个画布的中心旋转
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;

    // 移动到中心并旋转
    ctx.translate(centerX, centerY);
    ctx.rotate(angle);
    ctx.translate(-centerX, -centerY);

    // 绘制多行水印覆盖全图
    const rows = Math.ceil(canvasHeight / spacingY) + 2;
    const cols = Math.ceil(canvasWidth / spacingX) + 2;

    for (let row = -1; row < rows; row++) {
      for (let col = -1; col < cols; col++) {
        const x = col * spacingX + (row % 2) * (spacingX / 2);
        const y = row * spacingY;
        ctx.fillText(text, x, y);
      }
    }

    ctx.restore();
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
    const { rows, cols } = exportData.gridInfo;
    const gridData = exportData.gridData;

    if (!gridData) {
      wx.showToast({ title: '请先生成拼豆图纸', icon: 'none' });
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

        // 绘制水印
        this.drawWatermark(ctx, width, height);

        // 导出 - Canvas 2D 需要延迟等待渲染完成
        // 延长等待时间到 3 秒，确保大图也能导出成功
        setTimeout(() => {
          wx.canvasToTempFilePath({
            canvas: canvas,
            success: (res) => {
              that.saveToPhotoAlbum(res.tempFilePath);
            },
            fail: () => {
              wx.showToast({ title: '导出失败，请重试', icon: 'none' });
              that.setData({ isExporting: false });
            }
          }, that);
        }, 3000); // 3秒等待
      });
  },

  // 分享给好友
  onShareAppMessage() {
    return {
      title: '卡通/马赛克图转拼豆图纸',
      path: '/pages/index/index'
    };
  },

  // 绘制导出图片的参考线
  drawExportGuideLines(ctx, offsetX, offsetY, cols, rows, gridSize) {
    const lineColor = 'rgba(70, 130, 180, 0.8)'; // 更深更明显的钢蓝色
    const lineWidth = 3;

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;

    // 绘制垂直参考线（每10列）
    for (let col = 10; col < cols; col += 10) {
      const x = offsetX + col * gridSize;
      ctx.beginPath();
      ctx.moveTo(x, offsetY);
      ctx.lineTo(x, offsetY + rows * gridSize);
      ctx.stroke();
    }

    // 绘制水平参考线（每10行）
    for (let row = 10; row < rows; row += 10) {
      const y = offsetY + row * gridSize;
      ctx.beginPath();
      ctx.moveTo(offsetX, y);
      ctx.lineTo(offsetX + cols * gridSize, y);
      ctx.stroke();
    }
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
      const { rows, cols } = exportData.gridInfo;
      const gridData = exportData.gridData;
      
      if (!gridData) {
        wx.showToast({ title: '请先生成拼豆图纸', icon: 'none' });
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
              if (cell && cell.markCode && !cell.isRegionMember && !cell.isEdge) {
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
            fail: () => {
              
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
