// components/colorStats/colorStats.js
const { calculateStats } = require('../../utils/statsCalculator');

Component({
  properties: {
    // 马赛克数据
    mosaicData: {
      type: Object,
      value: null
    },
    // 当前高亮的色号
    highlightCode: {
      type: String,
      value: null
    }
  },

  data: {
    // 统计数据
    stats: null,
    // 排序方式: 'count'(数量) | 'code'(色号)
    sortBy: 'count'
  },

  observers: {
    'mosaicData': function(newData) {
      console.log('[ColorStats] 收到 mosaicData:', newData ? '有数据' : '无数据');
      if (newData) {
        console.log('[ColorStats] mosaicData.gridData 存在:', !!newData.gridData);
        console.log('[ColorStats] gridData 行数:', newData.gridData ? newData.gridData.length : 0);
        if (newData.gridData && newData.gridData.length > 0 && newData.gridData[0]) {
          console.log('[ColorStats] gridData[0] 列数:', newData.gridData[0].length);
          const firstCell = newData.gridData[0][0];
          console.log('[ColorStats] 第一个格子:', firstCell);
          console.log('[ColorStats] markCode:', firstCell ? firstCell.markCode : 'undefined');
          console.log('[ColorStats] markHex:', firstCell ? firstCell.markHex : 'undefined');
        }
        wx.showToast({ title: 'ColorStats收到数据', icon: 'none' });
        this.calculateStats(newData);
      } else {
        this.setData({ stats: null });
      }
    }
  },

  methods: {
    // 计算统计数据
    calculateStats(mosaicData) {
      console.log('[ColorStats] 开始计算统计');
      const stats = calculateStats(mosaicData);
      console.log('[ColorStats] 统计结果:', stats);
      this.setData({ stats });
    },

    // 切换排序方式
    toggleSort() {
      const newSort = this.data.sortBy === 'count' ? 'code' : 'count';
      this.setData({ sortBy: newSort });
    },

    // 点击色号
    handleCodeTap(e) {
      const { code, hex } = e.currentTarget.dataset;

      // 如果点击当前高亮的色号，则取消高亮
      if (code === this.data.highlightCode) {
        this.triggerEvent('codeClick', { code: null, hex: null });
      } else {
        this.triggerEvent('codeClick', { code, hex });
      }
    }
  }
});
