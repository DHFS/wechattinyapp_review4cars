// 云函数：删除评价（验证权限后删除）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  console.log('删除评价云函数被调用，参数:', event)
  
  const { reviewId } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  console.log('当前用户openid:', openid)

  if (!reviewId) {
    console.log('错误: reviewId为空')
    return { success: false, message: 'reviewId不能为空' }
  }

  try {
    // 先查询该评价，确认是当前用户的
    console.log('查询评价:', reviewId)
    const reviewRes = await db.collection('reviews').doc(reviewId).get()
    
    console.log('查询结果:', reviewRes)
    
    if (!reviewRes.data) {
      console.log('评价不存在')
      return { success: false, message: '评价不存在' }
    }
    
    console.log('评价openid:', reviewRes.data._openid, '当前openid:', openid)
    
    // 验证是否是当前用户的评价
    if (reviewRes.data._openid !== openid) {
      console.log('无权删除：不是自己的评价')
      return { success: false, message: '无权删除他人评价' }
    }
    
    // 执行删除
    console.log('开始删除评价')
    const removeRes = await db.collection('reviews').doc(reviewId).remove()
    console.log('删除结果:', removeRes)
    
    return {
      success: true,
      message: '删除成功'
    }

  } catch (err) {
    console.error('删除评价失败:', err)
    return {
      success: false,
      message: err.message || '删除失败'
    }
  }
}
