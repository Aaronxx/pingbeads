// components/colorStats/colorStats.js

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
            isLight: this.isLightColor(item.hex)
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
    isLightColor(hex) {
      if (!hex) return false;
      hex = hex.replace('#', '');
      let r;
      let g;
      let b;
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
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      return brightness > 150;
    },

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
