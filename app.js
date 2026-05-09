// app.js
App({
  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        // 请替换为你的云开发环境 ID（微信开发者工具 → 云开发 → 环境 ID）
        env: 'cloud1-1gbilk1s4181c24e'
      });
    }
    console.log('拼豆马赛克小程序启动');
  },

  globalData: {
    // 全局数据
    userInfo: null,
    // 当前选中的色号（用于高亮显示）
    selectedColorCode: null
  }
});
