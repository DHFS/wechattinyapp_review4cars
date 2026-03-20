# 开发问题总结

## 核心问题与解决方案

### 1. 数据权限混乱
**问题**：我的评价显示他人数据 / 详情页只显示自己的评价  
**原因**：数据库权限配置错误，或代码未正确过滤  
**解决**：
- 数据库权限：`read: true, write: "doc._openid == auth.openid"`
- 我的评价页面代码层面按 `_openid` 过滤

### 2. 头像加载失败 (403/500错误)
**问题**：用户头像不显示或显示默认头像  
**原因**：
- 云存储权限为"仅创建者可读"
- `cloud://` 链接未转换为 HTTPS 临时链接
- 默认头像文件损坏  
**解决**：
- 云存储权限改为"所有用户可读"
- 使用 `wx.cloud.getTempFileURL()` 转换头像链接
- 使用在线默认头像链接替代本地文件

### 3. 云函数部署问题
**问题**：云函数返回 "Hello World" 或报错 `FunctionName parameter could not be found`  
**原因**：本地代码未正确部署到云端  
**解决**：
- 微信开发者工具右键部署失败时，直接在云开发控制台编辑代码
- 确保 package.json 包含 `wx-server-sdk` 依赖

### 4. 车型平均分不更新
**问题**：修改/删除评价后，车型卡片分数不变  
**原因**：`updateCarScore` 云函数未正确执行或 cars 表无写入权限  
**解决**：
- 确保 `updateCarScore` 云函数代码正确（计算平均分并更新 cars 表）
- 检查 cars 表写入权限

### 5. 删除评价权限错误
**问题**：删除时报错 `database permission denied`  
**原因**：客户端直接删除受权限限制  
**解决**：所有删除操作改为调用 `deleteReview` 云函数

### 6. 登录状态管理
**问题**：页面间登录状态不一致，重复获取 openid  
**解决**：
- App.js 统一自动登录，缓存到 globalData
- 各页面从全局获取，未获取到时注册回调

## 关键配置清单

| 配置项 | 正确值 |
|--------|--------|
| reviews 数据库权限 | `{read: true, write: "doc._openid == auth.openid"}` |
| cars 数据库权限 | `{read: true, write: false}` |
| 云存储权限 | 读取：所有用户可读 |
| 默认头像 | 使用在线链接，非本地文件 |

## 云函数清单

- `getOpenid` - 获取用户身份
- `getCarReviews` - 获取车型所有评价
- `deleteReview` - 删除评价（验证权限）
- `updateReview` - 更新评价（验证权限）
- `updateCarScore` - 更新车型平均分
