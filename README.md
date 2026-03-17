# 🚗 车评侦探 - 微信小程序

[![GitHub](https://img.shields.io/badge/GitHub-DHFS/car--review--miniapp-blue?logo=github)](https://github.com/DHFS/car-review-miniapp)

一款基于微信原生开发的车型评价小程序，让用户可以对不同车型进行五维度评分，查看排行榜，管理个人评价。

## 🌐 项目地址

- **GitHub**: https://github.com/DHFS/car-review-miniapp

## ✨ 功能特性

### 核心功能
- **车型排行榜** - 按综合评分排序展示热门车型
- **五维评分系统** - 动力三电(30%)、操控底盘(20%)、空间内饰(20%)、辅驾安全(20%)、其他体验(10%)
- **雷达图展示** - 可视化展示车型在各维度的表现
- **用户评价** - 支持文字评价和五维打分
- **个人中心** - 查看和管理自己的所有评价

### 交互体验
- **完善资料弹窗** - 提交评价时填写头像和昵称（符合微信隐私规范）
- **防重复提交** - 避免网络卡顿或误触导致重复数据
- **浮动添加按钮** - 首页滑动时自动隐藏/显示
- **下拉刷新 & 上拉加载** - 流畅的列表体验
- **一键编辑** - 从"我的评价"点击直接跳转编辑模式
- **删除评价** - 支持删除历史评价，自动更新车型数据
- **自定义 TabBar** - 弹性布局，自适应不同屏幕尺寸

### 技术亮点
- 微信云开发（云数据库 + 云存储）
- 原生 Canvas 绘制五维雷达图
- 头像堆叠展示（最新点评用户头像在上层）
- 完整的编辑/删除评价功能
- 数据自动同步刷新

## 🛠 技术栈

- **框架**: 微信小程序原生开发 (WXML + WXSS + JS)
- **后端**: 微信云开发 (CloudBase)
- **数据库**: MongoDB (云数据库)
- **存储**: 微信云存储（用户头像）
- **版本控制**: Git + GitHub

## 📁 项目结构

```
wechattinyapp_review4cars/
├── app.js                    # 小程序入口
├── app.json                  # 全局配置
├── app.wxss                  # 全局样式
├── sitemap.json              # 站点地图
├── theme.json                # 主题配置（暗黑模式）
├── README.md                 # 项目说明文档
│
├── cloudfunctions/           # 云函数
│   └── getOpenid/            # 获取用户 OpenID
│       ├── index.js
│       ├── config.json
│       └── package.json
│
├── custom-tab-bar/           # 自定义底部导航栏
│   ├── index.js
│   ├── index.json
│   ├── index.wxml
│   └── index.wxss
│
├── pages/                    # 页面
│   ├── index/                # 首页 - 车型排行榜
│   │   ├── index.js
│   │   ├── index.wxml
│   │   ├── index.wxss
│   │   └── index.json
│   │
│   ├── detail/               # 详情页 - 车型详情 & 评价
│   │   ├── detail.js
│   │   ├── detail.wxml
│   │   ├── detail.wxss
│   │   └── detail.json
│   │
│   ├── addCar/               # 添加车型页
│   │   ├── addCar.js
│   │   ├── addCar.wxml
│   │   ├── addCar.wxss
│   │   └── addCar.json
│   │
│   └── myReviews/            # 我的评价页
│       ├── myReviews.js
│       ├── myReviews.wxml
│       ├── myReviews.wxss
│       └── myReviews.json
│
├── database-schema.json      # 数据库表结构说明
├── database-sample-data.js   # 示例数据
└── cars*.json                # 车型数据导入文件
```

## 🗄 数据库集合

### cars（车型表）
| 字段 | 类型 | 说明 |
|------|------|------|
| _id | string | 车型唯一ID |
| brand | string | 品牌名称 |
| model_name | string | 车型名称 |
| model_year | string | 年款 |
| power_type | string | 动力类型（纯电/增程/插混/燃油）|
| price_range | string | 售价区间 |
| avg_score | number | 平均综合得分 |
| review_count | number | 评价数量 |
| status | string | 状态（approved/pending）|

### reviews（评价表）
| 字段 | 类型 | 说明 |
|------|------|------|
| car_id | string | 关联的车型ID |
| user_avatar | string | 用户头像URL |
| user_nickname | string | 用户昵称 |
| score_power | number | 动力三电得分 |
| score_handling | number | 操控底盘得分 |
| score_space | number | 空间内饰得分 |
| score_adas | number | 辅驾安全得分 |
| score_other | number | 其他体验得分 |
| total_score | number | 综合加权得分 |
| comment | string | 文字评价 |
| created_at | Date | 创建时间 |

## 🚀 如何运行

### 1. 克隆项目
```bash
git clone https://github.com/DHFS/car-review-miniapp.git
cd car-review-miniapp
```

### 2. 导入项目
1. 打开微信开发者工具
2. 选择「导入项目」
3. 选择本项目目录
4. 填写自己的 AppID（需要开通云开发）

### 3. 开通云开发
1. 点击开发者工具「云开发」按钮
2. 按指引开通云开发环境
3. 记录环境 ID

### 4. 配置云环境
在 `app.js` 中配置你的云环境 ID：
```javascript
wx.cloud.init({
  env: 'your-env-id',  // 替换为你的云环境 ID
  traceUser: true
})
```

### 5. 创建数据库集合
在云开发控制台 - 数据库中创建两个集合：
- `cars` - 车型表
- `reviews` - 评价表

### 6. 导入车型数据
使用 `cars-batch-import.json` 或 `cars-simple.json` 导入初始车型数据。

### 7. 部署云函数（可选）
如需要获取用户 OpenID，可部署云函数：
1. 在微信开发者工具云开发控制台中，新建云函数 `getOpenid`
2. 复制 `cloudfunctions/getOpenid/index.js` 内容
3. 点击部署

### 8. 配置存储权限
云开发控制台 - 存储 - 权限设置：
- 所有用户可读
- 仅创建者可写

## 📱 主要页面说明

### 首页 (pages/index)
- 展示车型排行榜（按综合评分降序）
- 显示最新3条评价的用户头像堆叠（从右向左，最新在上）
- 悬浮按钮添加新车型
- 下拉刷新、上拉加载更多

### 详情页 (pages/detail)
- 车型基本信息和综合得分
- 五维雷达图（Canvas 绘制）
- 用户评价列表（带时分时间格式）
- 提交/编辑评价表单
- 完善资料弹窗（头像 + 昵称）

### 添加车型页 (pages/addCar)
- 表单填写车型信息
- 自动检测重复车型

### 我的评价页 (pages/myReviews)
- 展示当前用户的所有评价（带时分时间格式）
- 点击修改：跳转到详情页并自动进入编辑模式
- 点击删除：删除评价并更新车型数据
- 每次进入页面自动刷新

## 🎨 UI 设计

### 自定义 TabBar
- 字体加大（32rpx），弹性布局
- 自适应不同屏幕尺寸
- 支持 iPhone X 底部安全区
- 选中状态缩放动画

### 暗黑模式
- 背景色：#121212
- 卡片背景：#1A1A1A
- 主色调：#FF6B35（橙色）

## 📸 界面预览

> 截图待补充

## ⚠️ 注意事项

1. **微信隐私规范**：获取用户信息必须使用官方提供的头像昵称填写能力，已按要求实现
2. **防重复提交**：所有提交入口都已添加 `submitting` 状态检查
3. **头像存储**：用户头像会上传到云存储，需要确保存储权限正确
4. **基础库版本**：建议使用 2.10.4 及以上版本
5. **自定义 TabBar**：如遇到显示问题，请检查基础库版本是否支持

## 🤝 参与贡献

欢迎提交 Issue 和 Pull Request！

## 📝 更新日志

### v1.1.0 (2024-03)
- ✅ 自定义 TabBar，弹性适配不同屏幕
- ✅ 删除评价功能（自动更新车型数据）
- ✅ 时间格式增加时分（24小时制）
- ✅ 点击修改自动进入编辑模式
- ✅ 页面刷新机制优化
- ✅ 项目开源至 GitHub

### v1.0.0
- ✅ 车型排行榜展示
- ✅ 五维评分系统
- ✅ 用户评价功能
- ✅ 个人中心
- ✅ 完善资料弹窗（符合微信隐私规范）
- ✅ 防重复提交机制
- ✅ 头像堆叠展示（最新在上层）

## 📄 License

MIT License

---

**如果觉得项目有用，请给个 ⭐ Star 支持一下！**
