// app.js
App({
  onLaunch() {
    // 小程序启动时执行的逻辑
    console.log('拼豆马赛克小程序启动');
  },

  globalData: {
    // 全局数据
    userInfo: null,
    // 当前选中的色号（用于高亮显示）
    selectedColorCode: null
  }
});
