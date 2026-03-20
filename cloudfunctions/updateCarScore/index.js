// 云函数：更新车型平均分（管理员权限）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { carId } = event

  if (!carId) {
    return { success: false, message: 'carId不能为空' }
  }

  try {
    // 获取该车所有评价
    const res = await db.collection('reviews')
      .where({ car_id: carId })
      .get()

    const reviews = res.data
    const count = reviews.length

    if (count === 0) {
      // 如果没有评价了，清空车型数据
      await db.collection('cars').doc(carId).update({
        data: {
          avg_score: 0,
          review_count: 0,
          score_power: 0,
          score_handling: 0,
          score_space: 0,
          score_adas: 0,
          score_other: 0,
          updated_at: db.serverDate()
        }
      })
      return { success: true, message: '车型评价已清空' }
    }

    // 计算各维度平均分
    const avgPower = reviews.reduce((sum, r) => sum + (r.score_power || 0), 0) / count
    const avgHandling = reviews.reduce((sum, r) => sum + (r.score_handling || 0), 0) / count
    const avgSpace = reviews.reduce((sum, r) => sum + (r.score_space || 0), 0) / count
    const avgAdas = reviews.reduce((sum, r) => sum + (r.score_adas || 0), 0) / count
    const avgOther = reviews.reduce((sum, r) => sum + (r.score_other || 0), 0) / count

    // 计算综合平均分
    const avgTotal = reviews.reduce((sum, r) => sum + (r.total_score || 0), 0) / count

    // 更新车型数据
    await db.collection('cars').doc(carId).update({
      data: {
        avg_score: avgTotal,
        review_count: count,
        score_power: avgPower,
        score_handling: avgHandling,
        score_space: avgSpace,
        score_adas: avgAdas,
        score_other: avgOther,
        updated_at: db.serverDate()
      }
    })

    return {
      success: true,
      avg_score: avgTotal,
      review_count: count
    }

  } catch (err) {
    console.error('更新车型平均分失败:', err)
    return { success: false, message: err.message }
  }
}
