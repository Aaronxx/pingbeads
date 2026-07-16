# AGENTS.md — 拼豆酥 (pingbeads)

微信小程序：将图片转换为 MARD 品牌拼豆/米珠马赛克图纸（291 种标准色号）。

## 构建与运行

- **无 CLI 构建** — 用[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)导入项目目录，自动编译
- AppID: `wx736c3cac771e1edd`（也可用测试号）
- 手动编译: DevTools 内 `Ctrl+B`
- 真机预览: DevTools → 预览 → 微信扫码
- **云函数** (`cloudfunctions/contentCheck/`): 通过 DevTools GUI 部署（云开发 → 云函数 → 上传部署），非 CLI

## 关键陷阱 (Gotchas)

- **Canvas 像素获取**: `wx.getImageInfo` 返回的路径无法用 `canvas.getImageData` 读取。绕过方式: `canvas.drawImage` + `wx.canvasGetImageData`；若仍失败则回退伪随机生成
- **`setData()` 禁传大数组**: 网格级数组必须存在组件普通属性上（`this.cachedPixelData`, `this.cachedGridData`, `this.cachedSegments`）。`setData` 会跨 JS-native 桥序列化，大数组必卡
- **循环依赖**: `algorithms/index.js` ↔ `imageProcessor` ↔ `colorMapper`。在 `getAlgorithm('current')` 内用延迟 `require()` 解决
- **导出上限**: Canvas 2D 最大 4096px / 维，大图自动降采样
- **iOS Canvas 差异**: 部分 Canvas 2D API 在 iOS 表现不同，务必在 Android 验证
- **打包忽略**: `project.config.json` 的 `packOptions.ignore` 排除了 `skill/`, `tests/`, `docs/`, `.zcode/`, `test-automator.js`。不要把源码放进这些目录

## 调试技巧

- 按日志前缀过滤: `[MosaicCanvas]`, `[ColorStats]`, `[Index]`
- Canvas 像素获取失败 → 自动回退伪随机生成，这是预期行为不是 bug
- iOS 预览缩放模糊 → 已通过平台分离渲染修复（iOS 用 `ctx.scale/translate`，Android 用位图缩放），详见 `docs/ios-zoom-refactor-summary.md`
- 清缓存: DevTools → 清缓存 → 清除全部（解决多数缓存导致的异常）
- 导出失败常见原因: Canvas 节点查询失败（检查 `#export-canvas` 是否渲染）、4096px 超限、3 秒超时不够（大图需更长）
- 常见错误: `Cannot set property '10' of undefined` → 检查二维数组初始化；`canvasGetImageData:fail` → Canvas API 限制，正常回退

## 已知问题

- iOS 与 Android 的 Canvas 2D API 行为仍有细微差异
- 大图 (150×150+ 格子) 导出耗时较长，极端情况 OOM
- 云函数 `contentCheck` 依赖 `wx-server-sdk ~2.6.3`，需在 DevTools 云开发控制台手动安装依赖
- 滑块拖动节流到 ~12fps（`onVibrantChanging` 内 80ms 间隔），快速拖动时中间帧可能跳过

## 架构要点

单页应用，所有 UI 在 `src/pages/index/index`。

```
imagePicker ──imageSelected──> index.js ──imagePath──> mosaicCanvas
mosaicCanvas ──mosaicGenerated──> index.js ──mosaicData──> colorStats
colorStats ──codeClick──> index.js ──highlightCode──> mosaicCanvas
```

### mosaicCanvas（核心组件）

拆为 6 个 mixin，位于 `src/components/mosaicCanvas/mixins/`:
- `colorProcessing` / `colorReplace` / `exportPreset` / `imageProcessing` / `interaction` / `renderer`

色彩管道入口: `src/utils/colorPipeline.js`（phase1 取色+映射 → phase2 鲜艳度+聚合+特殊色替换，所有参数变更统一走 `reapplyColors`）

算法路由: `src/utils/algorithms/index.js` 按 `algorithmVersion` 分发:
- `classic` → `classic.js` | `current` → 延迟 `require()` | `perceptual` → `perceptual.js`（默认）

## 测试

使用 **Node.js 内置测试框架** (`node:test` + `node:assert/strict`)，无 jest/mocha。

```bash
node tests/colorMapper.test.js
node tests/imageProcessing.test.js
node tests/colorHelpers.test.js
node tests/colorProcessing.test.js
node tests/colorReplace.test.js
node tests/exportPreset.test.js
node tests/gridHelpers.test.js
node tests/desaturateGrayColors.test.js
node tests/aggregateSimilarColors.test.js
```

测试文件直接 `require('../src/utils/')` — 无需构建步骤。

## 代码约定

- **日志前缀**: `[MosaicCanvas]`, `[ColorStats]`, `[Index]` — 新增日志保持一致
- **色号格式**: MARD 色号 = 字母+数字（如 `A01`, `B12`），`formatMarkCode()` 可缩写为 `A1`, `B2`
- **特殊色系列**: P, Q, R, T, Y, ZG — 默认排除映射，通过 `useSpecialColors` 属性开启。替代映射见 `colorMapper.js` 的 `SPECIAL_ALTERNATIVES`
- **组件通信**: 父→子用 properties，子→父用 `triggerEvent`，无全局事件总线
- **模式参数缓存**: `index.js` 在 `_modeParamCache` 中按图片+模式缓存参数，切回卡通/马赛克时恢复

## 部署流程

1. **上传代码**: DevTools → 工具 → 上传 → 填版本号和备注
2. **体验版**: 微信公众平台 → 版本管理 → 设为体验版
3. **云函数部署**: DevTools → 云开发 → 云函数 → 右键上传部署（`contentCheck` 需先在云开发控制台安装依赖）
4. **正式发布**: 微信公众平台 → 提交审核 → 审核通过后发布

## 延伸阅读

- `docs/TECHNICAL_DOCUMENT.md` — 完整模块 API 文档与数据结构（中文）
- `docs/ios-zoom-refactor-summary.md` — iOS Canvas 缩放问题修复经验
- `src/utils/colorMapper.js` — 预计算 32×32×32 RGB 查找表 (32768 buckets) + LRU 缓存 (4096 条)
- `src/data/colorPalettes.js` — 291 种 MARD 颜色定义
