// 云函数：删除评价（验证权限后删除）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function isReviewOwnerByFields(review = {}, openid = '') {
  if (!openid || !review) return false
  return review.owner_openid === openid || review._openid === openid
}

async function isReviewOwner(review = {}, openid = '') {
  if (isReviewOwnerByFields(review, openid)) {
    return true
  }

  // 兼容早期“新增车型 + 首评”记录：评论里没有 owner_openid 时，
  // 回退到关联车型的 submitted_by / created_by 判断是否为同一提交者。
  if (review.submission_type === 'new_car_first_review' && review.car_id) {
    try {
      const carRes = await db.collection('cars').doc(review.car_id).get()
      const car = carRes.data || {}
      return car.submitted_by === openid || car.created_by === openid
    } catch (err) {
      console.warn('回查关联车型归属失败:', err.message)
    }
  }

  return false
}

exports.main = async (event, context) => {
  const { reviewId } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!reviewId) {
    return { success: false, message: 'reviewId不能为空' }
  }

  try {
    // 先查询该评价，确认是当前用户的
    const reviewRes = await db.collection('reviews').doc(reviewId).get()

    if (!reviewRes.data) {
      return { success: false, message: '评价不存在' }
    }

    // 验证是否是当前用户的评价
    if (!(await isReviewOwner(reviewRes.data, openid))) {
      return { success: false, message: '无权删除他人评价' }
    }

    const reviewData = reviewRes.data

    // 如果这是“新增车型 + 首评”的审核包，且车型尚未公开，则删除评价时一并删除关联车型。
    let shouldRecalculateScore = !!reviewData.car_id

    if (
      reviewData.submission_type === 'new_car_first_review' &&
      reviewData.car_id
    ) {
      try {
        const carRes = await db.collection('cars').doc(reviewData.car_id).get()
        const car = carRes.data

        if (car && car.status !== 'approved') {
          await db.collection('cars').doc(reviewData.car_id).remove()
          shouldRecalculateScore = false
        }
      } catch (carErr) {
        console.warn('删除关联车型失败，继续删除评价:', carErr.message)
      }
    }
    
    const removeRes = await db.collection('reviews').doc(reviewId).remove()

    return {
      success: true,
      message: '删除成功',
      shouldRecalculateScore
    }

  } catch (err) {
    console.error('删除评价失败:', err)
    return {
      success: false,
      message: err.message || '删除失败'
    }
  }
}
