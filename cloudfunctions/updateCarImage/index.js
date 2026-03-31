// 云函数：更新车型图片（需管理员权限）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 管理员openid列表（实际生产环境建议存储在数据库或环境变量中）
const ADMIN_OPENIDS = [
  // 在这里添加管理员openid
  // 'oXXXXXXXXXXXXXXXXXXXXXXXXX'
]

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
  
  // 检查是否为管理员（生产环境请使用更严格的验证方式）
  // 暂时允许所有登录用户上传，但建议后续添加管理员验证
  // if (!ADMIN_OPENIDS.includes(openid)) {
  //   return {
  //     success: false,
  //     message: '无权限操作'
  //   }
  // }
  
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

    console.log('更新车型图片成功:', result)

    return {
      success: true,
      message: '更新成功',
      data: result
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
