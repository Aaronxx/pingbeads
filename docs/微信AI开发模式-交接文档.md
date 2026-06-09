# 微信AI开发模式接入 - 交接文档

## 一、当前进度

### 已完成 ✅

| 文件 | 说明 | 状态 |
|------|------|------|
| `skill/SKILL.md` | SKILL 业务描述文档 | ✅ 完成 |
| `skill/mcp.json` | 原子接口声明（4个接口 + 3个组件） | ✅ 完成 |
| `skill/atomic-interfaces/index.js` | 原子接口实现代码 | ✅ 完成 |

### 代码提交记录

```
分支：feature/wechat-ai-skill

提交历史：
- ab1267b feat: 实现微信AI开发模式的原子接口代码
- 33735cf feat: 新增微信AI开发模式SKILL定义（SKILL.md + mcp.json）
```

---

## 二、原子接口清单

### 已实现的 4 个接口

| 接口名 | 功能 | 关键参数 |
|--------|------|---------|
| `generateBeadMosaic` | 生成拼豆图纸 | imageUrl, processMode, gridSize, mergeThreshold |
| `getColorStats` | 获取颜色统计 | mosaicId, sortBy |
| `getPurchaseList` | 导出采购清单 | mosaicId, format(csv/text) |
| `exportMosaicPNG` | 导出PNG图片 | mosaicId, includeStats, showCode |

### 已定义的 3 个原子组件

| 组件名 | 功能 | 用途 |
|--------|------|------|
| `MosaicPreviewCard` | 图纸预览卡片 | 展示马赛克缩略图 |
| `ColorStatsList` | 颜色统计列表 | 展示各色号数量 |
| `PurchaseListCard` | 采购清单卡片 | 展示CSV并提供复制 |

---

## 三、剩余工作清单

### 3.1 申请开通开发模式 ⏳

**步骤：**

1. 登录微信公众平台：https://mp.weixin.qq.com
2. 进入「拼豆酥」小程序管理后台（AppID: wx736c3cac771e1edd）
3. 左侧菜单：「功能」→「基础功能」→「AI能力」
4. 点击「接入模式」→ 选择「开发模式」→ 申请开通
5. 等待审核（通常 1-3 个工作日）

**备选方式：**
- 打开「微信开发者助手」小程序
- 「管理」→「微信AI管理」→ 选择「开发模式」申请

---

### 3.2 下载调试工具 ⏳

**必须使用 Nightly Build 版本**

下载地址：https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html

选择：
- **微信开发者工具（Nightly Electron Build）**
- 根据你的系统选择 Windows/Mac 版本

安装后导入项目：
- AppID: `wx736c3cac771e1edd`
- 目录: `D:\workspace\pingbeads`（或新电脑的项目路径）

---

### 3.3 注册 SKILL 到小程序 ⏳

**前提：开发模式申请已通过**

**步骤：**

1. 在 Nightly Build 中打开项目
2. 在项目根目录创建 SKILL 注册文件
3. 按照微信AI文档要求，将 `skill/` 目录下的文件注册到小程序
4. 具体注册方式参考官方文档（申请通过后会提供）

**可能需要调整的文件路径：**
```
skill/
├── SKILL.md              # 业务描述
├── mcp.json             # 接口声明
└── atomic-interfaces/
    └── index.js         # 接口实现
```

---

### 3.4 测试联调 ⏳

#### 测试场景 1：生成图纸

**用户对话：** "帮我把这张图转成拼豆图纸"

**预期调用：**
```javascript
generateBeadMosaic({
  imageUrl: '/tmp/test.jpg',  // 用户上传的图片
  processMode: 'cartoon',
  gridSize: 10,
  mergeThreshold: 50,
  removeEdge: true
})
```

**预期返回：**
```javascript
{
  success: true,
  data: {
    mosaicId: 'mosaic_xxx',
    cols: 50,
    rows: 50,
    totalCells: 2500,
    colorCount: 30,
    colorStats: [...]
  }
}
```

---

#### 测试场景 2：查询统计

**用户对话：** "需要哪些颜色？"

**预期调用：**
```javascript
getColorStats({
  mosaicId: 'mosaic_xxx',
  sortBy: 'count'
})
```

---

#### 测试场景 3：获取采购清单

**用户对话：** "给我采购清单"

**预期调用：**
```javascript
getPurchaseList({
  mosaicId: 'mosaic_xxx',
  format: 'csv'
})
```

---

#### 测试场景 4：调整参数

**用户对话：** "格子太大了，用小一点的"

**预期调用：**
```javascript
generateBeadMosaic({
  imageUrl: '/tmp/test.jpg',  // 使用之前的图片
  processMode: 'cartoon',
  gridSize: 5,  // 从10改为5
  mergeThreshold: 50,
  removeEdge: true
})
```

---

### 3.5 提交审核 ⏳

**前提：测试联调通过 + 官方开放提审时间**

1. 在 Nightly Build 中提交代码
2. 微信AI平台会自动审核 SKILL
3. 审核通过后，微信AI可以调用你的接口

---

## 四、新电脑环境配置

### 4.1 必需软件

| 软件 | 版本要求 | 用途 |
|------|---------|------|
| Node.js | ≥ 14.x | 开发环境 |
| 微信开发者工具 Nightly | 最新版本 | 调试AI接口 |
| Git | 任意版本 | 代码管理 |

### 4.2 项目导入

```bash
# 1. 克隆代码
git clone <你的仓库地址>
cd pingbeads

# 2. 切换到AI开发分支
git checkout feature/wechat-ai-skill

# 3. 用微信开发者工具 Nightly Build 打开
# - AppID: wx736c3cac771e1edd
# - 目录: 项目根目录
```

### 4.3 验证代码

在微信开发者工具中：
1. 点击「编译」
2. 打开控制台，检查是否有错误
3. 确认小程序能正常运行

---

## 五、注意事项

### 5.1 微信小程序 AI 开发模式特殊要求

- **独立运行环境**：原子接口运行在独立JS环境，不是小程序主环境
- **API 限制**：部分小程序API不可用，需要查阅官方支持列表
- **登录态**：可以通过 storage 或 wx.login 共享登录凭证

### 5.2 当前代码的兼容性

`atomic-interfaces/index.js` 中使用了：
- `wx.getImageInfo` - 获取图片信息
- `wx.createOffscreenCanvas` - 离屏Canvas
- `wx.canvasToTempFilePath` - 导出图片

这些API在AI独立环境中**可能不支持**，需要：
1. 查阅官方 API 支持列表
2. 如果不支持，需要改为通过小程序主环境代理调用

### 5.3 数据存储

当前使用内存 `Map` 存储图纸数据，1小时过期。

**建议优化：**
- 改用 `wx.setStorage` 持久化
- 或者接入云数据库

---

## 六、参考文档

### 官方文档链接

- 小程序 AI 开发模式接入指南：（申请通过后提供）
- 小程序 MCP 协议：（申请通过后提供）
- 调试指南：（申请通过后提供）
- 最佳实践：（申请通过后提供）

### 项目内文档

- `CLAUDE.md` - 项目整体说明
- `TECHNICAL_DOCUMENT.md` - 技术实现文档
- `skill/SKILL.md` - SKILL 业务描述
- `skill/mcp.json` - 接口定义

---

## 七、快速启动清单

换到新电脑后，按顺序完成：

- [ ] 安装 Node.js
- [ ] 安装 Git
- [ ] 克隆代码到本地
- [ ] 切换到 `feature/wechat-ai-skill` 分支
- [ ] 下载微信开发者工具 Nightly Build
- [ ] 导入项目并编译
- [ ] 登录微信公众平台申请开发模式
- [ ] 等待审核通过
- [ ] 注册 SKILL 到小程序
- [ ] 开始测试联调

---

## 八、联系方式

如有问题：
- 微信AI开发者文档：（申请通过后提供）
- 微信开发者社区：https://developers.weixin.qq.com/community

---

**最后更新**：2026-06-09
**当前分支**：`feature/wechat-ai-skill`
**最新提交**：`ab1267b`
