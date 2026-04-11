// components/imagePicker/imagePicker.js
Component({
  properties: {
    // 是否显示选择按钮
    showPicker: {
      type: Boolean,
      value: true
    }
  },

  data: {
    // 选择的图片路径
    imagePath: '',
    // 是否已选择图片
    hasImage: false
  },

  methods: {
    // 选择图片
    chooseImage() {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const tempFilePath = res.tempFiles[0].tempFilePath;
          this.setData({
            imagePath: tempFilePath,
            hasImage: true
          });
          // 触发事件
          
          this.triggerEvent('imageSelected', {
            path: tempFilePath
          });
          wx.showToast({ title: '触发事件', icon: 'none' });
        },
        fail: (err) => {
          
          wx.showToast({
            title: '选择图片失败',
            icon: 'none'
          });
        }
      });
    },

    // 重新选择图片
    reselectImage() {
      this.chooseImage();
    },

    // 清除图片
    clearImage() {
      this.setData({
        imagePath: '',
        hasImage: false
      });
      this.triggerEvent('imageCleared');
    },

    // 预览图片
    previewImage() {
      if (!this.data.imagePath) return;
      wx.previewImage({
        urls: [this.data.imagePath]
      });
    }
  }
});
