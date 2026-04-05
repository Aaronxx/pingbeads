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
    // 导出菜单显示状态
    showExportMenu: false,
    // 预览质量: 1=低(快速), 2=中, 3=高(精细)
    previewQuality: 2
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

  // 显示导出菜单
  onShowExportMenu() {
    if (!this.data.mosaicData) {
      wx.showToast({
        title: '请先处理图片',
        icon: 'none'
      });
      return;
    }
    this.setData({ showExportMenu: true });
  },

  // 隐藏导出菜单
  onHideExportMenu() {
    this.setData({ showExportMenu: false });
  },

  // 导出 PNG
  exportPNG() {
    this.setData({ showExportMenu: false });

    // 选择组件内的 canvas
    const query = wx.createSelectorQuery();
    query.select('#mosaic-canvas')
      .fields({ node: true, size: true, id: true })
      .exec((res) => {
        if (res[0] && res[0].node) {
          const canvasNode = res[0].node;
          const width = res[0].width;
          const height = res[0].height;

          wx.canvasToTempFilePath({
            canvas: canvasNode,
            width: width,
            height: height,
            destWidth: width,
            destHeight: height,
            success: (res) => {
              wx.saveImageToPhotosAlbum({
                filePath: res.tempFilePath,
                success: () => {
                  wx.showToast({
                    title: '保存成功',
                    icon: 'success'
                  });
                },
                fail: (err) => {
                  console.error('保存失败:', err);
                  wx.showToast({
                    title: '保存失败',
                    icon: 'none'
                  });
                }
              });
            },
            fail: (err) => {
              console.error('导出失败:', err);
              wx.showToast({
                title: '导出失败',
                icon: 'none'
              });
            }
          });
        } else {
          wx.showToast({
            title: '请先生成马赛克',
            icon: 'none'
          });
        }
      });
  },

  // 导出清单 CSV
  exportCSV() {
    this.setData({ showExportMenu: false });

    if (!this.data.mosaicData) {
      wx.showToast({
        title: '暂无数据',
        icon: 'none'
      });
      return;
    }

    const { calculateStats } = require('../../utils/statsCalculator');
    const stats = calculateStats(this.data.mosaicData);

    // 生成 CSV 内容
    const csv = [
      '色号,颜色,数量',
      ...stats.sortedByCount.map(item =>
        `${item.code},${item.hex},${item.count}`
      ),
      `,,总计: ${stats.totalCount}`
    ].join('\n');

    // 创建临时文件
    const fs = wx.getFileSystemManager();
    const filePath = `${wx.env.USER_DATA_PATH}/mark_colors.csv`;

    fs.writeFile({
      filePath: filePath,
      data: csv,
      encoding: 'utf8',
      success: () => {
        wx.openDocument({
          filePath: filePath,
          success: () => {
            wx.showToast({
              title: '打开成功',
              icon: 'success'
            });
          },
          fail: () => {
            // 如果无法打开，尝试分享
            wx.shareAppMessage({
              title: 'Mark 颜色清单',
              path: filePath
            });
          }
        });
      },
      fail: (err) => {
        console.error('写入文件失败:', err);
        wx.showToast({
          title: '导出失败',
          icon: 'none'
        });
      }
    });
  },

  // 复制清单到剪贴板
  copyToClipboard() {
    this.setData({ showExportMenu: false });

    if (!this.data.mosaicData) {
      wx.showToast({
        title: '暂无数据',
        icon: 'none'
      });
      return;
    }

    const { calculateStats } = require('../../utils/statsCalculator');
    const stats = calculateStats(this.data.mosaicData);

    // 生成文本清单
    let text = 'Mark 颜色清单\n';
    text += '==============\n\n';

    stats.sortedByCount.forEach(item => {
      text += `${item.code} (${item.hex}): ${item.count} 颗\n`;
    });

    text += `\n总计: ${stats.totalCount} 颗`;

    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({
          title: '已复制',
          icon: 'success'
        });
      }
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
