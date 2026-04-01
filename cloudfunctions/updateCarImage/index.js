// 云函数：更新车型图片（带每日上传次数限制）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 每日上传限制次数
const DAILY_UPLOAD_LIMIT = 10

exports.main = async (event, context) => {
  const { carId, imageUrl } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  // 验证身份
  if (!openid) {
    return {
      success: false,
      message: '未登录'
    }
  }
  
  if (!carId || !imageUrl) {
    return {
      success: false,
      message: '缺少参数: carId 或 imageUrl'
    }
  }
  
  // 验证imageUrl格式
  if (!imageUrl.startsWith('cloud://')) {
    return {
      success: false,
      message: '图片格式不正确'
    }
  }

  try {
    // 获取今天的开始和结束时间
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
    
    // 查询今天该用户已上传的图片数量
    const uploadCountRes = await db.collection('upload_logs')
      .where({
        _openid: openid,
        upload_date: _.gte(todayStart).and(_.lte(todayEnd))
      })
      .count()
    
    const todayUploadCount = uploadCountRes.total || 0
    
    // 检查是否超过每日限制
    if (todayUploadCount >= DAILY_UPLOAD_LIMIT) {
      return {
        success: false,
        message: `今日上传次数已用完（限制${DAILY_UPLOAD_LIMIT}张/天），请明天再试`,
        code: 'DAILY_LIMIT_REACHED',
        todayUploadCount
      }
    }
    
    // 先查询车型是否存在
    const carRes = await db.collection('cars').doc(carId).get()
    if (!carRes.data) {
      return {
        success: false,
        message: '车型不存在'
      }
    }
    
    // 更新图片
    const result = await db.collection('cars').doc(carId).update({
      data: {
        image_url: imageUrl,
        updated_at: db.serverDate()
      }
    })
    
    // 记录上传日志
    await db.collection('upload_logs').add({
      data: {
        _openid: openid,
        car_id: carId,
        image_url: imageUrl,
        upload_date: db.serverDate(),
        created_at: db.serverDate()
      }
    })
    
    console.log('更新车型图片成功:', result)
    console.log(`用户 ${openid} 今日已上传: ${todayUploadCount + 1}/${DAILY_UPLOAD_LIMIT}`)

    return {
      success: true,
      message: '更新成功',
      data: result,
      todayUploadCount: todayUploadCount + 1,
      remainingCount: DAILY_UPLOAD_LIMIT - todayUploadCount - 1
    }
  } catch (err) {
    console.error('更新车型图片失败:', err)
    return {
      success: false,
      message: err.message || '更新失败',
      error: err
    }
  }
}
