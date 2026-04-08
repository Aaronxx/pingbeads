// components/colorStats/colorStats.js

Component({
  properties: {
    // 预计算的统计结果
    flatCells: {
      type: Object,
      value: null
    },
    // 当前高亮的色号
    highlightCode: {
      type: String,
      value: ''
    }
  },

  data: {
    // 统计数据
    stats: null
  },

  observers: {
    'flatCells': function(newData) {
      if (newData && newData.sortedByCount) {
        // 预处理：格式化色号和判断是否为浅色
        const processed = newData.sortedByCount.map(item => {
          let displayCode = item.code;
          // 去掉第二个字符（如果第一个字符是字母，第二个是0）
          // 比如 H09 -> H9, P01 -> P1, F020 -> F20
          if (displayCode.length >= 2 && displayCode[1] === '0') {
            displayCode = displayCode.charAt(0) + displayCode.substring(2);
          }
          return {
            ...item,
            displayCode: displayCode + ' (' + item.count + ')',
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
    // 判断颜色是否为浅色（需要深色文字）
    isLightColor(hex) {
      if (!hex) return false;
      hex = hex.replace('#', '');
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
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      return brightness > 150;
    },

    // 点击色号
    handleCodeTap(e) {
      const { code } = e.currentTarget.dataset;
      if (code === this.data.highlightCode) {
        this.triggerEvent('codeClick', { code: null, hex: null });
      } else {
        // 找到对应的 hex
        const item = this.data.stats.sortedByCount.find(i => i.code === code);
        this.triggerEvent('codeClick', { code, hex: item ? item.hex : null });
      }
    }
  }
});