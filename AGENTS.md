# AGENTS.md

Project guidance for ZCode agents working in this WeChat Mini Program repo.

## 项目概述

**拼豆马赛克 / 色彩马赛克 (Pinbeans)** — 微信小程序。将用户上传的图片转换为 **Mark (MARD) 品牌** 拼豆/米珠标准色（291 色）的马赛克图纸，支持色块统计、高亮、色号标注、双指缩放，以及导出 PNG / CSV。

技术栈：**原生微信小程序**（JS + WXML + WXSS），Canvas 2D API 渲染。无前端框架、无构建打包步骤（微信开发者工具直接编译）。

## 开发与运行

- **没有 `package.json`，没有 `npm test`，没有 `auto_dev.js`**（这些在 `GEMINI.md` 里被提到，但仓库中并不存在；属过时信息，请勿引用）。
- 开发方式：用**微信开发者工具**导入当前 `miniprogram/` 目录即可。AppID: `wx736c3cac771e1edd`（见 `project.config.json`）。
- 云开发环境 ID 在 `app.js` 的 `wx.cloud.init({ env })` 中硬编码；云函数根目录 `cloudfunctions/`。
- 小程序入口为单页面应用：`app.json` 只注册 `src/pages/index/index`，启用 `lazyCodeLoading: "requiredComponents"`。
- `.gitignore` 异常庞大（6000+ 行，疑似误提交的全局 ignore），且把 `CLAUDE.md` / `GEMINI.md` 也忽略了——不要据此判断这些文件的状态。

## 目录结构

```
app.js / app.json / app.wxss      # 小程序入口与全局配置
src/pages/index/                  # 唯一主页面（UI、手势、导出调度）
src/components/
  imagePicker/                    # 图片选择 + 内容安全云函数调用
  mosaicCanvas/                   # 画布渲染（核心，~2200 行）
  colorStats/                     # 颜色统计列表
src/utils/                        # 核心算法（见下）
  colorMapper.js                  # RGB → Mark 色号，32³ 预计算查找表
  colorHelpers.js                 # formatMarkCode / isLightColor 等纯函数
  imageProcessor.js               # 网格化 + 主导色提取（~1800 行，性能热点）
  mosaicProcessor.js              # V2 智能色块识别 / JPG 伪影处理
  regionUtils.js                  # 大区（A1/B2…）编号与定位
  statsCalculator.js              # 颜色统计
  exportRenderer.js               # PNG/分块导出绘制
  mirrorHelper.js                 # 镜像翻转（预览/导出复用）
src/data/colorPalettes.js         # Mark 291 色色号数据
cloudfunctions/contentCheck/      # wx-server-sdk 内容安全校验云函数（独立 package.json）
docs/技术文档.md                   # 详细技术文档（改算法前先读）
```

## 架构与分层约定

- **页面 → 组件 → utils** 单向依赖：`pages/index` 编排，`components/*` 只通过 `properties` 进、`triggerEvent` 出；纯算法集中在 `src/utils/`，组件不内联复杂算法。
- utils 模块用 **CommonJS**（`require` / `module.exports`），不用 ES modules。
- 大像素数据**不要走 `setData`**：保留在组件实例属性（如 `cachedPixelData`）上，`setData` 只传轻量 UI 状态。
- 组件按需注入：新增组件必须在 `app.json` 的 `lazyCodeLoading` 机制下可被解析（页面 `.json` 里声明 `usingComponents`）。
- 云函数 `contentCheck` 是**独立 Node 包**（有自己的 `package.json` + `wx-server-sdk`），与小程序主代码分离，需单独部署。

## 关键算法与参数

- **颜色映射** (`colorMapper.findClosestMarkColor`)：RGB 欧氏距离 + 32×32×32 预计算查找表加速。特殊色（`isSpecialColor`）和替代色（`getAlternativeColor`）有专门处理。
- **图像处理** (`imageProcessor.processSimple`)：网格化，每格提取主导色 `extractDominantColor`。近期提交集中在**卡通模式高方差格子**的性能与零分配优化——改动此处时关注 `colorCount` 复用、避免重复像素遍历。
- 核心可调参数（`mosaicCanvas` properties 默认值）：`gridSize=10`、`mergeThreshold=5`、`showCode=false`、`previewQuality=2`、`processMode: 'normal'|'smart'`、`useSpecialColors`、`removeEdge`、`mirrorImage`、`forceGridSize`、`gridPreset=[idx,cols,rows]`、`splitMode: ''|'horizontal'|'vertical'|'grid2x2'`。

## 编辑后必查清单（来自 CLAUDE.md，沿用）

1. **`const` → `let`**：若在 `if/else` 内需重新赋值，必须用 `let`（小程序编译后 `const` 不可重赋值）。
2. **Canvas 尺寸一致性**：钳制/限制 Canvas 尺寸时，所有相关绘制坐标必须同步更新。
3. **`triggerEvent` 的 `this`**：回调里调用需保证 `this` 指向组件实例（用闭包变量 `that`）。
4. **`isRendering` 链式保护**：加 `isRendering` 检查时，对应位置也要有 `_isResetting` 保护，防止初始化死循环。

## 验证

- 仓库内**没有可运行的自动化测试**（`minitest/` 为空，无 `package.json`）。验证依赖**微信开发者工具**手动运行：导入项目 → 真机/模拟器预览 → 用样图走完整流程（选图 → 马赛克 → 统计 → 导出 PNG/CSV）。
- 改动云函数后，需在开发者工具中重新上传部署 `contentCheck` 再测试。

## 改动前必读

- 算法/架构调整：先读 `docs/技术文档.md` 与 `TECHNICAL_DOCUMENT.md`。
- Zoom/手势相关：先读 `docs/ios-zoom-refactor-summary.md`（iOS 端缩放有专门处理）。
