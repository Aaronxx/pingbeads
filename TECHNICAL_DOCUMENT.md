# Mark 色彩马赛克 - 微信小程序技术文档

---

## 开发环境搭建与启动

### 1. 安装微信开发者工具

前往微信公众平台下载并安装微信开发者工具：

- **下载地址**: https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html
- **版本选择**: 选择最新稳定版
- **安装**: 下载后直接安装，推荐安装在 D 盘

### 2. 导入项目

1. 打开微信开发者工具
2. 点击左上角的「+」号或「导入项目」
3. 选择项目目录：`D:\workspace\pinbeans\miniprogram`
4. AppID：选择「测试号」或使用自己的 AppID
5. 点击「导入」

### 3. 编译运行

项目导入后，微信开发者工具会自动编译。可以在控制台查看日志输出。

**常用操作**:
- **编译**: 点击「编译」按钮或按 `Ctrl+B`
- **预览**: 点击「预览」按钮，用微信扫描二维码在手机预览
- **真机调试**: 点击「真机调试」按钮连接手机调试
- **清缓存**: 点击「清缓存」-「清除全部」解决缓存问题

### 4. 项目目录结构说明

```
D:\workspace\pinbeans\miniprogram\
├── src/                      # 源代码目录
│   ├── components/           # 自定义组件
│   ├── data/                 # 数据文件
│   ├── pages/               # 页面
│   └── utils/              # 工具函数
├── project.config.json       # 项目配置
├── project.private.config.json  # 私有配置
├── app.js                   # 小程序入口
├── app.json                 # 全局配置
├── app.wxss                # 全局样式
└── sitemap.json            # Sitemap 配置
```

### 5. 注意事项

- 微信开发者工具需要登录微信账号
- 使用真机预览/调试需要在微信公众平台配置服务器域名（如用到网络请求）
- iOS 真机可能无法使用部分 Canvas API，建议用 Android 真机测试

---

## 项目概述

这是一个微信小程序，用于将普通图片转换为 Mark（拼豆/米珠）色彩的马赛克图案。用户可以选择图片，调整参数，生成马赛克预览，并导出颜色清单用于购买珠子。

### 核心功能
1. **图片选择** - 从相册或相机选择图片
2. **马赛克生成** - 将图片转换为 Mark 色号的马赛克格子
3. **参数调整** - 网格大小、颜色合并阈值
4. **颜色统计** - 统计每种颜色的使用数量
5. **导出功能** - 导出 PNG 图片、CSV 清单、复制到剪贴板

---

## 项目结构

```
miniprogram/
├── app.json                 # 小程序全局配置
├── src/
│   ├── data/
│   │   └── colorPalettes.js    # Mark 色号数据 (291种颜色)
│   ├── utils/
│   │   ├── colorMapper.js     # 颜色映射算法
│   │   ├── imageProcessor.js  # 图像处理算法
│   │   └── statsCalculator.js # 统计计算
│   ├── components/
│   │   ├── imagePicker/       # 图片选择组件
│   │   ├── mosaicCanvas/      # 马赛克画布组件
│   │   └── colorStats/         # 颜色统计组件
│   └── pages/
│       └── index/              # 主页面
└── ...
```

---

## 核心模块详解

### 1. 色号数据 (colorPalettes.js)

**文件位置**: `src/data/colorPalettes.js`

**功能**: 定义 Mark (MARD) 品牌的 291 种标准颜色

**数据结构**:
```javascript
// 颜色映射表: hex -> { MARD: 色号 }
const colorMapping = {
  "#FAF4C8": { MARD: "A01" },
  "#FFFFD5": { MARD: "A02" },
  // ... 共291种颜色
};

// 调色板数组
const markPalette = [
  { code: "A01", hex: "#FAF4C8", rgb: { r: 250, g: 244, b: 200 } },
  // ...
];
```

**导出**:
- `markPalette` - 颜色数组
- `colorMapping` - 颜色映射对象
- `hexToRgb()` - 十六进制转RGB函数

---

### 2. 颜色映射算法 (colorMapper.js)

**文件位置**: `src/utils/colorMapper.js`

**功能**: 将任意 RGB 颜色映射到最接近的 Mark 色号

**核心函数**:

#### euclideanDistance(color1, color2)
计算两个 RGB 颜色之间的欧氏距离
```javascript
/**
 * @param {Object} color1 - {r, g, b}
 * @param {Object} color2 - {r, g, b}
 * @returns {number} 欧氏距离
 */
function euclideanDistance(color1, color2) {
  return Math.sqrt(
    Math.pow(color1.r - color2.r, 2) +
    Math.pow(color1.g - color2.g, 2) +
    Math.pow(color1.b - color2.b, 2)
  );
}
```

#### findClosestMarkColor(targetRgb)
在 291 种 Mark 颜色中找到最接近目标颜色的色号
```javascript
/**
 * @param {Object} targetRgb - 目标 RGB 颜色 {r, g, b}
 * @returns {Object} {code, hex, rgb, distance}
 */
function findClosestMarkColor(targetRgb) {
  let minDistance = Infinity;
  let closestColor = null;

  for (const color of markPalette) {
    const distance = euclideanDistance(targetRgb, color.rgb);
    if (distance < minDistance) {
      minDistance = distance;
      closestColor = color;
    }
  }

  return { ...closestColor, distance: minDistance };
}
```

#### rgbToMark(r, g, b)
将 RGB 值转换为 Mark 色号
```javascript
function rgbToMark(r, g, b) {
  const targetRgb = { r, g, b };
  const result = findClosestMarkColor(targetRgb);
  const { distance, ...colorInfo } = result;
  return colorInfo; // {code, hex, rgb}
}
```

---

### 3. 图像处理算法 (imageProcessor.js)

**文件位置**: `src/utils/imageProcessor.js`

**功能**: 处理图像像素，生成马赛克数据（当前未被主要组件使用，仅供参考）

**核心函数**:

#### getDominantColor(data, startX, startY, endX, endY, width)
计算网格区域内的主导色（出现频率最高的颜色）
```javascript
// 1. 量化颜色（减少颜色数量）
const qr = Math.floor(r / 8) * 8;
// 2. 统计每种颜色的出现次数
// 3. 返回出现频率最高的颜色
```

#### generateMosaic(options)
生成马赛克图像数据
```javascript
/**
 * @param {Object} options
 * @param {Uint8ClampedArray} options.imageData - 图像 RGBA 数据
 * @param {number} options.width - 图像宽度
 * @param {number} options.height - 图像高度
 * @param {number} options.gridSize - 网格大小（默认10）
 * @param {number} options.mergeThreshold - 颜色合并阈值（默认30）
 * @returns {Object} {gridData, cols, rows, gridSize}
 */
function generateMosaic(options) {
  // 1. 计算网格数量
  // 2. 遍历网格，提取主导色并映射到 Mark 色号
  // 3. 执行颜色合并
  // 4. 返回结果
}
```

#### mergeRegions(gridData, rows, cols, threshold)
使用 BFS 算法合并相邻的相似颜色区域
```javascript
// 1. 遍历所有未访问的单元格
// 2. 对每个单元格进行 BFS 扩散
// 3. 如果相邻单元格颜色距离小于阈值，则合并
// 4. 合并后使用区域内主导色的颜色
```

---

### 4. 统计计算 (statsCalculator.js)

**文件位置**: `src/utils/statsCalculator.js`

**功能**: 统计色块数量和生成采购清单

#### calculateStats(mosaicData)
```javascript
/**
 * @param {Object} mosaicData - 马赛克数据对象
 * @returns {Object}
 * {
 *   colorCount: number,      // 颜色种类数
 *   totalCount: number,      // 总格子数
 *   sortedByCount: Array,    // 按数量降序排序
 *   sortedByCode: Array,     // 按色号排序
 *   purchaseList: string,    // CSV 格式采购清单
 *   simpleList: Array        // 简化清单数组
 * }
 */
function calculateStats(mosaicData) {
  // 1. 遍历 gridData，统计每种颜色数量
  // 2. 转换为数组并排序
  // 3. 生成 CSV 和简化清单
  return { ... };
}
```

---

## 组件详解

### 1. 图片选择组件 (imagePicker)

**文件位置**: `src/components/imagePicker/`

#### imagePicker.js
```javascript
Component({
  properties: {
    showPicker: { type: Boolean, value: true }
  },

  data: {
    imagePath: '',
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
          this.setData({ imagePath: tempFilePath, hasImage: true });
          this.triggerEvent('imageSelected', { path: tempFilePath });
        }
      });
    },

    // 清除图片
    clearImage() {
      this.setData({ imagePath: '', hasImage: false });
      this.triggerEvent('imageCleared');
    },

    // 预览图片
    previewImage() {
      wx.previewImage({ urls: [this.data.imagePath] });
    }
  }
});
```

#### 事件
- `imageSelected` - 图片选择成功后触发，传递 `{ path: string }`
- `imageCleared` - 图片清除后触发

---

### 2. 马赛克画布组件 (mosaicCanvas) - 核心组件

**文件位置**: `src/components/mosaicCanvas/`

#### mosaicCanvas.js

**属性 (properties)**:
```javascript
{
  imagePath: String,        // 图片路径
  gridSize: Number,        // 网格大小 (默认10)
  mergeThreshold: Number,  // 颜色合并阈值 (默认85)
  highlightCode: String,   // 高亮显示的色号
  showCode: Boolean,      // 是否显示色号标注
  scale: Number           // 缩放比例
}
```

**数据 (data)**:
```javascript
{
  canvasWidth: 300,
  canvasHeight: 300,
  isProcessing: false,
  gridInfo: null,         // 马赛克数据 {gridData, cols, rows, gridSize}
  isFullscreen: false,
  scale: 1,
  flatCells: []           // 扁平化的格子数组，用于渲染
}
```

**核心方法**:

##### processImage(imagePath)
处理图片，生成马赛克
```javascript
processImage(imagePath) {
  // 1. 调用 wx.getImageInfo 获取图片信息
  // 2. 调用 tryGetPixels 尝试获取像素数据
  // 3. 如果失败，调用 generateMosaicWithImage
}
```

##### tryGetPixels(imagePath, srcWidth, srcHeight, destWidth, destHeight, gridSize)
尝试获取像素数据的两种方案：
1. **OffscreenCanvas** - 使用离屏 Canvas
2. **节点查询** - 使用 wx.createSelectorQuery

##### generateMosaicPseudo(srcWidth, srcHeight, destWidth, destHeight, gridSize)
**当前使用的主要方法** - 由于微信小程序 Canvas 2D API 限制无法获取真实像素数据，使用伪随机算法生成马赛克

```javascript
generateMosaicPseudo(srcWidth, srcHeight, destWidth, destHeight, gridSize) {
  // 1. 根据图片尺寸计算行列数
  // 2. 使用伪随机算法生成颜色
  const seed = srcWidth * srcHeight;
  const pseudoRandom = Math.sin(row * 12.9898 + col * 78.233 + seed) * 43758.5453;
  const r = Math.floor((pseudoRandom - Math.floor(pseudoRandom)) * 256);
  // 3. 映射到 Mark 色号
  // 4. 执行颜色合并
  // 5. 生成 flatCells 并触发事件
}
```

##### mergeRegions(gridData, rows, cols, threshold)
**关键算法** - BFS 颜色合并

```javascript
mergeRegions(gridData, rows, cols, threshold) {
  // 1. 如果 threshold <= 0，跳过合并
  // 2. 初始化 visited 和 mergedGrid 数组
  // 3. 遍历每个单元格
  // 4. 使用 BFS 查找连通区域
  // 5. 计算区域平均颜色
  // 6. 映射到 Mark 色号
  // 7. 确保所有单元格都被填充
}
```

##### handleTouchStart / handleTouchMove / handleTouchEnd
双指缩放功能
```javascript
// 1. 计算双指距离
// 2. 根据距离变化计算缩放比例
// 3. 限制缩放范围 (0.3 - 5)
```

**事件**:
- `mosaicGenerated` - 马赛克生成完成后触发，传递 `{ gridInfo }`
- `cellClick` - 点击格子时触发，传递 `{ code }`

#### mosaicCanvas.wxml
```xml
<view class="mosaic-wrapper">
  <!-- 全屏按钮 -->
  <view class="fullscreen-btn" bindtap="toggleFullscreen">全屏/退出</view>

  <!-- 隐藏的像素处理 Canvas -->
  <canvas type="2d" id="pixel-canvas" style="position: absolute; left: -9999px;"></canvas>

  <!-- 渲染区域 - 支持触摸缩放 -->
  <view class="mosaic-scroll" style="transform: scale({{scale}});"
        bindtouchstart="handleTouchStart"
        bindtouchmove="handleTouchMove"
        bindtouchend="handleTouchEnd">

    <!-- 马赛克格子 -->
    <view class="mosaic-grid">
      <view wx:for="{{flatCells}}" wx:key="index"
            style="left: {{item.x}}px; top: {{item.y}}px; width: {{gridInfo.gridSize}}px; height: {{gridInfo.gridSize}}px; background-color: {{item.markHex}};"
            bindtap="handleCellTap">
        <!-- 色号标注 -->
        <text wx:if="{{showCode}}" class="cell-code">{{item.markCode}}</text>
      </view>
    </view>
  </view>
</view>
```

---

### 3. 颜色统计组件 (colorStats)

**文件位置**: `src/components/colorStats/`

#### colorStats.js
```javascript
Component({
  properties: {
    mosaicData: Object,    // 马赛克数据
    highlightCode: String  // 高亮色号
  },

  data: {
    stats: null,
    sortBy: 'count'       // 'count' | 'code'
  },

  observers: {
    'mosaicData': function(newData) {
      if (newData) {
        const stats = calculateStats(newData);
        this.setData({ stats });
      }
    }
  },

  methods: {
    toggleSort() {
      const newSort = this.data.sortBy === 'count' ? 'code' : 'count';
      this.setData({ sortBy: newSort });
    },

    handleCodeTap(e) {
      const { code, hex } = e.currentTarget.dataset;
      if (code === this.data.highlightCode) {
        this.triggerEvent('codeClick', { code: null, hex: null });
      } else {
        this.triggerEvent('codeClick', { code, hex });
      }
    }
  }
});
```

#### 事件
- `codeClick` - 点击颜色项时触发，传递 `{ code, hex }`

---

### 4. 主页面 (index)

**文件位置**: `src/pages/index/`

#### index.js

**页面数据**:
```javascript
data: {
  currentStep: 1,          // 当前步骤
  imagePath: '',           // 图片路径
  mosaicData: null,        // 马赛克数据
  highlightCode: null,     // 高亮色号
  showCode: false,         // 是否显示色号
  gridSize: 10,           // 网格大小
  mergeThreshold: 85,      // 颜色合并阈值
  showExportMenu: false    // 导出菜单显示
}
```

**关键方法**:
- `onImageSelected()` - 图片选择回调
- `onMosaicGenerated()` - 马赛克生成回调
- `onGridSizeChange()` - 网格大小调整
- `onThresholdChange()` - 合并阈值调整
- `exportPNG()` - 导出 PNG 图片
- `exportCSV()` - 导出 CSV 清单
- `copyToClipboard()` - 复制到剪贴板

---

## 数据流

```
用户选择图片
    ↓
imagePicker 触发 imageSelected 事件
    ↓
index.js 设置 imagePath
    ↓
mosaicCanvas (通过 observers 监听到 imagePath 变化)
    ↓
processImage() 开始处理
    ↓
wx.getImageInfo() 获取图片尺寸
    ↓
tryGetPixels() 尝试获取像素数据
    ↓
失败 → generateMosaicWithImage()
    ↓
generateMosaicPseudo() 伪随机生成马赛克
    ↓
mergeRegions() 颜色合并
    ↓
setData({ gridInfo, flatCells })
    ↓
mosaicCanvas 触发 mosaicGenerated 事件
    ↓
index.js 设置 mosaicData
    ↓
colorStats (通过 observers 监听到 mosaicData 变化)
    ↓
calculateStats() 计算统计
    ↓
显示颜色统计列表
```

---

## 已知问题与限制

### 1. Canvas 像素获取限制
**问题**: 微信小程序 Canvas 2D API 无法获取 `wx.getImageInfo` 返回的图片的像素数据

**原因**:
- `wx.canvasGetImageData` 需要同源图片
- `OffscreenCanvas.getImageData` 在小程序中支持有限

**当前解决方案**: 使用伪随机算法生成马赛克（基于图片尺寸的 seed）

**改进方向**:
- 将图片先保存到本地临时文件再读取
- 使用 wx.downloadFile 下载图片到本地后再处理

### 2. 性能问题
- 大量格子时（gridSize 小）可能存在性能问题
- 颜色合并算法在大图上可能较慢

### 3. 平台兼容性
- iOS 和 Android 可能存在细微差异
- 建议使用真机测试

---

## 开发指南

### 添加新功能

1. **修改 mosaicCanvas 组件**
   - 在 `mosaicCanvas.js` 中添加方法
   - 在 `mosaicCanvas.wxml` 中添加视图
   - 在 `mosaicCanvas.wxss` 中添加样式

2. **修改颜色映射**
   - 编辑 `src/data/colorPalettes.js` 中的 `colorMapping` 对象

3. **添加新的导出格式**
   - 在 `index.js` 中添加新的导出方法

### 调试技巧

1. **查看日志**
   - 控制台日志以 `[MosaicCanvas]`、`[ColorStats]`、`[Index]` 为前缀

2. **常见错误**
   - `Cannot set property '10' of undefined` - 检查数组初始化
   - `canvasGetImageData:fail` - Canvas API 限制，正常回退到伪随机

---

## 技术栈

- **框架**: 微信小程序 (原生 JavaScript)
- **渲染**: View 层 + CSS
- **算法**: BFS 颜色合并、欧氏距离颜色匹配

---

## 附录：数据结构

### gridData 单元格的属性
```javascript
{
  x: number,           // 格子 X 坐标
  y: number,           // 格子 Y 坐标
  width: number,       // 格子宽度
  height: number,      // 格子高度
  originalRgb: {       // 原始 RGB 颜色
    r: number,
    g: number,
    b: number
  },
  markCode: string,    // Mark 色号 (如 "A01")
  markHex: string,     // 十六进制颜色 (如 "#FAF4C8")
  markRgb: {          // Mark 颜色的 RGB
    r: number,
    g: number,
    b: number
  },
  merged: boolean      // 是否经过合并
}
```

### stats 对象结构
```javascript
{
  colorCount: number,           // 颜色种类数
  totalCount: number,          // 总格子数
  sortedByCount: [             // 按数量降序
    { code: "A01", hex: "#FAF4C8", count: 100 },
    { code: "B01", hex: "#63F347", count: 50 }
  ],
  sortedByCode: [              // 按色号排序
    { code: "A01", hex: "#FAF4C8", count: 100 },
    { code: "B01", hex: "#63F347", count: 50 }
  ],
  purchaseList: string,         // CSV 格式
  simpleList: Array            // 简化数组
}
```
