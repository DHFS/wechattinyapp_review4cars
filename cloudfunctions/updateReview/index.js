// 云函数：更新评价（验证权限后更新）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { reviewId, updateData } = event
  const { OPENID } = cloud.getWXContext()

  if (!reviewId) {
    return { success: false, message: 'reviewId不能为空' }
  }

  try {
    const res = await db.collection('reviews').doc(reviewId).get()
    
    if (!res.data) {
      return { success: false, message: '评价不存在' }
    }
    
    if (res.data._openid !== OPENID) {
      return { success: false, message: '无权修改他人评价' }
    }
    
    await db.collection('reviews').doc(reviewId).update({
      data: { ...updateData, updated_at: db.serverDate() }
    })
    
    return { success: true, message: '更新成功' }
  } catch (err) {
    return { success: false, message: err.message }
  }
}