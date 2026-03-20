// 云函数：获取指定车型的所有评价（管理员权限，可读取所有数据）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  console.log('云函数被调用，参数:', event)
  
  const { carId } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  console.log('当前用户openid:', openid)

  if (!carId) {
    console.log('错误: carId为空')
    return {
      success: false,
      message: 'carId不能为空'
    }
  }

  try {
    console.log('开始查询车型评价, carId:', carId)
    
    // 查询该车型的所有评价（管理员权限可读取所有）
    const res = await db.collection('reviews')
      .where({ car_id: carId })
      .orderBy('created_at', 'desc')
      .limit(50)
      .get()

    console.log('查询到', res.data.length, '条评价')

    // 处理数据，标记当前用户的评价
    const reviews = res.data.map(item => ({
      _id: item._id,
      _openid: item._openid,
      car_id: item.car_id,
      user_avatar: item.user_avatar,
      user_nickname: item.user_nickname,
      score_power: item.score_power,
      score_handling: item.score_handling,
      score_space: item.score_space,
      score_adas: item.score_adas,
      score_other: item.score_other,
      total_score: item.total_score,
      comment: item.comment,
      created_at: item.created_at,
      isOwner: item._openid === openid
    }))

    console.log('返回处理后的数据')

    return {
      success: true,
      data: reviews,
      currentOpenid: openid
    }

  } catch (err) {
    console.error('查询评价失败:', err)
    return {
      success: false,
      message: err.message || '查询失败'
    }
  }
}
