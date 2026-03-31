# 🚗 车评侦探 - 微信小程序

[![Version](https://img.shields.io/badge/version-v1.3.2-orange)](./)
[![GitHub](https://img.shields.io/badge/GitHub-DHFS/car--review--miniapp-blue?logo=github)](https://github.com/DHFS/car-review-miniapp)

一款基于微信原生开发的车型评价小程序，采用 **Editorial Industrialism** 设计风格，让用户可以对不同车型进行五维度评分，查看排行榜，管理个人评价。

---

## ✨ 功能特性

### 核心功能
- **车型排行榜** - 全新 UI 设计，大图卡片展示，杂志级排版
- **官方图片系统** - 开发者上传车型官方图片，云存储 + 自动转换
- **五维评分系统** - 动力三电(30%)、操控底盘(20%)、空间内饰(20%)、辅驾安全(20%)、其他体验(10%)
- **雷达图展示** - 可视化展示车型在各维度的表现
- **用户评价** - 支持文字评价和五维打分，每位用户每车型限评一次
- **个人中心** - 全新设计，大数字统计风格
- **车型录入辅助** - 添加车型时支持品牌/车型本地联想、自动带出动力形式和售价区间、提交前纠错推荐

### v1.3.2 新特性
- 🎨 **Editorial Industrialism 设计** - 高端汽车杂志风格，深色沉浸主题
- 🖼️ **大图卡片设计** - 车型图片占满卡片上半部分，圆角融合
- 🏷️ **语义化标签色** - 纯电/增程/插混/燃油 专属配色
- ☁️ **官方图片系统** - 云存储 + 云函数架构
- 📱 **我的页面重构** - 同步首页设计规范

---

## 🎨 设计规范

### 设计风格
**Editorial Industrialism** - 精准档案风格

将小程序从普通的"应用感"转变为高端汽车杂志/技术档案的视觉体验。结合工业机械的粗犷感与高端汽车杂志的精致排版。

### 核心原则
- **无分割线设计** - 仅用色块和留白区分区域
- **大图优先** - 车型封面图作为视觉焦点
- **深色沉浸** - Carbon & Combustion 主题色调
- **编辑式排版** - 杂志级别的文字层级

### 色彩系统

| Token | 色值 | 用途 |
|-------|------|------|
| `surface` | #131313 | 页面背景 |
| `surface-container-low` | #1c1b1b | 卡片背景 |
| `on-surface` | #e5e2e1 | 主文字 |
| `primary` | #ff6b35 | 强调色（评分、按钮） |

**动力类型标签色**:
| 类型 | 色值 |
|------|------|
| 纯电 EV | #22a568 |
| 增程 EREV | #007eba |
| 插混 PHEV | #c172d4 |
| 燃油 ICE | #ffa200 |

### 组件规范

**车型卡片**:
- 背景: #1c1b1b
- 圆角: 32rpx
- 图片高度: 520rpx（占满上半部分）
- 评分数字: 96rpx，#ff6b35
- 无分割线，仅用间距区分

**动力类型标签**:
- 形状: 胶囊形（border-radius: 9999rpx）
- 背景透明度: 0.25
- 边框: 2rpx 实线
- 文字: 白色 + 阴影
- 毛玻璃效果: backdrop-filter: blur(12px)

---

## 🛠 技术栈

- **框架**: 微信小程序原生开发 (WXML + WXSS + JS)
- **后端**: 微信云开发 (CloudBase)
- **数据库**: MongoDB (云数据库)
- **存储**: 微信云存储（车型图片、用户头像）

---

## 🚀 快速开始

### 1. 克隆项目
```bash
git clone https://github.com/DHFS/car-review-miniapp.git
cd car-review-miniapp
```

### 2. 导入项目
1. 打开微信开发者工具
2. 选择「导入项目」
3. 选择本项目目录
4. 填写 AppID（需开通云开发）

### 3. 开通云开发
1. 点击开发者工具「云开发」按钮
2. 按指引开通云开发环境

### 4. 创建数据库集合
在云开发控制台 - 数据库中创建两个集合：
- `cars` - 车型表
- `reviews` - 评价表

### 5. 配置数据库权限

**reviews 集合**:
```json
{
  "read": true,
  "write": "doc._openid == auth.openid"
}
```

**cars 集合**:
```json
{
  "read": true,
  "write": "auth.openid != null"
}
```

### 6. 部署云函数
在微信开发者工具中，右键以下文件夹选择「创建并部署：云端安装依赖」：

```bash
cloudfunctions/getOpenid
cloudfunctions/getCarReviews
cloudfunctions/deleteReview
cloudfunctions/updateReview
cloudfunctions/updateCarScore
cloudfunctions/suggestCarModels
cloudfunctions/updateCarImage      # v1.3.2 新增：更新车型图片
```

### 7. 导入车型数据
使用 `cars-batch-import.json` 导入初始车型数据。

---

## 📁 项目结构

```
wechattinyapp_review4cars/
├── app.js                    # 小程序入口
├── app.json                  # 全局配置
├── app.wxss                  # 全局样式
├── carDictionary.js          # 前端车型联想词典
├── cloudfunctions/           # 云函数
│   ├── getOpenid/            # 获取用户 OpenID
│   ├── getCarReviews/        # 获取车型所有评价
│   ├── deleteReview/         # 删除评价
│   ├── updateReview/         # 更新评价
│   ├── updateCarScore/       # 更新车型平均分
│   ├── suggestCarModels/     # 车型联想与纠错
│   └── updateCarImage/       # 更新车型图片
├── pages/                    # 页面
│   ├── index/                # 首页 - 车型排行榜
│   ├── detail/               # 详情页 - 车型详情
│   ├── addCar/               # 添加车型页
│   ├── myReviews/            # 我的评价页
│   └── allReviews/           # 全部评价页
├── scripts/                  # 构建脚本
├── database-schema.json      # 数据库结构
├── database-security-config.md # 数据库安全配置指南
├── DEVELOPMENT_LOG.md        # 开发问题记录
├── 上线检查清单.md          # 上线前检查清单
└── README.md                 # 本文件
```

---

## 📝 更新日志

### v1.3.2 (2025-03-31)
- ✨ 全新 UI 设计：Editorial Industrialism 风格
- ✨ 官方图片系统：支持上传车型封面图
- ✨ 新增云函数：updateCarImage
- ✨ 我的评价页面：同步首页设计规范
- ✨ 动力类型标签：专属语义化配色
- 🎨 深色沉浸主题：Carbon & Combustion 配色

### v1.3.1 (2025-03-20)
- 修复评价头像显示问题
- 优化雷达图绘制性能

### v1.3.0 (2025-03-15)
- 新增车型联想词典
- 添加提交前智能纠错

---

## ⚠️ 注意事项

1. **微信隐私规范**：获取用户信息使用微信官方提供的头像昵称填写能力
2. **数据权限**：数据库 read 权限设为 true（所有人可读），write 权限限制为仅创建者
3. **头像存储**：用户头像上传到云存储，需确保存储权限为"所有用户可读"
4. **图片上传**：返回首页后需要下拉刷新查看新上传的图片

---

## 🤝 贡献

欢迎提交 Issue 和 PR！

---

**项目地址**: https://github.com/DHFS/car-review-miniapp
