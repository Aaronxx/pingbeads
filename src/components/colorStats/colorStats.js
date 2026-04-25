// components/colorStats/colorStats.js

const { isLightColor } = require('../../utils/colorHelpers');
Component({
  properties: {
    flatCells: {
      type: Object,
      value: null
    },
    highlightCode: {
      type: String,
      value: ''
    }
  },

  data: {
    stats: null
  },

  observers: {
    flatCells(newData) {
      if (newData && newData.sortedByCount) {
        const processed = newData.sortedByCount.map(item => {
          let displayCode = item.code;
          if (displayCode.length >= 2 && displayCode[1] === '0') {
            displayCode = displayCode.charAt(0) + displayCode.substring(2);
          }
          return {
            ...item,
            displayCode: `${displayCode} (${item.count})`,
            isLight: isLightColor(item.hex)
          };
        });

        this.setData({
          stats: {
            colorCount: newData.colorCount,
            totalCount: newData.totalCount,
            sortedByCount: processed,
            sortedByCode: newData.sortedByCode || processed
          }
        });
      } else {
        this.setData({ stats: null });
      }
    }
  },

  methods: {

    handleCodeTap(e) {
      const { code } = e.currentTarget.dataset;
      if (code === this.data.highlightCode) {
        this.triggerEvent('codeClick', { code: null, hex: null });
        return;
      }

      const item = this.data.stats.sortedByCount.find(i => i.code === code);
      this.triggerEvent('codeClick', { code, hex: item ? item.hex : null });
    }
  }
});
