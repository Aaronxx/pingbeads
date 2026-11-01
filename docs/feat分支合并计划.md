# feat/color-aggregation-and-anti-gray 分支合并计划

> 创建：2026-07-06
> 目标：把 feat 分支中**与聚类算法无关**的改进（架构重构、bug 修复、性能优化、测试）有选择地合并到 master。
> **跳过**：feat 分支的聚类算法重构（`aggregateSimilarColors` 重写 + 特殊色映射重构），因调试后效果不如老算法稳定。
> 当前状态：master HEAD = `37ac7b1 取消恢复`，feat HEAD = `3eb0305 perf: 性能优化重构`。

---

## 一、feat 分支功能盘点（65 个提交归类）

### 🟢 类别 1：基础架构重构（必须最先做）

| Commit | 内容 | 改动 |
|--------|------|------|
| `e93a14b` | **mosaicCanvas 模块化拆分为 6 个 mixin** + 新增 `gridHelpers.js` | 8 文件, +1783/-2024 |

**为什么必须先做**：master 上是单文件 `mosaicCanvas.js`（90KB），feat 后续 30+ 提交改的都是 `mixins/*.js`。不先拆分，后续提交无法应用。纯结构调整，不改算法，风险最低。

### 🟢 类别 2：单元测试（架构之后立即可做）

| Commit | 内容 | 改动 |
|--------|------|------|
| `76cba03` | mosaicCanvas mixin 单元测试（89 个用例） | 6 文件, +700 |

依赖 `mixins/` 结构，必须在类别 1 之后。

### 🟢 类别 3：bug 修复和 UI 改进（与算法无关）

| Commit | 内容 | 改动 | 改的文件 |
|--------|------|------|----------|
| `6ef164c` | 网格预设切回原图比例时重置 cropOffset | +2 | `mosaicCanvas.js` ⚠️ |
| `23dd96c` | 勾选自定义网格时避免不必要的重处理 | +44/-22 | `mosaicCanvas.js` + `index.js` ⚠️ |
| `5306109` | 修复功能面板上滑缩小导致无法操作 | +8/-6 | `index.js` + `index.wxml` |
| `9bc7f33` | 功能面板最大高度限制 75vh→50vh | +1/-1 | `index.wxss` |
| `4c07c40` | 清理马赛克孤立杂色（cleanIsolatedColors） | +117/-2 | `mixins/imageProcessing.js` + `imageProcessor.js` ✅ |

⚠️ **顺序敏感**：`6ef164c` 和 `23dd96c` 改的是单文件 `mosaicCanvas.js`，**必须在拆分之前** cherry-pick；`4c07c40` 改的是拆分后的 `mixins/imageProcessing.js`，**必须在拆分之后** cherry-pick。

### 🟢 类别 4：卡通模式取色改进（只改 imageProcessor.js，相互有依赖）

| Commit | 内容 | 依赖 |
|--------|------|------|
| `9a1d7c6` | 卡通模式取色改用中位数引导加权平均 | 基础（最先） |
| `4b10c19` | 高方差格子改用量化众数 | 依赖 `9a1d7c6` 引入的 maxDist |
| `8d6e7e8` | perf: 消除高方差回退路径的重复像素遍历 | 依赖 `4b10c19` 引入的众数代码 |
| `ab6c403` | refactor: 消除 extractDominantColor 对象分配 | 依赖 `8d6e7e8` |

**必须按顺序** cherry-pick：`9a1d7c6` → `4b10c19` → `8d6e7e8` → `ab6c403`。顺序错会冲突。

### 🟢 类别 5：性能优化（按文件分批，避开聚类相关 hunk）

`3eb0305` 改动 11 个文件，其中 `imageProcessor.js` 和 `colorMapper.js` 的部分 hunk 涉及聚类函数（`euclideanDistanceSqProtected` 附近的 `quickMedian` 优化、`aggregateSimilarColors` 后面的 `autoDetectBlockSize`），**整体 cherry-pick 会冲突**。需按文件分批处理。

`3eb0305` 改动的文件清单：
```
✅ 可直接 cherry-pick（与聚类/拆分无关）：
   src/utils/exportRenderer.js       drawExportGuideLines 合并 stroke
   src/utils/mosaicProcessor.js      sqrt→平方、字符串key→数值key、fastMedian去slice
   src/utils/statsCalculator.js      calculateTotalCount 直接计数
   project.config.json               packOptions.ignore 排除 tests/

⚠️ 需要先做拆分（mixins 文件 master 上不存在）：
   src/components/mosaicCanvas/mixins/interaction.js     RAF 节流 + lastTouch 实例属性
   src/components/mosaicCanvas/mixins/renderer.js        缓存 benchmarkLevel
   src/components/mosaicCanvas/mixins/colorReplace.js    positionList.find → Set
   src/components/mosaicCanvas/mixins/imageProcessing.js calculateStats 顶层 require
   src/pages/index/index.js                              onVibrantChanging 节流 + undoStack 拷贝

⚠️ 需要手工处理（与聚类代码冲突）：
   src/utils/imageProcessor.js
     - colorDistanceSq 新增函数：可保留
     - filterEdgeBlocks/Segments BFS 优化：可保留（不碰聚类）
     - processSimple / processWithSmartRegions 众数 key 改写：需对比 master 当前的 processSimple（可能与聚类重构前的版本不同）
     - autoDetectBlockSize 优化：可保留
     - quickMedian 去 slice：可保留
   src/utils/colorMapper.js
     - findClosestMarkColor 改平方比较：需对比 master 是否有 fastFindClosestMarkColor（feat 的特殊色重构引入的）
     - getMarkColorInfoByCode 用 Map：可保留
```

### 🔴 类别 6：聚类算法重构（**全部跳过**）

涉及约 35 个提交（`0d2472d` → `0e8941f` 一整段，含 `afbb481`/`f415d7c`/`48dee9b`/`b6e61c6`/`4642b52`/`7a22ff7`/`8e5055a`/`22c7b43`/`e05fd11` 等），全部关于 `aggregateSimilarColors` 重写、色相/明度/饱和度保护、snap 跳浊色、加权最远点初始化等。**这是你说"效果不稳定"的部分，全部跳过**。

### 🔴 类别 7：特殊色映射重构（**全部跳过**）

`e05fd11`（建表分离普通色/特殊色）、`22c7b43`（特殊色替代算法重算）、`8e5055a`、`029aef9`、`f56ccd3`、`9fc52d7`（浊色规避）。与聚类路径耦合，全部跳过。

### ⚪ 类别 8：文档（可选）

`3b2b250` 整理聚类算法总结文档——讲的是类别 6 的内容，可留可删。当前 master 的 `37ac7b1` 已经把它删了，保持删除状态即可。

---

## 二、合并执行步骤

### 第 1 步：在拆分**之前**，先合并两个针对单文件的 bug 修复

```
git cherry-pick 6ef164c   # 网格预设切回原图比例时重置 cropOffset
git cherry-pick 23dd96c   # 勾选自定义网格时避免不必要的重处理
```

这两个改的是单文件 `mosaicCanvas.js`，在拆分之前合并能避免冲突。

**验证**：微信开发者工具打开，确认自定义网格勾选/取消、网格预设切换功能正常。

### 第 2 步：mosaicCanvas 模块化拆分

```
git cherry-pick e93a14b
```

拆成 6 个 mixin + 新增 `gridHelpers.js`。这一步会把 `mosaicCanvas.js` 从 90KB 缩到很小，逻辑分散到 mixins/。

**验证**：
- 语法检查：`node -c src/components/mosaicCanvas/mixins/*.js`
- 微信开发者工具打开，走完整流程（选图 → 卡通模式 → 缩放 → 替换色 → 导出），确认行为与拆分前一致

### 第 3 步：合并单元测试

```
git cherry-pick 76cba03
```

**验证**：
```
node --test tests/*.test.js
```
应该 89 个用例全部通过。这是后续合并的**回归保障**。

### 第 4 步：合并 bug/UI 修复（拆分后的）

```
git cherry-pick 5306109   # 修复功能面板上滑缩小
git cherry-pick 9bc7f33   # 功能面板最大高度 75vh→50vh
git cherry-pick 4c07c40   # 清理马赛克孤立杂色（cleanIsolatedColors）
```

**验证**：
- 功能面板手势操作正常
- 马赛克模式下杂色清理生效（导入一张有零散杂色的图，确认小色块被合并）
- `node --test tests/*.test.js` 仍全过

### 第 5 步：合并卡通模式取色改进（**严格按顺序**）

```
git cherry-pick 9a1d7c6   # 中位数引导加权平均
git cherry-pick 4b10c19   # 高方差格子用量化众数
git cherry-pick 8d6e7e8   # 消除重复像素遍历
git cherry-pick ab6c403   # 消除对象分配
```

⚠️ 这 4 个有严格依赖关系，顺序不能乱。

**验证**：
- 卡通模式下，混合色区域（如渐变、过渡带）颜色更准，不再出现"通道错配"的脏中间色
- 高方差格子（如纹理、噪点）取色更稳定
- `node --test tests/*.test.js` 仍全过

### 第 6 步：按文件分批应用性能优化 `3eb0305`

#### 6a. 直接 cherry-pick 单文件的改动（用 `git checkout` 从 3eb0305 取文件版本）

```bash
# 这些文件 master 上已存在、且与聚类无关，可直接取 3eb0305 版本
git checkout 3eb0305 -- src/utils/exportRenderer.js
git checkout 3eb0305 -- src/utils/mosaicProcessor.js
git checkout 3eb0305 -- src/utils/statsCalculator.js
git checkout 3eb0305 -- project.config.json
git commit -m "perf: exportRenderer/mosaicProcessor/statsCalculator 性能优化"
```

⚠️ 但 `mosaicProcessor.js` 需确认是否依赖 feat 分支的特殊色重构——如果 cherry-pick 后跑测试失败，需手工对比调整。

#### 6b. mixins/ 下的文件（拆分后已存在，可直接取版本）

```bash
git checkout 3eb0305 -- src/components/mosaicCanvas/mixins/interaction.js
git checkout 3eb0305 -- src/components/mosaicCanvas/mixins/renderer.js
git checkout 3eb0305 -- src/components/mosaicCanvas/mixins/colorReplace.js
git checkout 3eb0305 -- src/components/mosaicCanvas/mixins/imageProcessing.js
git commit -m "perf: mosaicCanvas mixins 性能优化（RAF节流/缓存/Set查找）"
```

#### 6c. `index.js`（onVibrantChanging 节流 + undoStack 拷贝）

```bash
git checkout 3eb0305 -- src/pages/index/index.js
# 可能与第4步合并的 5306109 冲突，需手工对比
git commit -m "perf: index.js 性能优化（滑块节流/undoStack拷贝）"
```

#### 6d. `imageProcessor.js` 和 `colorMapper.js`（**手工处理**）

这两个文件在 3eb0305 中的改动，部分 hunk 依赖聚类重构后的代码。**不能直接 checkout**，需要逐个 hunk 对比：

**imageProcessor.js 可保留的改动**（与聚类无关）：
- 新增 `colorDistanceSq` 函数
- 新增 `createVisitedArray` 辅助函数
- `filterEdgeBlocks` / `filterEdgeSegments` 的 BFS 索引游标 + 周长遍历优化
- `autoDetectBlockSize` 内联像素读取 + 平方距离
- `quickMedian` 去 slice 拷贝
- `processSimple` / `processWithSmartRegions` 众数 key 改写（需对比 master 的对应代码块）

**imageProcessor.js 跳过的改动**（聚类相关）：
- `euclideanDistanceSqProtected` 附近的 hunk（虽然只是改 `quickMedian`，但 hunk 上下文可能依赖聚类版本）
- `aggregateSimilarColors` 后面的 `autoDetectBlockSize` 部分 hunk

**colorMapper.js 可保留的改动**：
- `getMarkColorInfoByCode` 改 Map 查找（新增 `markColorByCode` 预计算）
- `findClosestMarkColor` 改平方比较

**colorMapper.js 跳过的改动**：
- 任何涉及 `fastFindClosestMarkColor` / `specialLookupTable` / `excludeSpecialCache` 的 hunk（这些是 feat 的特殊色重构引入的，master 上可能没有）

**处理方式**：用 `git show 3eb0305 -- <file>` 查看每个 hunk，对比 master 当前代码，只手工应用可保留的 hunk。

#### 6e. 每个小步后都要验证

```
node -c <改动的文件>
node --test tests/*.test.js
```

### 最终验证

- `node --test tests/*.test.js` 全部通过
- 微信开发者工具走完整流程：
  1. 选图 → 卡通模式 → 缩放拖动 → 替换色 → 撤销 → 导出 PNG/CSV
  2. 选图 → 马赛克模式 → 杂色清理 → 导出
- 对比 master 老算法的聚类结果，确认**聚类行为未变**（因为我们跳过了类别 6/7）

---

## 三、风险点和回退方案

### 风险点

1. **`e93a14b` 拆分可能与 master 后续的小改动冲突**
   - master 在 feat 分支创建后可能有自己的提交（但 `git log feat..master` 为空，说明 master 是 feat 的直接祖先，无冲突风险）

2. **`4c07c40` 的 cleanIsolatedColors 可能依赖 feat 的聚类代码**
   - 它是独立函数，但调用点在 `_finishMosaicResult` / `_finishSimpleResult`，需确认这些函数在 master 上的位置

3. **性能优化的 `mosaicProcessor.js` 可能依赖 feat 的特殊色重构**
   - `mosaicProcessor.js` 用 `fastFindClosestMarkColor`，如果 master 上这个函数签名/行为不同，可能出问题

4. **卡通模式取色改进可能影响聚类前的取色**
   - `9a1d7c6` 等改动 `processSimple`，而 `processSimple` 是聚类的输入。虽然我们跳过聚类重构，但取色改进会影响聚类输入数据——**这是好事**（更准的取色），但需确认聚类结果仍稳定

### 回退方案

每一步都是独立 commit，任何一步出问题可以：
```
git reset --hard HEAD~1   # 回退最近一步
```

或针对 cherry-pick 的具体 commit：
```
git revert <commit-hash>
```

**关键**：每步完成后立即在微信开发者工具验证，不要堆积多步再验证。

---

## 四、执行检查清单

- [ ] 第1步：`6ef164c`, `23dd96c` 合并 + 验证
- [ ] 第2步：`e93a14b` 拆分 + 语法/功能验证
- [ ] 第3步：`76cba03` 测试 + `node --test` 验证
- [ ] 第4步：`5306109`, `9bc7f33`, `4c07c40` + 验证
- [ ] 第5步：`9a1d7c6` → `4b10c19` → `8d6e7e8` → `ab6c403` + 验证
- [ ] 第6步 a/b/c/d/e：性能优化分批 + 每批验证
- [ ] 最终：完整流程验证 + 测试全过

---

## 五、跳过的提交清单（备查）

以下提交**不合并**，记录于此供未来参考：

**聚类算法重构（类别 6）**：
`0d2472d`, `7b7c9d0`, `b28a5a5`, `8262e30`, `9077e14`, `df24329`, `afbb481`, `48dee9b`, `f415d7c`, `42258fa`, `b73fe09`, `8ca7fca`, `bd19bf0`, `05bc237`, `b6e61c6`, `4642b52`, `7a22ff7`, `86eafaf`, `7a17e3b`, `029aef9`, `b2433cb`, `05e59cb`, `e5c04e3`, `e9b565e`, `757a3dc`, `888afba`, `1aca004`, `8db2a48`, `0e8941f`, `9a7334d`, `0b12ac3`

**特殊色映射重构（类别 7）**：
`e05fd11`, `22c7b43`, `8e5055a`, `f56ccd3`, `9fc52d7`

**鲜艳度诊断/调参（与聚类调试耦合）**：
`24834a0`, `56d7f50`, `bfbac64`, `2f8f730`

**文档**：
`3b2b250`（已被 master 的 `37ac7b1` 删除）

**注意**：跳过清单中有些"chore: 清理诊断日志"或"diag:"提交本身是无害的，但它们改的代码与聚类重构高度耦合，单独合并意义不大且易冲突，统一跳过。
