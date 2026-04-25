// components/imagePicker/imagePicker.js
Component({
  properties: {
    // 鏄惁鏄剧ず閫夋嫨鎸夐挳
    showPicker: {
      type: Boolean,
      value: true
    }
  },

  data: {
    // 閫夋嫨鐨勫浘鐗囪矾寰?    imagePath: '',
    // 鏄惁宸查€夋嫨鍥剧墖
    hasImage: false
  },

  methods: {
    // 閫夋嫨鍥剧墖
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
          // 瑙﹀彂浜嬩欢
          
          this.triggerEvent('imageSelected', {
            path: tempFilePath
          });
        },
        fail: (err) => {
          
          wx.showToast({
            title: '閫夋嫨鍥剧墖澶辫触',
            icon: 'none'
          });
        }
      });
    },

    // 閲嶆柊閫夋嫨鍥剧墖
    reselectImage() {
      this.chooseImage();
    },

    // 娓呴櫎鍥剧墖
    clearImage() {
      this.setData({
        imagePath: '',
        hasImage: false
      });
      this.triggerEvent('imageCleared');
    },

    // 棰勮鍥剧墖
    previewImage() {
      if (!this.data.imagePath) return;
      wx.previewImage({
        urls: [this.data.imagePath]
      });
    }
  }
});

