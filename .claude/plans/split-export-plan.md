# 分块导出功能实现方案

## 需求概述

在"保存图片"按钮旁边新增"分块导出"按钮，支持三种分割模式：
- **上下分割**：从中间水平分割为上下两部分
- **左右分割**：从中间垂直分割为左右两部分  
- **2×2分割**：均分为 4 等份

每部分独立导出高分辨率图片，带标题"微信小程序：拼豆酥（部位名）行×列"，颜色统计独立计算。

---

## 修改文件清单

| 文件 | 改动内容 |
|------|---------|
| `src/pages/index/index.js` | 新增 splitMode 状态、弹窗控制、分块导出逻辑 |
| `src/pages/index/index.wxml` | 底部栏增加"分块导出"按钮 + 弹出选择器 |
| `src/pages/index/index.wxss` | 新按钮样式、弹窗样式 |
| `src/components/mosaicCanvas/mosaicCanvas.js` | 新增 `getSplitStats()` 方法，暴露分割统计 |

---

## 详细设计

### 1. 数据结构

```javascript
// index.js data 新增字段
splitMode: '',           // '' | 'horizontal' | 'vertical' | 'grid2x2'
showSplitPopup: false,   // 弹窗显隐
splitStats: null,        // { parts: [{ name, cols, rows, stats }] }
```

### 2. UI 布局

#### 底部栏 (bottom-fixed-bar)
```
┌──────────────────────────────────┐
│  [🐾 保存图片]  [✂️ 分块导出]    │
│   60% 宽          35% 宽         │
└──────────────────────────────────┘
```

- `splitMode !== ''` 时显示"已选: 上下/左右/2×2 分割"，点击重新选择
- `splitMode === ''` 时显示"分块导出"

#### 弹窗 (split-popup) - 从底部升起
```
┌──────────────────────────────────┐
│          选择分割方式            │
│  ┌──────────────────────────┐  │
│  │     📐 上下分割           │  │
│  ├──────────────────────────┤  │
│  │     📏 左右分割           │  │
│  ├──────────────────────────┤  │
│  │     🔲 2×2 分割          │  │
│  ├──────────────────────────┤  │
│  │     取消                  │  │
│  └──────────────────────────┘  │
└──────────────────────────────────┘
```

#### 预览分割指示线
- 上下分割：canvas 中间画一条水平虚线
- 左右分割：canvas 中间画一条垂直虚线  
- 2×2：十字虚线

### 3. 核心逻辑

#### splitGridData(gridData, rows, cols, mode)
```
上下分割:
  midRow = Math.floor(rows / 2)
  上: gridData[0..midRow-1], rows=midRow, cols=cols
  下: gridData[midRow..rows-1], rows=rows-midRow, cols=cols

左右分割:
  midCol = Math.floor(cols / 2)
  左: 每行取 cols[0..midCol-1], rows=rows, cols=midCol
  右: 每行取 cols[midCol..cols-1], rows=rows, cols=cols-midCol

2×2:
  midRow, midCol
  左上: gridData[0..midRow-1][0..midCol-1]
  右上: gridData[0..midRow-1][midCol..cols-1]
  左下: gridData[midRow..rows-1][0..midCol-1]
  右下: gridData[midRow..rows-1][midCol..cols-1]
```

#### 导出流程
```
exportSplitPNG():
  1. 获取 gridData (getExportData)
  2. 按 splitMode 分割
  3. 对每个分块：
     a. 计算统计 (calculateStats)
     b. 渲染到 export-canvas（标题 + 标尺 + 色块 + 统计行）
     c. canvasToTempFilePath → saveToPhotoAlbum
  4. 串联导出（一个接一个，避免并发冲突）
```

#### 标题格式
```
"微信小程序：拼豆酥（上半）{rows}行×{cols}列"
"微信小程序：拼豆酥（下半）{rows}行×{cols}列"
"微信小程序：拼豆酥（左侧）{rows}行×{cols}列"
"微信小程序：拼豆酥（右侧）{rows}行×{cols}列"
"微信小程序：拼豆酥（左上）{rows}行×{cols}列"
"微信小程序：拼豆酥（右上）{rows}行×{cols}列"
"微信小程序：拼豆酥（左下）{rows}行×{cols}列"
"微信小程序：拼豆酥（右下）{rows}行×{cols}列"
```

### 4. 预览分割线

mosaicCanvas 新增属性 `splitMode`，observer 中在渲染完毕后绘制分割指示线：
- 使用 save/restore + setLineDash 绘制虚线
- 颜色：半透明白色 + 黑色描边

### 5. 分块统计

弹窗选择分割模式后，页面调用 `mosaicCanvas.getSplitStats(splitMode)`，获取各分块的独立统计数据，并在统计面板区域显示。

---

## 实现顺序

1. **mosaicCanvas.js**：新增 `splitMode` property、分割线渲染、`getSplitStats()` 方法
2. **index.wxml**：底部栏双按钮 + 弹窗
3. **index.wxss**：按钮和弹窗样式
4. **index.js**：splitMode 状态管理 + `exportSplitPNG()` 分块导出逻辑
