# 拼豆马赛克 / 色彩马赛克 (Pinbeans)

一款微信小程序：将任意图片转换为 **Mark (MARD) 品牌拼豆/米珠标准色（291 色）**的马赛克图纸，支持色块统计、色号标注、高亮交互、双指缩放，以及导出 PNG / CSV 采购清单。

<!-- TODO: 在这里放 1-2 张小程序截图或 GIF 演示 -->
<!-- ![预览](docs/screenshot.png) -->

## 功能特性

- **图片转马赛克图纸**：网格化提取主导色，映射到最接近的 Mark 色号（291 色）
- **色块统计**：自动统计每种颜色所需豆子数量，生成采购清单
- **高亮交互**：点击统计列表中的颜色，图纸中对应色块高亮、其余灰显
- **色号标注**：可在色块上显示 Mark 色号（如 A01、B02）
- **大区定位**：图纸按 A1 / B2 … 大区编号，方便对照找位置
- **双指缩放**：流畅查看图纸细节（iOS / Android 均适配）
- **导出**：PNG 图纸（支持分块导出）、CSV 采购清单
- **智能模式**：JPG 伪影处理 / 智能色块识别，提升卡通图效果
- **其他**：镜像翻转、图纸拆分（横向 / 纵向 / 2×2）、特殊色与替代色、网格尺寸自定义

## 快速开始

1. 克隆本仓库：

   ```bash
   git clone https://github.com/Aaronxx/pingbeads.git
   ```

2. 用**微信开发者工具**导入仓库根目录（本项目无 npm 构建，导入即可编译）
   - AppID 可使用自己的测试号；云开发相关功能需替换为自己的环境

3. 部署云函数：
   - `cloudfunctions/contentCheck` 为图片内容安全校验云函数（独立 npm 包）
   - 在开发者工具中右键该目录 →「上传并部署：云端安装依赖」

4. 编译预览，选择一张图片即可生成拼豆图纸

## 项目结构

```
app.js / app.json / app.wxss      # 小程序入口与全局配置
src/pages/index/                  # 唯一主页面（UI、手势、导出调度）
src/components/
  imagePicker/                    # 图片选择 + 内容安全云函数调用
  mosaicCanvas/                   # 画布渲染（核心）
  colorStats/                     # 颜色统计列表
src/utils/
  colorMapper.js                  # RGB → Mark 色号映射（预计算查找表加速）
  imageProcessor.js               # 网格化 + 主导色提取
  mosaicProcessor.js              # V2 智能色块识别 / JPG 伪影处理
  regionUtils.js                  # 大区（A1/B2…）编号与定位
  statsCalculator.js              # 颜色统计
  exportRenderer.js               # PNG/分块导出绘制
  mirrorHelper.js                 # 镜像翻转
  colorHelpers.js                 # 纯函数工具
src/data/colorPalettes.js         # Mark 291 色色号数据
cloudfunctions/contentCheck/      # 内容安全校验云函数（需单独部署）
docs/技术文档.md                   # 详细技术文档
```

## 核心技术

- **颜色映射**：RGB 欧氏距离匹配最近 Mark 色，配合 32×32×32 预计算查找表加速
- **图像处理**：按网格提取主导色；针对卡通图有高方差格子优化与零分配热点路径
- **渲染**：微信小程序 Canvas 2D API，双指缩放手势自实现
- 架构分层：页面 → 组件 → utils 单向依赖，纯算法集中在 `src/utils/`

更多实现细节见 [docs/技术文档.md](docs/技术文档.md) 与 [TECHNICAL_DOCUMENT.md](TECHNICAL_DOCUMENT.md)。

## 相关说明

- **Mark (MARD)** 为德国拼豆品牌，其名称与商标归品牌方所有；本项目中的色号数据仅用于个人颜色匹配用途
- 云开发环境 ID 在 `app.js` 的 `wx.cloud.init({ env })` 中配置，请替换为你自己的环境

## 使用许可（仅供学习，禁止商用）

本项目采用 [PolyForm Noncommercial 1.0.0](LICENSE) 许可证：

- ✅ **允许**：个人学习、研究、实验、私人娱乐、业余项目等一切**非商业**用途
- ❌ **禁止**：任何形式的**商业用途**（包括但不限于销售、商业集成、收费服务、商业产品内使用）
- 传播本项目的任何部分时，必须附带本许可证（或其官方链接）及版权声明

如需商业授权，请通过 GitHub Issues 联系作者。
