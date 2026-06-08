// components/imagePicker/imagePicker.js
Component({
  properties: {
    showPicker: {
      type: Boolean,
      value: true
    }
  },

  data: {
    imagePath: '',
    hasImage: false,
    isChecking: false
  },

  methods: {
    chooseImage() {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const tempFilePath = res.tempFiles[0].tempFilePath;
          this.setData({
            imagePath: tempFilePath,
            hasImage: true,
            isChecking: true
          });
          // 立即生成预览图，不等检测结果
          this.triggerEvent('imageSelected', {
            path: tempFilePath
          });
          // 后台异步检测
          this.checkImageContent(tempFilePath);
        },
        fail: () => {
          wx.showToast({ title: '选择图片失败', icon: 'none' });
        }
      });
    },

    checkImageContent(filePath) {
      if (!wx.cloud || !wx.cloud.callFunction) {
        this.finishCheck();
        return;
      }

      const maxSize = 300;
      const canvas = wx.createOffscreenCanvas({ type: '2d', width: maxSize, height: maxSize });
      const ctx = canvas.getContext('2d');
      const img = canvas.createImage();

      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h) {
          h = Math.round(h * maxSize / w);
          w = maxSize;
        } else {
          w = Math.round(w * maxSize / h);
          h = maxSize;
        }
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);

        wx.canvasToTempFilePath({
          canvas,
          quality: 0.3,
          fileType: 'jpg',
          success: (res) => {
            this.sendImageForCheck(res.tempFilePath, filePath);
          },
          fail: () => {
            this.finishCheck();
          }
        });
      };

      img.onerror = () => {
        this.finishCheck();
      };

      img.src = filePath;
    },

    sendImageForCheck(compressedPath, originalPath) {
      const fs = wx.getFileSystemManager();
      let base64Data;
      try {
        base64Data = fs.readFileSync(compressedPath, 'base64');
      } catch (e) {
        this.finishCheck();
        return;
      }

      wx.cloud.callFunction({
        name: 'contentCheck',
        data: {
          contentType: 'image/jpeg',
          value: base64Data
        },
        success: (cloudRes) => {
          if (cloudRes.result && cloudRes.result.code === 0) {
            this.finishCheck();
          } else if (cloudRes.result && cloudRes.result.code === 87014) {
            this.clearImage();
            wx.showToast({ title: '图片内容违规，请更换', icon: 'none', duration: 2500 });
          } else {
            this.finishCheck();
          }
        },
        fail: () => {
          this.finishCheck();
        }
      });
    },

    finishCheck() {
      this.setData({ isChecking: false });
    },

    reselectImage() {
      this.chooseImage();
    },

    clearImage() {
      this.setData({
        imagePath: '',
        hasImage: false,
        isChecking: false
      });
      this.triggerEvent('imageCleared');
    },

    previewImage() {
      if (!this.data.imagePath) return;
      wx.previewImage({ urls: [this.data.imagePath] });
    }
  }
});
