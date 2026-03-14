/**
 * ============================================
 * 车评侦探 - 云数据库示例数据
 * 在微信开发者工具的云开发控制台中导入使用
 * ============================================
 */

// ==================== Cars 集合示例数据 ====================
const carsSampleData = [
  {
    "_id": "car_001",
    "brand": "特斯拉",
    "model_name": "Model 3",
    "model_year": "2024款",
    "power_type": "纯电",
    "price_range": "23.19-33.19万",
    "image_url": "cloud://your-env.6a73-car/model3.jpg",
    "avg_score": 89.5,
    "review_count": 2341,
    "created_at": new Date("2024-01-15"),
    "updated_at": new Date("2024-03-10")
  },
  {
    "_id": "car_002",
    "brand": "比亚迪",
    "model_name": "汉EV",
    "model_year": "2024款",
    "power_type": "纯电",
    "price_range": "17.98-24.98万",
    "image_url": "cloud://your-env.6a73-car/han_ev.jpg",
    "avg_score": 87.2,
    "review_count": 1856,
    "created_at": new Date("2024-01-20"),
    "updated_at": new Date("2024-03-09")
  },
  {
    "_id": "car_003",
    "brand": "理想",
    "model_name": "L7",
    "model_year": "2024款",
    "power_type": "增程",
    "price_range": "31.98-37.98万",
    "image_url": "cloud://your-env.6a73-car/lixiang_l7.jpg",
    "avg_score": 91.3,
    "review_count": 1523,
    "created_at": new Date("2024-02-01"),
    "updated_at": new Date("2024-03-08")
  },
  {
    "_id": "car_004",
    "brand": "小米",
    "model_name": "SU7",
    "model_year": "2024款",
    "power_type": "纯电",
    "price_range": "21.59-29.99万",
    "image_url": "cloud://your-env.6a73-car/xiaomi_su7.jpg",
    "avg_score": 88.7,
    "review_count": 3201,
    "created_at": new Date("2024-03-01"),
    "updated_at": new Date("2024-03-11")
  },
  {
    "_id": "car_005",
    "brand": "问界",
    "model_name": "M7",
    "model_year": "2024款",
    "power_type": "增程",
    "price_range": "24.98-32.98万",
    "image_url": "cloud://your-env.6a73-car/wenjie_m7.jpg",
    "avg_score": 86.4,
    "review_count": 987,
    "created_at": new Date("2024-02-15"),
    "updated_at": new Date("2024-03-07")
  }
];

// ==================== Reviews 集合示例数据 ====================
const reviewsSampleData = [
  {
    "_id": "review_001",
    "car_id": "car_001",
    "_openid": "oXGxxxxxxxxxxxxxxxx1", // 用户的openid
    "user_avatar": "https://thirdwx.qlogo.cn/mmopen/vi_32/xxx/132",
    "user_nickname": "电动小王子",
    "score_power": 92,      // 动力三电
    "score_handling": 85,   // 操控底盘
    "score_space": 78,      // 空间内饰
    "score_adas": 95,       // 辅驾安全
    "score_other": 88,      // 其他体验
    "total_score": 89.1,    // 加权总分 (92*0.3 + 85*0.2 + 78*0.2 + 95*0.2 + 88*0.1)
    "comment": "三电系统真的很强，续航扎实，超充网络也方便。就是内饰稍微简单了点，但自动驾驶是真的好用！",
    "created_at": new Date("2024-03-10T14:30:00")
  },
  {
    "_id": "review_002",
    "car_id": "car_001",
    "_openid": "oXGxxxxxxxxxxxxxxxx2",
    "user_avatar": "https://thirdwx.qlogo.cn/mmopen/vi_32/yyy/132",
    "user_nickname": "科技控",
    "score_power": 88,
    "score_handling": 90,
    "score_space": 82,
    "score_adas": 88,
    "score_other": 85,
    "total_score": 87.0,
    "comment": "操控很棒，指哪打哪，转向精准。冬天续航会有折扣，但在预期范围内。",
    "created_at": new Date("2024-03-09T10:15:00")
  },
  {
    "_id": "review_003",
    "car_id": "car_003",
    "_openid": "oXGxxxxxxxxxxxxxxxx3",
    "user_avatar": "https://thirdwx.qlogo.cn/mmopen/vi_32/zzz/132",
    "user_nickname": "奶爸车主",
    "score_power": 85,
    "score_handling": 88,
    "score_space": 98,      // 大五座空间满分
    "score_adas": 90,
    "score_other": 92,      // 冰箱彩电大沙发
    "total_score": 89.3,
    "comment": "空间大得离谱，后排可以躺平。增程没有里程焦虑，适合家庭出游。智能座舱体验很好，孩子很喜欢。",
    "created_at": new Date("2024-03-11T09:00:00")
  }
];

// ==================== 数据库操作说明 ====================
/*
【在云开发控制台创建集合的步骤】

1. 打开微信开发者工具 → 云开发 → 数据库

2. 点击"添加集合"，依次创建：
   - cars（车辆信息表）
   - reviews（用户评价表）
   - users（用户信息表，可选）

3. 设置权限：
   - cars 集合：所有用户可读，仅管理员可写
   - reviews 集合：所有用户可读，认证用户可写
   - users 集合：用户仅可读写自己的数据

4. 导入示例数据：
   - 将上方的 sample data 保存为 JSON 文件
   - 在对应集合中选择"导入"

【五维打分权重说明】
- 动力三电 (30%): 电池续航、电机性能、电控效率
- 操控底盘 (20%): 悬挂调校、转向手感、驾驶乐趣
- 空间内饰 (20%): 乘坐空间、储物能力、内饰质感
- 辅驾安全 (20%): 辅助驾驶、主动安全、被动安全
- 其他体验 (10%): 智能座舱、售后服务、品牌价值等

【总分计算公式】
total_score = 
  score_power * 0.30 +
  score_handling * 0.20 +
  score_space * 0.20 +
  score_adas * 0.20 +
  score_other * 0.10
*/

module.exports = {
  carsSampleData,
  reviewsSampleData
};
