# 🚗 车评侦探 - 微信小程序

[![GitHub](https://img.shields.io/badge/GitHub-DHFS/car--review--miniapp-blue?logo=github)](https://github.com/DHFS/car-review-miniapp)

一款基于微信原生开发的车型评价小程序，让用户可以对不同车型进行五维度评分，查看排行榜，管理个人评价。

## 🌐 项目地址

- **GitHub**: https://github.com/DHFS/car-review-miniapp

## ✨ 功能特性

### 核心功能
- **车型排行榜** - 按综合评分排序展示热门车型，显示最新3条评价用户头像
- **五维评分系统** - 动力三电(30%)、操控底盘(20%)、空间内饰(20%)、辅驾安全(20%)、其他体验(10%)
- **雷达图展示** - 可视化展示车型在各维度的表现
- **用户评价** - 支持文字评价和五维打分，每位用户每车型限评一次
- **个人中心** - 查看和管理自己的所有评价，支持修改和删除

### 交互体验
- **自动登录** - 小程序启动自动获取用户身份，无需重复授权
- **头像缓存** - 首次填写头像昵称后自动缓存，后续评价直接使用
- **实时更新** - 评价提交/修改/删除后自动更新车型平均分
- **防重复提交** - 避免网络卡顿或误触导致重复数据

## 🛠 技术栈

- **框架**: 微信小程序原生开发 (WXML + WXSS + JS)
- **后端**: 微信云开发 (CloudBase)
- **数据库**: MongoDB (云数据库)
- **存储**: 微信云存储（用户头像）

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
  "write": false
}
```

### 6. 配置云存储权限
云开发控制台 → 存储 → 权限设置：
- **读取**: 所有用户可读
- **写入**: 仅创建者可写

### 7. 部署云函数
在微信开发者工具中，右键以下文件夹选择「创建并部署：云端安装依赖」：

```bash
cloudfunctions/getOpenid
cloudfunctions/getCarReviews
cloudfunctions/deleteReview
cloudfunctions/updateReview
cloudfunctions/updateCarScore
```

### 8. 导入车型数据
使用 `cars-batch-import.json` 导入初始车型数据。

## 📁 项目结构

```
wechattinyapp_review4cars/
├── app.js                    # 小程序入口
├── app.json                  # 全局配置
├── app.wxss                  # 全局样式
├── cloudfunctions/           # 云函数
│   ├── getOpenid/            # 获取用户 OpenID
│   ├── getCarReviews/        # 获取车型所有评价
│   ├── deleteReview/         # 删除评价（验证权限）
│   ├── updateReview/         # 更新评价（验证权限）
│   └── updateCarScore/       # 更新车型平均分
├── pages/                    # 页面
│   ├── index/                # 首页 - 车型排行榜
│   ├── detail/               # 详情页 - 车型详情 & 评价
│   ├── addCar/               # 添加车型页
│   ├── myReviews/            # 我的评价页
│   └── allReviews/           # 全部评价页
├── database-schema.json      # 数据库结构说明
├── DEVELOPMENT_LOG.md        # 开发问题总结
└── cars-batch-import.json    # 车型数据导入文件
```

## ⚠️ 注意事项

1. **微信隐私规范**：获取用户信息使用微信官方提供的头像昵称填写能力，符合隐私规范
2. **数据权限**：数据库 read 权限设为 true（所有人可读），write 权限限制为仅创建者
3. **头像存储**：用户头像上传到云存储，需确保存储权限为"所有用户可读"
4. **防重复提交**：所有提交入口已添加 `submitting` 状态检查

## 📝 更新日志

### v1.2.3 (2026-03-18)
- ✅ **登录系统重构** - 小程序启动自动获取 openid，全局缓存用户信息，无需重复授权
- ✅ **用户评分限制** - 每位用户每车型限评一次，已评价显示"修改评价"按钮
- ✅ **数据权限优化** - 修复"我的评价"显示他人数据问题，修复详情页头像403错误
- ✅ **云函数化** - 删除、更新评价操作改为云函数执行，绕过客户端权限限制
- ✅ **平均分实时更新** - 评价提交/修改/删除后自动重新计算车型平均分
- ✅ **评价卡片优化** - 文字内容与评分胶囊间距调整，视觉层次更清晰

### v1.1.0 (2024-03-15)
- ✅ 自定义 TabBar，弹性适配不同屏幕
- ✅ 删除评价功能（自动更新车型数据）
- ✅ 时间格式增加时分（24小时制）
- ✅ 点击修改自动进入编辑模式

### v1.0.0 (2024-03-11)
- ✅ 车型排行榜展示
- ✅ 五维评分系统
- ✅ 用户评价功能
- ✅ 个人中心

## 🤝 参与贡献

欢迎提交 Issue 和 Pull Request！

## 📄 License

MIT License

---

**如果觉得项目有用，请给个 ⭐ Star 支持一下！**
