# 微信AI自动化测试指南

## 📋 测试框架说明

本测试框架用于自动化测试拼豆图纸生成器的AI接口调用效果。

### 文件结构

```
skill/test/
├── automated-test.js      # 自动化测试框架
├── test-config.js          # 测试配置（需要创建）
├── test-report.json        # JSON格式测试报告（运行后生成）
└── test-report.md          # Markdown格式测试报告（运行后生成）
```

---

## 🚀 快速开始

### 1. 安装依赖

```bash
cd skill/test
npm init -y
npm install axios  # 用于HTTP请求
```

### 2. 配置测试环境

创建 `test-config.js`：

```javascript
module.exports = {
  // 微信AI接口配置
  ai: {
    baseUrl: 'https://api.weixin.qq.com',  // 微信API基础URL
    accessToken: 'YOUR_ACCESS_TOKEN',      // 小程序access_token
  },

  // 测试图片配置
  testImages: {
    small: '/path/to/small-image.jpg',     // 小图（<10万像素）
    medium: '/path/to/medium-image.jpg',   // 中图（30-100万像素）
    large: '/path/to/large-image.jpg',     // 大图（>100万像素）
    invalid: 'invalid-path'                // 无效路径
  },

  // 测试选项
  options: {
    timeout: 10000,        // 请求超时时间（毫秒）
    delay: 1000,           // 测试间隔（毫秒）
    generateReport: true,  // 是否生成报告
    verbose: true          // 是否显示详细日志
  }
};
```

### 3. 运行测试

```bash
# 运行所有测试
node automated-test.js

# 运行特定类别的测试
node automated-test.js --category=基础功能

# 运行特定优先级的测试
node automated-test.js --priority=high

# 生成报告
node automated-test.js --report
```

---

## 📊 测试用例说明

### 基础功能测试（5个）

| ID | 测试名称 | 测试内容 | 预期结果 |
|----|---------|---------|---------|
| 1 | 参数推荐 | 调用 suggestProcessingParams | 返回推荐参数和解释 |
| 2 | 生成图纸 | 调用 generateBeadMosaic | 返回图纸数据和mosaicId |
| 3 | 颜色统计 | 调用 getColorStats | 返回颜色统计信息 |
| 4 | 采购清单 | 调用 getPurchaseList | 返回CSV或文本内容 |
| 5 | 导出图片 | 调用 exportMosaicPNG | 返回图片临时路径 |

### 参数调整测试（5个）

| ID | 测试名称 | 测试内容 | 预期结果 |
|----|---------|---------|---------|
| 6 | 减小网格 | gridSize从10减到8 | 图纸更精细 |
| 7 | 减少颜色 | mergeThreshold从50增到100 | 颜色种类减少 |
| 8 | 增加鲜艳度 | vibrantScale设为5 | 颜色更鲜艳 |
| 9 | 切换模式 | processMode改为mosaic | 使用马赛克模式 |
| 10 | 启用镜像 | mirrorImage设为true | 图纸镜像翻转 |

### 错误处理测试（3个）

| ID | 测试名称 | 测试内容 | 预期结果 |
|----|---------|---------|---------|
| 11 | 无效图片 | 使用无效图片路径 | 返回错误码1001 |
| 12 | 参数超出范围 | gridSize设为100 | 返回错误码2003 |
| 13 | 图纸不存在 | 使用无效mosaicId | 返回错误码5002 |

### 复杂场景测试（2个）

| ID | 测试名称 | 测试内容 | 预期结果 |
|----|---------|---------|---------|
| 14 | 完整工作流 | 生成→统计→清单→导出 | 连续调用4个接口 |
| 15 | 连续调整 | 生成→调整→调整→导出 | 多次调用生成接口 |

---

## 🔧 自定义测试用例

### 添加新测试用例

在 `automated-test.js` 的 `testCases` 数组中添加：

```javascript
{
  id: 16,
  category: '自定义类别',
  name: '测试名称',
  input: '用户输入语句',
  expectedAction: '预期调用的接口',
  expectedParams: ['参数1', '参数2'],
  paramCheck: (params) => params.gridSize < 10,  // 可选：参数检查函数
  priority: 'high'  // high/medium/low
}
```

### 测试用例字段说明

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| id | number | 是 | 测试用例ID（唯一） |
| category | string | 是 | 测试类别 |
| name | string | 是 | 测试名称 |
| input | string/array | 是 | 用户输入（数组表示多轮对话） |
| expectedAction | string/array | 否 | 预期调用的接口 |
| expectedParams | array | 否 | 预期的参数列表 |
| paramCheck | function | 否 | 参数验证函数 |
| expectedError | number | 否 | 预期的错误码 |
| priority | string | 否 | 优先级（high/medium/low） |

---

## 📈 测试报告

### JSON 报告

包含完整的测试结果数据，可用于程序化分析：

```json
{
  "summary": {
    "total": 15,
    "passed": 12,
    "failed": 2,
    "error": 1,
    "duration": 15000,
    "timestamp": "2026-06-22T12:00:00.000Z"
  },
  "results": [
    {
      "id": 1,
      "name": "参数推荐",
      "category": "基础功能",
      "status": "passed",
      "duration": 1000,
      "details": {
        "input": "我有一张图片，帮我推荐一下参数",
        "expectedAction": "suggestProcessingParams",
        "actualAction": "suggestProcessingParams",
        "validation": {
          "passed": true,
          "message": "所有检查通过"
        }
      }
    }
  ]
}
```

### Markdown 报告

包含格式化的测试结果，便于阅读和分享：

```markdown
# 拼豆图纸生成器 - 自动化测试报告

**测试时间**: 2026/6/22 20:00:00

## 📊 测试摘要

- **总测试数**: 15
- **✅ 通过**: 12 (80.0%)
- **❌ 失败**: 2
- **💥 错误**: 1
- **⏱️  总耗时**: 15000ms

## 📈 分类统计

| 类别 | 通过 | 总数 | 通过率 |
|------|------|------|--------|
| 基础功能 | 5 | 5 | 100.0% |
| 参数调整 | 4 | 5 | 80.0% |
| 错误处理 | 2 | 3 | 66.7% |
| 复杂场景 | 1 | 2 | 50.0% |
```

---

## 🎯 测试策略

### 冒烟测试（5分钟）

只运行高优先级的测试用例：

```bash
node automated-test.js --priority=high
```

### 完整测试（30分钟）

运行所有测试用例：

```bash
node automated-test.js
```

### 回归测试

在代码修改后运行：

```bash
node automated-test.js --report --compare=previous-report.json
```

---

## 🔍 调试测试

### 启用详细日志

在 `test-config.js` 中设置：

```javascript
options: {
  verbose: true  // 显示详细日志
}
```

### 运行单个测试

```javascript
const runner = new TestRunner();
await runner.runTestCase(testCases[0]);  // 运行第一个测试
```

### 检查特定测试

```javascript
const result = runner.results.find(r => r.id === 1);
console.log(result);
```

---

## 📝 测试最佳实践

### 1. 测试数据准备

准备多种测试图片：
- 不同尺寸（小、中、大）
- 不同格式（JPG、PNG、WEBP）
- 不同内容（照片、插画、图标）

### 2. 测试环境隔离

- 使用独立的测试环境
- 避免影响生产数据
- 定期清理测试数据

### 3. 测试结果分析

- 关注失败率高的类别
- 分析失败原因
- 持续改进测试用例

### 4. 持续集成

将测试集成到CI/CD流程：

```yaml
# .github/workflows/test.yml
name: Automated Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run tests
        run: |
          cd skill/test
          npm install
          node automated-test.js --report
      - name: Upload report
        uses: actions/upload-artifact@v2
        with:
          name: test-report
          path: skill/test/test-report.*
```

---

## 🚨 常见问题

### Q1: 测试超时怎么办？
**A**: 在 `test-config.js` 中增加 `timeout` 值，或优化AI接口响应速度。

### Q2: 如何测试真实的微信AI？
**A**: 需要使用微信公众平台的API，配置 `accessToken`，并实现真实的AI调用逻辑。

### Q3: 测试失败如何排查？
**A**: 查看测试报告中的失败详情，检查接口调用和参数是否正确。

### Q4: 如何添加新的测试场景？
**A**: 在 `testCases` 数组中添加新的测试用例，定义输入、预期输出和验证逻辑。

---

## 📞 技术支持

如有问题，请联系开发团队或查看：
- [接口文档](../knowledge-base/02-接口文档.md)
- [错误处理](../knowledge-base/03-错误处理.md)
- [最佳实践](../knowledge-base/04-最佳实践.md)
