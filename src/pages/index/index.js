// pages/index/index.js
const { isLightColor, formatMarkCode, parseMarkCode } = require('../../utils/colorHelpers');
const { setAntiGrayIntensity } = require('../../utils/colorMapper');

Page({
  data: {
    // 自定义 loading
    showLoading: false,
    loadingText: '加载中...',
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
    mergeThreshold: 30,
    // 处理模式: 'cartoon' | 'mosaic' - cartoon=卡通(普通模式), mosaic=马赛克(智能模式)
    processMode: 'cartoon',
    // 预览质量: 1=低(快速), 2=中, 3=高(精细)
    previewQuality: 2,
    // 导出 canvas 尺寸
    exportWidth: 300,
    exportHeight: 300,
    // 是否正在导出
    isExporting: false,
    // 分块导出进度 (0-100)
    exportProgress: 0,
    // 成功提示
    showSuccessToast: false,
    successToastText: '',
    // 分块导出模式：'' | 'horizontal' | 'vertical' | 'grid2x2'
    splitMode: '',
    splitModeText: '',
    // 分块选择弹窗
    showSplitPopup: false,
    // 触发器，用于强制重新生成
    regenerateTrigger: 0,
    // 真机调试时的 canvasId
    canvasId: 'export-canvas',

    // 设置面板是否展开
    isPanelOpen: false,
    // 设置面板是否最小化
    isPanelMinimized: false,

    // 下拉框选项
    qualityOptions: [
      { name: '低', value: 1 },
      { name: '中', value: 2 },
      { name: '高', value: 3 }
    ],
    gridOptions: [
      { name: '超级多', value: 5 },
      { name: '多', value: 8 },
      { name: '中等', value: 10 },
      { name: '少一点', value: 15 },
      { name: '再少一点', value: 20 },
      { name: '比较少了', value: 30 },
      { name: '超级少', value: 50 }
    ],
    thresholdOptions: [
      { name: '不合并', value: 0 },
      { name: '5', value: 5 },
      { name: '10', value: 10 },
      { name: '15', value: 15 },
      { name: '20 (推荐)', value: 20 },
      { name: '30 (推荐)', value: 30 },
      { name: '50', value: 50 },
      { name: '100', value: 100 },
      { name: '150', value: 150 },
      { name: '200', value: 200 },
      { name: '250', value: 250 },
      { name: '291', value: 291 }
    ],
    // 当前选项索引（用于 picker 绑定）
    gridOptionIndex: 2,  // 默认 10 (gridOptions[2].value = 10)
    thresholdOptionIndex: 5,  // 默认 30 (thresholdOptions[5].value = 30，甜区推荐值)

    // 特殊色设置
    useSpecialColors: false,  // 是否使用特殊色（P、Q、R、T、ZG系列）

    // 去除边缘设置
    removeEdge: true,  // 是否去除边缘底色

    // 镜像翻转
    mirrorImage: false,  // 是否镜像翻转

    // 鲜艳度增强
    vibrantScale: 0,  // 鲜艳度增强系数 (-10 到 10)
    vibrantBlockColor: '#9ca3af',  // 滑块颜色

    // 浊色规避：偏向高饱和高明度或深色，避开灰扑扑的中间色（默认关闭）
    antiGrayIntensity: 0,  // 滑块值 0-100（实际强度 = 值/100，传给组件）
    // 聚类算法对比开关：false=新算法(最远点+redmean)，true=老算法(空间采样+曼哈顿)
    useLegacyAggregation: false,
    antiGrayBlockColor: '#f59e0b',  // 滑块颜色（橙色，表示偏向鲜艳/深色）

    // 自定义网格大小
    useCustomGridSize: false,  // 是否启用自定义网格大小
    customGridSize: 10,  // 自定义网格大小（3-30）

    // 替换功能
    showReplacePanel: false,  // 是否显示替换面板
    replaceRegionCode: '',  // 大区编号（如 A1）
    replaceFromCode: '',  // 被替换的色号
    replaceToCode: '',  // 替换的色号
    replaceScope: 'all',  // 替换范围：region=大区，all=全图

    // 撤销功能
    undoStack: [],  // 撤销栈，最多20步
    canUndo: false,  // 是否可以撤销

    // 网格线检测状态
    hasGridLinesDetected: false,  // 马赛克模式下是否检测到网格线

    // 网格预设尺寸
    gridPresetIndex: 0,  // 默认 原图比例
    gridPresets: [
      { name: '原图比例', cols: 0, rows: 0 },
      { name: '200×200', cols: 200, rows: 200 },
      { name: '156×156', cols: 156, rows: 156 },
      { name: '104×104', cols: 104, rows: 104 },
      { name: '72×72', cols: 72, rows: 72 },
      { name: '52×52', cols: 52, rows: 52 },
      { name: '36×36', cols: 36, rows: 36 }
    ],
    availableGridPresets: [],  // 根据实际尺寸过滤后的可选项
    gridPresetDisabled: [],  // 不可选的网格预设索引
    // 最终用于渲染的网格尺寸（可能被预设覆盖）
    effectiveCols: 0,
    effectiveRows: 0
  },

  onLoad() {
    this.setData({
      vibrantBlockColor: this.calculateVibrantBlockColor(0),
      availableGridPresets: this.data.gridPresets.slice()
    });
  },

  _checkExporting() {
    if (this.data.isExporting) {
      wx.showToast({ title: '导出中，请稍候', icon: 'none' });
      return true;
    }
    return false;
  },

  // 显示自定义 loading
  showCustomLoading(text, progress) {
    const data = { showLoading: true, loadingText: text || '加载中...' };
    if (typeof progress === 'number') {
      data.exportProgress = progress;
    }
    this.setData(data);
  },

  // 隐藏自定义 loading
  hideCustomLoading() {
    this.setData({ showLoading: false, loadingText: '', exportProgress: 0 });
  },

  // 显示自定义成功提示
  showSuccessToast(text, duration) {
    const that = this;
    this.setData({ showSuccessToast: true, successToastText: text || '操作成功' });
    setTimeout(() => {
      that.setData({ showSuccessToast: false, successToastText: '' });
    }, duration || 2000);
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

  // 切换设置面板
  toggleSettingsPanel() {
    this.setData({
      isPanelOpen: !this.data.isPanelOpen
    });
  },

  // 关闭设置面板
  closeSettingsPanel() {
    this.setData({
      isPanelOpen: false,
      isPanelMinimized: false
    });
  },

  // 面板拖动相关变量
  _panelTouchStartY: 0,
  _panelMinHeight: 200,
  _panelMaxHeight: 0,

  // 面板拖动开始
  onPanelTouchStart(e) {
    this._panelTouchStartY = e.touches[0].clientY;
    // 获取屏幕高度计算面板最大高度
    const sysInfo = wx.getSystemInfoSync();
    this._panelMaxHeight = sysInfo.windowHeight * 0.75;
  },

  // 面板拖动中（向上拖动缩小，向下拖动放大）
  onPanelTouchMove(e) {
    const currentY = e.touches[0].clientY;
    const deltaY = this._panelTouchStartY - currentY;

    // 如果向上拖动超过阈值，缩小面板
    if (deltaY > 50 && !this.data.isPanelMinimized) {
      this.setData({ isPanelMinimized: true });
      this._panelTouchStartY = currentY;
    }
    // 如果向下拖动超过阈值，放大面板
    else if (deltaY < -50 && this.data.isPanelMinimized) {
      this.setData({ isPanelMinimized: false });
      this._panelTouchStartY = currentY;
    }
  },

  // 面板拖动结束
  onPanelTouchEnd(e) {
    // 无需额外处理
  },

  // 点击拖动条切换面板大小
  onPanelHandleTap() {
    this.setData({
      isPanelMinimized: !this.data.isPanelMinimized
    });
  },

  // 图片选择回调
  onImageSelected(e) {
    const { path } = e.detail;
    // 保存原始图片路径，用于参数变化时重新生成
    this._originalImagePath = path;
    // 重置所有设置项为默认值
    this._resetSettings();
    this.setData({
      imagePath: path,
      currentStep: 1,
      mosaicData: null,
      highlightCode: ''
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
    // 检查图片是否已被清除（内容审核失败）
    if (!this.data.imagePath) {
      return;
    }

    const { gridInfo } = e.detail;
    const actualCols = gridInfo.cols;
    const actualRows = gridInfo.rows;

    // 过滤可用的网格预设
    const available = this.data.gridPresets.filter(p => p.cols === 0 || p.rows === 0 || (actualCols >= p.cols && actualRows >= p.rows));
    // 确保当前选中的 preset 在可用列表中，否则重置为原图比例
    let newPresetIndex = this.data.gridPresetIndex;
    if (newPresetIndex >= available.length) newPresetIndex = 0;

    this.setData({
      mosaicData: gridInfo,
      currentStep: 2,
      hasGridLinesDetected: e.detail.hasGridLines || false,
      customGridSize: Math.min(50, Math.max(3, gridInfo.gridSize)),
      effectiveCols: actualCols,
      effectiveRows: actualRows,
      availableGridPresets: available,
      gridPresetIndex: newPresetIndex
    });
  },

  // 统计更新回调 - 接收预计算好的统计结果
  onStatsUpdate(e) {
    const { stats } = e.detail;
    // 直接设置统计结果，不再传输大量格子数据
    this.setData({ flatCells: stats });
  },

  // mosaicCanvas 的 loading 变化事件
  onLoadingChange(e) {
    const { show, text } = e.detail;
    if (show) {
      this.showCustomLoading(text);
    } else {
      this.hideCustomLoading();
    }
  },

  // 网格预设变化时更新 mosaicData 的行列数
  onGridInfoUpdate(e) {
    const { cols, rows } = e.detail;
    if (this.data.mosaicData) {
      this.setData({
        mosaicData: { ...this.data.mosaicData, cols, rows }
      });
    }
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
    if (this._checkExporting()) return;

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
    if (this._checkExporting()) return;

    const index = parseInt(e.detail.value) || 0;
    const newGridSize = this.data.gridOptions[index].value;

    // 直接更新参数
    this.setData({
      gridSize: newGridSize,
      gridOptionIndex: index,
      mosaicData: null,
      currentStep: 1,
      gridPresetIndex: 0,  // 重置为原图比例
      customGridSize: Math.min(50, Math.max(3, newGridSize))
    });
  },

  // 调整网格预设
  onGridPresetChange(e) {
    if (this._checkExporting()) return;
    const index = parseInt(e.detail.value) || 0;
    const preset = this.data.availableGridPresets[index];
    if (!preset) return;

    // 只更新 gridPresetIndex，不设置 mosaicData: null
    // mosaicCanvas 的 gridPreset observer 会自动处理裁剪并更新统计
    this.setData({ gridPresetIndex: index });
  },

  // 调整合并阈值
  onThresholdChange(e) {
    // 导出中禁止调整
    if (this._checkExporting()) return;

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

  // 切换是否使用特殊色
  onSpecialColorsChange() {
    // 导出中禁止调整
    if (this._checkExporting()) return;

    // 直接取反当前值
    const newVal = !this.data.useSpecialColors;
    this.setData({
      useSpecialColors: newVal
    });
  },

  // 去除边缘开关变化
  onRemoveEdgeChange() {
    // 导出中禁止调整
    if (this._checkExporting()) return;

    // 直接取反当前值
    this.setData({
      removeEdge: !this.data.removeEdge
    });
  },

  // 镜像翻转开关变化
  onMirrorChange() {
    // 导出中禁止调整
    if (this._checkExporting()) return;

    // 直接取反当前值
    this.setData({
      mirrorImage: !this.data.mirrorImage
    });
  },

  // 鲜艳度滑块变化
  onVibrantChange(e) {
    // 导出中禁止调整
    if (this._checkExporting()) return;

    // 计算滑块颜色：正数变红，负数变灰
    const vibrantScale = e.detail.value;
    const blockColor = this.calculateVibrantBlockColor(vibrantScale);
    this.setData({
      vibrantScale: vibrantScale,
      vibrantBlockColor: blockColor
    });
  },

  // 鲜艳度滑块拖动中（实时更新显示）
  onVibrantChanging(e) {
    const vibrantScale = e.detail.value;
    const blockColor = this.calculateVibrantBlockColor(vibrantScale);
    this.setData({
      vibrantScale: vibrantScale,
      vibrantBlockColor: blockColor
    });
  },

  // 浊色规避滑块变化（完成）：更新映射表强度 + 传给组件触发重渲染
  onAntiGrayChange(e) {
    if (this._checkExporting()) return;
    const sliderVal = e.detail.value;  // 0-100
    const intensity = sliderVal / 100;
    setAntiGrayIntensity(intensity);  // 更新 colorMapper 查找表强度
    this.setData({
      antiGrayIntensity: sliderVal
    });
  },

  // 浊色规避滑块拖动中（仅更新显示，不触发重渲染避免卡顿）
  onAntiGrayChanging(e) {
    const sliderVal = e.detail.value;
    this.setData({
      antiGrayIntensity: sliderVal
    });
  },

  // 切换聚类算法（老/新），用于对比效果
  toggleLegacyAggregation() {
    if (this._checkExporting()) return;
    this.setData({
      useLegacyAggregation: !this.data.useLegacyAggregation,
      mosaicData: null,
      currentStep: 1
    });
  },

  // 自定义网格大小勾选
  onCustomGridToggle(e) {
    if (this._checkExporting()) return;
    const checked = e.detail.value.length > 0;
    const canvas = this.selectComponent('#mosaic-canvas');
    if (checked) {
      // 勾选：同步 customGridSize 到当前实际网格尺寸
      const info = canvas && canvas.cachedGridInfo;
      const currentSize = info ? info.gridSize : this.data.customGridSize;
      this.setData({
        useCustomGridSize: true,
        customGridSize: currentSize,
        gridPresetIndex: 0
      });
    } else {
      // 取消勾选
      this.setData({
        useCustomGridSize: false,
        gridPresetIndex: 0
      });
    }
  },

  // 自定义网格大小滑块变化
  onCustomGridSizeChange(e) {
    if (this._checkExporting()) return;
    this.setData({
      customGridSize: e.detail.value,
      gridPresetIndex: 0  // 重置为原图比例
    });
  },

  // 计算滑块颜色：正数从绿变红，负数从绿变深灰，0为绿色
  calculateVibrantBlockColor(vibrantScale) {
    if (vibrantScale > 0) {
      // 正数：从绿色渐变到红色
      // #4CAF50 (76, 175, 80) -> #ef4444 (239, 68, 68)
      const ratio = vibrantScale / 10;
      const r = Math.round(76 + (239 - 76) * ratio);
      const g = Math.round(175 + (68 - 175) * ratio);
      const b = Math.round(80 + (68 - 80) * ratio);
      return `rgb(${r}, ${g}, ${b})`;
    } else if (vibrantScale < 0) {
      // 负数：从绿色渐变到深灰色
      // #4CAF50 (76, 175, 80) -> #4b5563 (75, 85, 99)
      const ratio = Math.abs(vibrantScale) / 10;
      const r = Math.round(76 + (75 - 76) * ratio);
      const g = Math.round(175 + (85 - 175) * ratio);
      const b = Math.round(80 + (99 - 80) * ratio);
      return `rgb(${r}, ${g}, ${b})`;
    }
    return '#4CAF50';
  },

  // 切换处理模式：卡通/马赛克
  toggleProcessMode() {
    // 导出中禁止调整
    if (this._checkExporting()) return;

    const newMode = this.data.processMode === 'cartoon' ? 'mosaic' : 'cartoon';
    // 重置所有设置项为默认值
    this._resetSettings();
    this.setData({
      processMode: newMode,
      mosaicData: null,
      currentStep: 1
    });
  },

  // 重置所有设置项为默认值
  _resetSettings() {
    // 计算默认鲜艳度滑块颜色
    const defaultBlockColor = this.calculateVibrantBlockColor(0);

    this.setData({
      // 豆豆数、色彩
      gridOptionIndex: 2,
      gridSize: 10,  // gridOptions[2].value = 10
      thresholdOptionIndex: 5,
      mergeThreshold: 30,  // thresholdOptions[5].value = 30 (甜区推荐)
      // 自定义网格（默认为当前豆豆数，限制在滑块范围内）
      useCustomGridSize: false,
      customGridSize: Math.min(50, Math.max(3, this.data.gridSize)),
      // 特殊设置
      useSpecialColors: false,
      removeEdge: true,
      mirrorImage: false,
      // 鲜艳度
      vibrantScale: 0,
      vibrantBlockColor: defaultBlockColor,
      // 浊色规避（默认关闭）
      antiGrayIntensity: 0,
      // 替换面板
      showReplacePanel: false,
      replaceFromCode: '',
      replaceToCode: '',
      replaceScope: 'all',
      // 撤销
      undoStack: [],
      canUndo: false,
      // 网格线检测状态
      hasGridLinesDetected: false,
      // 网格预设
      gridPresetIndex: 0,
      availableGridPresets: this.data.gridPresets.slice(),
      // 分块导出
      splitMode: '',
      splitModeText: '',
      showSplitPopup: false,
      exportProgress: 0
    });

    // 重置预览缩放和平移
    const canvas = this.selectComponent('#mosaic-canvas');
    if (canvas) {
      canvas.resetPreviewState();
    }
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

  // ========================
  //  分块导出弹窗
  // ========================
  toggleSplitPopup() {
    if (this.data.isExporting) return;
    this.setData({ showSplitPopup: !this.data.showSplitPopup });
  },

  hideSplitPopup() {
    this.setData({ showSplitPopup: false, splitMode: '', splitModeText: '' });
  },

  onSelectSplitMode(e) {
    const mode = e.currentTarget.dataset.mode;
    const textMap = { horizontal: '上下', vertical: '左右', grid2x2: '2×2', grid52: '52×52', grid104: '104×104' };
    this.setData({ splitMode: mode, splitModeText: textMap[mode] || '', showSplitPopup: false });
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

    if (!exportData || !exportData.gridInfo) {
      wx.showToast({ title: '请先生成拼豆图纸', icon: 'none' });
      this.setData({ isExporting: false });
      return;
    }

    const { cols, rows, gridSize } = exportData.gridInfo;
    const gridData = exportData.gridData;
    const segments = exportData.segments;

    // 智能模式或普通模式都需要有数据
    if (!gridData && !segments) {
      wx.showToast({ title: '请先生成拼豆图纸', icon: 'none' });
      this.setData({ isExporting: false });
      return;
    }

    // 如果设置了分块导出模式，走分块导出流程
    if (this.data.splitMode) {
      this.exportSplitPNG(gridData, cols, rows, gridSize, exportData);
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

    // 动态计算放大倍数，限制最大导出尺寸在 4096 像素内（微信 Canvas 缓冲区限制）
    const maxExportDimension = 4096;
    const baseWidth = cols * gridSize + 40; // 加上左侧标尺
    const baseHeight = rows * gridSize + 30 + statsHeight; // 加上顶部标尺和统计行

    // 计算合适的放大倍数，确保最长边不超过 4096，且最小为 1 倍
    const scaleX = maxExportDimension / baseWidth;
    const scaleY = maxExportDimension / baseHeight;
    const exportScale = Math.max(1, Math.min(scaleX, scaleY));

    let exportGridSize = gridSize * exportScale;

    // 计算尺寸
    let mosaicWidth = cols * exportGridSize;
    let mosaicHeight = rows * exportGridSize;

    // 标尺区域尺寸
    const titleHeight = 180; // 顶部标题高度
    const rulerWidth = 50;   // 左/右侧标尺宽度
    const rulerHeight = 40;  // 上/下方标尺高度

    // 包含标尺的画布尺寸（标题 + 左右标尺 + 上下标尺）
    let canvasWidth = mosaicWidth + rulerWidth * 2;
    let canvasHeight = titleHeight + rulerHeight * 2 + mosaicHeight + statsHeight;

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

        // 0.1 绘制顶部标题栏
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(0, 0, canvasWidth, titleHeight);
        const titleFontSize = 120;
        ctx.font = `bold ${titleFontSize}px "KaiTi", "STKaiti", "楷体", "PingFang SC", cursive, sans-serif`;
        ctx.fillStyle = '#ff7eb3';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`🐱 微信小程序：拼豆酥（${rows}行×${cols}列）`, rulerWidth + 12, titleHeight / 2);

        // 1. 绘制顶部列标尺 - 每个色块显示列号
        const topRulerY = titleHeight;
        ctx.fillStyle = '#d0d0d0';
        ctx.fillRect(rulerWidth, topRulerY, mosaicWidth, rulerHeight);
        ctx.strokeStyle = '#999999';
        ctx.lineWidth = 1;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 动态计算字体大小，确保能显示下所有列号
        const colFontSize = Math.max(7, Math.min(12, mosaicWidth / cols * 0.7));
        ctx.font = `${colFontSize}px sans-serif`;

        for (let col = 1; col <= cols; col++) {
        const x = rulerWidth + (col - 0.5) * gridSize * exportScale;
        // 刻度线
        ctx.beginPath();
        ctx.moveTo(rulerWidth + (col - 1) * gridSize * exportScale, topRulerY + rulerHeight - 8);
        ctx.lineTo(rulerWidth + (col - 1) * gridSize * exportScale, topRulerY + rulerHeight);
        ctx.stroke();
        // 列号（从1开始）
        ctx.fillStyle = '#333333';
        ctx.fillText(col.toString(), x, topRulerY + rulerHeight / 2);
        }

        // 2. 绘制左侧行标尺 - 每个色块显示行号
        const leftRulerX = 0;
        ctx.fillStyle = '#d0d0d0';
        ctx.fillRect(leftRulerX, topRulerY + rulerHeight, rulerWidth, mosaicHeight);
        // 标尺分隔线
        ctx.beginPath();
        ctx.moveTo(rulerWidth, topRulerY);
        ctx.lineTo(rulerWidth, topRulerY + rulerHeight + mosaicHeight + rulerHeight);
        ctx.stroke();

        // 动态计算字体大小
        const rowFontSize = Math.max(7, Math.min(12, mosaicHeight / rows * 0.7));
        ctx.font = `${rowFontSize}px sans-serif`;

        for (let row = 1; row <= rows; row++) {
        const y = topRulerY + rulerHeight + (row - 0.5) * gridSize * exportScale;
        // 刻度线
        ctx.beginPath();
        ctx.moveTo(rulerWidth - 8, topRulerY + rulerHeight + (row - 1) * gridSize * exportScale);
        ctx.lineTo(rulerWidth, topRulerY + rulerHeight + (row - 1) * gridSize * exportScale);
        ctx.stroke();
        // 行号（从1开始）
        ctx.fillStyle = '#333333';
        ctx.textAlign = 'right';
        ctx.fillText(row.toString(), rulerWidth - 8, y);
        }

        // 2.1 绘制右侧行标尺
        const rightRulerX = rulerWidth + mosaicWidth;
        ctx.fillStyle = '#d0d0d0';
        ctx.fillRect(rightRulerX, topRulerY + rulerHeight, rulerWidth, mosaicHeight);
        ctx.font = `${rowFontSize}px sans-serif`;
        ctx.textAlign = 'left';

        for (let row = 1; row <= rows; row++) {
        const y = topRulerY + rulerHeight + (row - 0.5) * gridSize * exportScale;
        // 刻度线
        ctx.beginPath();
        ctx.moveTo(rightRulerX, topRulerY + rulerHeight + (row - 1) * gridSize * exportScale);
        ctx.lineTo(rightRulerX + 8, topRulerY + rulerHeight + (row - 1) * gridSize * exportScale);
        ctx.stroke();
        // 行号
        ctx.fillStyle = '#333333';
        ctx.fillText(row.toString(), rightRulerX + 8, y);
        }

        // 2.2 绘制下方列标尺
        const bottomRulerY = topRulerY + rulerHeight + mosaicHeight;
        ctx.fillStyle = '#d0d0d0';
        ctx.fillRect(rulerWidth, bottomRulerY, mosaicWidth, rulerHeight);
        // 分隔线
        ctx.beginPath();
        ctx.moveTo(rulerWidth, bottomRulerY);
        ctx.lineTo(canvasWidth - rulerWidth, bottomRulerY);
        ctx.stroke();

        ctx.font = `${colFontSize}px sans-serif`;
        ctx.textAlign = 'center';

        for (let col = 1; col <= cols; col++) {
        const x = rulerWidth + (col - 0.5) * gridSize * exportScale;
        // 刻度线
        ctx.beginPath();
        ctx.moveTo(rulerWidth + (col - 1) * gridSize * exportScale, bottomRulerY);
        ctx.lineTo(rulerWidth + (col - 1) * gridSize * exportScale, bottomRulerY + 8);
        ctx.stroke();
        // 列号
        ctx.fillStyle = '#333333';
        ctx.fillText(col.toString(), x, bottomRulerY + rulerHeight / 2);
        }

        // 3. 绘制马赛克主体（使用放大后的格子）
        // 偏移位置：加上标尺的宽度和高度
        const offsetX = rulerWidth;
        const offsetY = titleHeight + rulerHeight;

        if (isMosaicMode && gridData) {
        // 马赛克模式：基于 gridData 二维数组绘制固定大小色块
        // 根据 removeEdge 设置决定是否跳过边缘单元格
        const shouldRemoveEdge = that.data.removeEdge !== false;  // 默认去除边缘
        const shouldMirror = that.data.mirrorImage;  // 是否镜像
        // 固定格子大小，天然紧密排列无间隙
        const cellWidth = gridSize * exportScale;
        const cellHeight = gridSize * exportScale;
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const cell = gridData[row] && gridData[row][col];
            // 跳过无效格子或边缘底色格子（空白格子也要渲染）
            if (!cell || (shouldRemoveEdge && cell.isEdge)) continue;

            let x = offsetX + col * cellWidth;
            const y = offsetY + row * cellHeight;

            // 应用镜像变换
            if (shouldMirror) {
              x = offsetX + mosaicWidth - (col + 1) * cellWidth;
            }

            // 空白格子使用浅灰色
            if (cell.isEmpty) {
              ctx.fillStyle = '#F0F0F0';
            } else {
              ctx.fillStyle = cell.markHex || '#cccccc';
            }
            ctx.fillRect(x, y, cellWidth, cellHeight);

            // 绘制色块边框
            ctx.strokeStyle = cell.isEmpty ? 'rgba(0, 0, 0, 0.05)' : 'rgba(0, 0, 0, 0.1)';
            ctx.lineWidth = 1;
            ctx.strokeRect(Math.floor(x) + 0.5, Math.floor(y) + 0.5, Math.ceil(cellWidth) - 1, Math.ceil(cellHeight) - 1);

            // 绘制色号（空白格子不绘制）
            if (!cell.isEmpty && cellWidth >= 4 && cellHeight >= 4) {
              const isLight = isLightColor(cell.markHex);
              ctx.fillStyle = isLight ? '#333' : '#fff';
              const fontSize = Math.max(4, Math.min(cellWidth, cellHeight) * 0.35);
              ctx.font = `bold ${fontSize.toFixed(0)}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(formatMarkCode(cell.markCode), x + cellWidth / 2, y + cellHeight / 2);
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
          // 根据 removeEdge 设置决定是否跳过边缘色段
          const shouldRemoveEdge = that.data.removeEdge !== false;  // 默认去除边缘
          const shouldMirror = that.data.mirrorImage;  // 是否镜像
          if (shouldRemoveEdge && segment.isEdge) continue;

          let x = offsetX + segment.x * segScaleX;
          const y = offsetY + segment.y * segScaleY;
          const width = segment.width * segScaleX;
          const height = segment.height * segScaleY;

          // 应用镜像变换
          if (shouldMirror) {
            x = offsetX + mosaicWidth - segment.width * segScaleX - x + offsetX;
          }

          // 绘制色段（取整消除间隙）
          ctx.fillStyle = segment.markHex || '#cccccc';
          ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(width), Math.ceil(height));

          // 绘制色块边框
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
          ctx.lineWidth = 1;
          ctx.strokeRect(Math.floor(x) + 0.5, Math.floor(y) + 0.5, Math.ceil(width) - 1, Math.ceil(height) - 1);

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
        // 根据 removeEdge 设置决定是否跳过边缘单元格
        const shouldRemoveEdge = that.data.removeEdge !== false;  // 默认去除边缘
        const shouldMirror = that.data.mirrorImage;  // 是否镜像
        const cellWidth = gridSize * exportScale;
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const cell = gridData[row] && gridData[row][col];
            // 跳过无效格子、区域成员格子或边缘底色格子（根据 removeEdge 设置）
            if (!cell || !cell.markCode || cell.isRegionMember || (shouldRemoveEdge && cell.isEdge)) continue;

            // 使用格子的实际宽高（合并后），并进行缩放
            const width = (cell.width || gridSize) * exportScale;
            const height = (cell.height || gridSize) * exportScale;

            let x = offsetX + col * cellWidth;
            const y = offsetY + row * gridSize * exportScale;

            // 应用镜像变换
            if (shouldMirror) {
              x = offsetX + mosaicWidth - (col + 1) * cellWidth;
            }

            // 绘制色块
            ctx.fillStyle = cell.markHex;
            ctx.fillRect(x, y, width, height);

            // 绘制色块边框
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
            ctx.lineWidth = 1;
            ctx.strokeRect(Math.floor(x) + 0.5, Math.floor(y) + 0.5, Math.ceil(width) - 1, Math.ceil(height) - 1);

            // 绘制色号（根据实际的格子大小调整字号，降低阈值到 4 像素）
            if (width >= 4 && height >= 4) {
              // 根据色块颜色自动选择文字颜色
              const isLight = isLightColor(cell.markHex);
              ctx.fillStyle = isLight ? '#333' : '#fff';
              // 使用实际的 cellWidth 来计算字号，确保文字适应格子大小
              const fontSize = Math.max(4, Math.min(width, height) * 0.35);
              ctx.font = `bold ${fontSize.toFixed(0)}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(formatMarkCode(cell.markCode), x + width / 2, y + height / 2);
            }
          }
        }
        }

        // 绘制参考线（每10行/列一条浅蓝色线）
        this.drawExportGuideLines(ctx, offsetX, offsetY, cols, rows, gridSize * exportScale);

        // 2. 绘制统计行（底部）- 玻璃拟态圆角按钮样式
        // 统计行位置（标题 + 上标尺 + 马赛克 + 下标尺）
        const statsY = titleHeight + rulerHeight + mosaicHeight + rulerHeight + 10;
        ctx.fillStyle = '#f8f9fa';
        // 统计行背景
        ctx.fillRect(0, titleHeight + rulerHeight + mosaicHeight + rulerHeight, canvasWidth, statsHeight);

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
        ctx.fillStyle = isLight ? '#333' : '#fff';
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
            fail: (err) => {
              console.error('[exportPNG] canvasToTempFilePath 失败:', err?.errMsg || err);
              wx.showToast({ title: '导出失败，请重试', icon: 'none' });
              that.setData({ isExporting: false });
            }
          };

          // 优先使用 canvas 对象
          if (typeof canvas === 'object' && canvas !== null) {
            exportOptions.canvas = canvas;
          } else if (that.data.canvasId) {
            exportOptions.canvasId = that.data.canvasId;
          }

          // 导出 canvas 尺寸日志

          try {
            wx.canvasToTempFilePath(exportOptions, that);
          } catch (e) {
            console.error('[exportPNG] canvasToTempFilePath 异常:', e?.errMsg || e);
            wx.showToast({ title: '导出失败，请重试', icon: 'none' });
            that.setData({ isExporting: false });
          }
        }, 3000); // 3秒等待
      });
  },

  // ========================
  //  分块导出
  // ========================
  exportSplitPNG(fullGridData, totalCols, totalRows, gridSize, exportData) {
    const that = this;
    const splitMode = this.data.splitMode;
    const { isLightColor, formatMarkCode } = require('../../utils/colorHelpers');

    // 获取 canvas 节点（只获取一次，避免重复查询导致的节点失效）
    const query = wx.createSelectorQuery();
    query.select('#export-canvas')
      .fields({ node: true, size: true })
      .exec((canvasRes) => {
        if (!canvasRes[0] || !canvasRes[0].node) {
          that.setData({ isExporting: false });
          wx.showToast({ title: '导出组件异常', icon: 'none' });
          return;
        }
        const canvas = canvasRes[0].node;
        const ctx = canvas.getContext('2d');

        const midRow = Math.floor(totalRows / 2);
        const midCol = Math.floor(totalCols / 2);
        const parts = [];
        const partNames = {
          horizontal: ['上半', '下半'],
          vertical: ['左侧', '右侧'],
          grid2x2: ['左上', '右上', '左下', '右下'],
          grid52: [],
          grid104: []
        };

        const extractPart = (startRow, endRow, startCol, endCol, blockSize) => {
          const actualEndRow = Math.min(endRow, totalRows);
          const actualEndCol = Math.min(endCol, totalCols);
          const partGrid = [];

          for (let r = startRow; r < startRow + (blockSize || (endRow - startRow)); r++) {
            const row = [];
            for (let c = startCol; c < startCol + (blockSize || (endCol - startCol)); c++) {
              const cell = (r < totalRows && c < totalCols) ? (fullGridData[r] && fullGridData[r][c]) : null;
              row.push(cell ? { ...cell } : null);
            }
            partGrid.push(row);
          }
          return { gridData: partGrid, rows: blockSize || (endRow - startRow), cols: blockSize || (endCol - startCol) };
        };

        if (splitMode === 'horizontal') {
          parts.push(extractPart(0, midRow, 0, totalCols));
          parts.push(extractPart(midRow, totalRows, 0, totalCols));
        } else if (splitMode === 'vertical') {
          parts.push(extractPart(0, totalRows, 0, midCol));
          parts.push(extractPart(0, totalRows, midCol, totalCols));
        } else if (splitMode === 'grid2x2') {
          parts.push(extractPart(0, midRow, 0, midCol));
          parts.push(extractPart(0, midRow, midCol, totalCols));
          parts.push(extractPart(midRow, totalRows, 0, midCol));
          parts.push(extractPart(midRow, totalRows, midCol, totalCols));
        } else if (splitMode === 'grid52' || splitMode === 'grid104') {
          // 52×52 或 104×104 分块，从左上角开始，向右向下切割
          const blockSize = splitMode === 'grid52' ? 52 : 104;
          let index = 0;
          for (let r = 0; r < totalRows; r += blockSize) {
            for (let c = 0; c < totalCols; c += blockSize) {
              parts.push(extractPart(r, r + blockSize, c, c + blockSize, blockSize));
              index++;
            }
          }
          // 生成分块名称
          for (let i = 0; i < parts.length; i++) {
            partNames[splitMode].push((i + 1) + '/' + parts.length);
          }
        }

        const names = partNames[splitMode];
        const totalParts = parts.length;
        let currentIndex = 0;
        let failCount = 0;
        const shouldRemoveEdge = that.data.removeEdge !== false;

        // 渲染一张分块到 canvas
        const renderPart = (part, partName) => {
          const { gridData: partGridData, rows, cols } = part;

          // 统计
          const statsList = [];
          const colorMap = {};
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const cell = partGridData[r] && partGridData[r][c];
              if (!cell || !cell.markCode) continue;
              if (shouldRemoveEdge && cell.isEdge) continue;
              const code = formatMarkCode(cell.markCode);
              if (!colorMap[code]) {
                colorMap[code] = { code, originalCode: cell.markCode, hex: cell.markHex || '#000', count: 0 };
              }
              colorMap[code].count++;
            }
          }
          Object.values(colorMap).sort((a, b) => b.count - a.count).forEach(item => statsList.push(item));

          // 布局
          const titleHeight = 180;
          const rulerWidth = 50;
          const rulerHeight = 40;
          const itemsPerRow = 10;
          const statsItemHeight = 50;
          const statsRowCount = Math.ceil(statsList.length / itemsPerRow);
          const statsH = statsItemHeight * statsRowCount + 20;

          const maxExportDimension = 4096;
          const baseW = cols * gridSize + rulerWidth * 2;
          const baseH = rows * gridSize + rulerHeight * 2 + titleHeight + statsH;
          const scX = maxExportDimension / baseW;
          const scY = maxExportDimension / baseH;
          const exportScale = Math.max(1, Math.min(scX, scY));
          const cellW = gridSize * exportScale;
          const mosaicW = cols * cellW;
          const mosaicH = rows * cellW;
          const canvasW = mosaicW + rulerWidth * 2;
          const canvasH = titleHeight + rulerHeight * 2 + mosaicH + statsH;

          canvas.width = canvasW;
          canvas.height = canvasH;

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvasW, canvasH);

          // 标题
          ctx.fillStyle = '#f5f5f5';
          ctx.fillRect(0, 0, canvasW, titleHeight);
          ctx.font = 'bold 80px "KaiTi", "STKaiti", "楷体", "PingFang SC", cursive, sans-serif';
          ctx.fillStyle = '#ff7eb3';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText('🐱 微信小程序：拼豆酥（' + partName + '）' + rows + '行×' + cols + '列', rulerWidth + 12, titleHeight / 2);

          const offX = rulerWidth;
          const offY = titleHeight + rulerHeight;

          // 列标尺
          const topRulerY = titleHeight;
          ctx.fillStyle = '#d0d0d0';
          ctx.fillRect(rulerWidth, topRulerY, mosaicW, rulerHeight);
          ctx.strokeStyle = '#999';
          ctx.lineWidth = 1;
          const cfs = Math.max(7, Math.min(12, mosaicW / cols * 0.7));
          ctx.font = cfs + 'px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          for (let col = 1; col <= cols; col++) {
            const x = rulerWidth + (col - 0.5) * cellW;
            ctx.beginPath();
            ctx.moveTo(rulerWidth + (col - 1) * cellW, topRulerY + rulerHeight - 8);
            ctx.lineTo(rulerWidth + (col - 1) * cellW, topRulerY + rulerHeight);
            ctx.stroke();
            ctx.fillStyle = '#333';
            ctx.fillText(col.toString(), x, topRulerY + rulerHeight / 2);
          }

          // 行标尺
          const rfs = Math.max(7, Math.min(12, mosaicH / rows * 0.7));
          ctx.fillStyle = '#d0d0d0';
          ctx.fillRect(0, topRulerY + rulerHeight, rulerWidth, mosaicH);
          ctx.font = rfs + 'px sans-serif';
          for (let row = 1; row <= rows; row++) {
            const y = topRulerY + rulerHeight + (row - 0.5) * cellW;
            ctx.beginPath();
            ctx.moveTo(rulerWidth - 8, topRulerY + rulerHeight + (row - 1) * cellW);
            ctx.lineTo(rulerWidth, topRulerY + rulerHeight + (row - 1) * cellW);
            ctx.stroke();
            ctx.fillStyle = '#333';
            ctx.textAlign = 'right';
            ctx.fillText(row.toString(), rulerWidth - 8, y);
          }

          // 马赛克
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const cell = partGridData[r] && partGridData[r][c];
              if (!cell || (shouldRemoveEdge && cell.isEdge)) continue;
              const x = offX + c * cellW;
              const y = offY + r * cellW;
              ctx.fillStyle = cell.isEmpty ? '#F0F0F0' : (cell.markHex || '#cccccc');
              ctx.fillRect(x, y, cellW, cellW);
              ctx.strokeStyle = cell.isEmpty ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.1)';
              ctx.lineWidth = 1;
              ctx.strokeRect(Math.floor(x) + 0.5, Math.floor(y) + 0.5, Math.ceil(cellW) - 1, Math.ceil(cellW) - 1);
              if (!cell.isEmpty && cellW >= 4) {
                const isLt = isLightColor(cell.markHex);
                ctx.fillStyle = isLt ? '#333' : '#fff';
                const fontSize = Math.max(4, cellW * 0.35);
                ctx.font = 'bold ' + fontSize.toFixed(0) + 'px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(formatMarkCode(cell.markCode), x + cellW / 2, y + cellW / 2);
              }
            }
          }

          // 参考线
          that.drawExportGuideLines(ctx, offX, offY, cols, rows, cellW);

          // 统计行
          const statsY = titleHeight + rulerHeight + mosaicH + rulerHeight + 10;
          ctx.fillStyle = '#f8f9fa';
          ctx.fillRect(0, titleHeight + rulerHeight + mosaicH + rulerHeight, canvasW, statsH);

          for (let i = 0; i < statsList.length; i++) {
            const item = statsList[i];
            const sr = Math.floor(i / itemsPerRow);
            const sc = i % itemsPerRow;
            const itemWidth = mosaicW / itemsPerRow;
            const sx = rulerWidth + sc * itemWidth + 8;
            const sy = statsY + sr * statsItemHeight;
            const btnW = itemWidth - 16;
            const btnH = statsItemHeight - 5;

            let displayCode = item.code;
            if (displayCode.length >= 2 && displayCode[1] === '0') {
              displayCode = displayCode.charAt(0) + displayCode.substring(2);
            }
            const isLt = isLightColor(item.hex);

            ctx.fillStyle = item.hex;
            that.drawRoundedRect(ctx, sx, sy, btnW, btnH, 15);
            ctx.save();
            that.drawRoundedRect(ctx, sx, sy, btnW, btnH, 15);
            ctx.clip();
            const grad = ctx.createLinearGradient(sx, sy, sx, sy + btnH * 0.4);
            grad.addColorStop(0, 'rgba(255,255,255,0.4)');
            grad.addColorStop(1, 'rgba(255,255,255,0.1)');
            ctx.fillStyle = grad;
            ctx.fillRect(sx, sy, btnW, btnH * 0.4);
            ctx.restore();

            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 1;
            that.drawRoundedRect(ctx, sx, sy, btnW, btnH, 15);

            ctx.fillStyle = isLt ? '#333' : '#fff';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(displayCode + ' (' + item.count + ')', sx + btnW / 2, sy + btnH / 2);
          }

          // 水印
          that.drawWatermark(ctx, canvasW, canvasH);
        };

        const exportNext = () => {
          if (currentIndex >= totalParts) {
            that.setData({ isExporting: false });
            if (failCount > 0) {
              that.showSuccessToast(failCount + '张导出失败，请重试', 2500);
            } else {
              that.showSuccessToast('分块导出完成', 2000);
            }
            return;
          }

          const part = parts[currentIndex];
          const partName = names[currentIndex];
          const progress = Math.round(((currentIndex + 1) / totalParts) * 100);
          that.showCustomLoading('导出中 ' + (currentIndex + 1) + '/' + totalParts, progress);

          // 渲染到 canvas
          renderPart(part, partName);

          // 等待渲染完成后导出
          setTimeout(() => {
            wx.canvasToTempFilePath({
              canvas: canvas,
              success: (res) => {
                that.doSaveImage(res.tempFilePath, true);
                currentIndex++;
                if (currentIndex < totalParts) {
                  const nextProgress = Math.round((currentIndex / totalParts) * 100);
                  that.showCustomLoading('保存中...', nextProgress);
                } else {
                  that.hideCustomLoading();
                }
                setTimeout(() => exportNext(), 1000);
              },
              fail: (err) => {
                console.error('[exportSplitPNG] 第' + (currentIndex + 1) + '张失败:', err?.errMsg || err);
                failCount++;
                currentIndex++;
                setTimeout(() => exportNext(), 500);
              }
            }, that);
          }, 3000);
        };

        exportNext();
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
  doSaveImage(tempFilePath, skipExportFlag) {
    const that = this;
    wx.saveImageToPhotosAlbum({
      filePath: tempFilePath,
      success() {
        that.showSuccessToast('保存成功', 1500);
        if (!skipExportFlag) {
          that.setData({ isExporting: false });
        }
      },
      fail(err) {
        console.error('[exportPNG] saveImageToPhotosAlbum 失败:', err?.errMsg || err);

        // 如果是权限问题（auth deny），引导去设置
        if (err.errMsg && (err.errMsg.includes('auth deny') || err.errMsg.includes('fail auth deny'))) {
        that.showAuthDeniedModal(tempFilePath);
        } else {
        wx.showToast({ title: '保存失败: ' + (err.errMsg || ''), icon: 'none', duration: 2000 });
        if (!skipExportFlag) {
          that.setData({ isExporting: false });
        }
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

        // 绘制（基于二维数组固定格子大小）
        // 根据 removeEdge 设置决定是否跳过边缘单元格
        const shouldRemoveEdge = that.data.removeEdge !== false;  // 默认去除边缘
        const cellSizeX = width / cols;
        const cellSizeY = height / rows;
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const cell = gridData[row] && gridData[row][col];
            // 跳过无效格子、边缘底色格子（根据 removeEdge 设置）
            if (cell && cell.markCode && (!shouldRemoveEdge || !cell.isEdge)) {
              ctx.fillStyle = cell.markHex;
              ctx.fillRect(col * cellSizeX, row * cellSizeY, cellSizeX, cellSizeY);
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
            fail: (err) => {
              console.error('[exportPNG] exportPNGLegacy canvasToTempFilePath 失败:', err?.errMsg || err);
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
          
          // 绘制马赛克（基于二维数组固定格子大小）
          // 根据 removeEdge 设置决定是否跳过边缘单元格
          const shouldRemoveEdge = that.data.removeEdge !== false;  // 默认去除边缘
          const cellSizeX = width / cols;
          const cellSizeY = height / rows;
          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
              const cell = gridData[row] && gridData[row][col];
              if (cell && cell.markCode && !cell.isRegionMember && (!shouldRemoveEdge || !cell.isEdge)) {
                ctx.fillStyle = cell.markHex;
                ctx.fillRect(col * cellSizeX, row * cellSizeY, cellSizeX, cellSizeY);
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
              console.error('[exportPNG] exportWithCanvasId canvasToTempFilePath 失败:', err?.errMsg || err, `重试 ${retryCount}/${maxRetries}`);

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
