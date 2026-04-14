// 云函数：更新评价（验证权限后更新）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function checkReviewContentSecurity(title, content) {
  try {
    const res = await cloud.callFunction({
      name: 'checkContentSecurity',
      data: {
        title,
        content
      }
    })

    return res.result || {
      success: false,
      message: '内容安全检测失败，请稍后重试'
    }
  } catch (err) {
    console.error('updateReview 调用内容安全检测失败:', err)
    return {
      success: false,
      message: '内容安全检测失败，请稍后重试'
    }
  }
}

function isReviewOwnerByFields(review = {}, openid = '') {
  if (!openid || !review) return false
  return review.owner_openid === openid || review._openid === openid
}

async function isReviewOwner(review = {}, openid = '') {
  if (isReviewOwnerByFields(review, openid)) {
    return true
  }

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
    
    if (!(await isReviewOwner(res.data, OPENID))) {
      return { success: false, message: '无权修改他人评价' }
    }

    if (res.data.status && res.data.status !== 'approved') {
      return { success: false, message: '审核中的内容暂不支持修改' }
    }

    const nextComment = String(updateData?.comment || '').trim()
    if (nextComment) {
      const reviewTitle = [
        res.data.car_brand || '',
        res.data.car_model_name || ''
      ].join(' ').trim()

      const securityRes = await checkReviewContentSecurity(reviewTitle, nextComment)
      if (!securityRes.success) {
        const fallbackMessage = securityRes.errCode === -604101
          ? '内容安全服务配置异常，请稍后重试'
          : '内容安全检测未通过，请调整后重试'

        return {
          success: false,
          errCode: securityRes.errCode || -1,
          errMsg: securityRes.errMsg || '',
          message: securityRes.message || fallbackMessage
        }
      }
    }
    
    await db.collection('reviews').doc(reviewId).update({
      data: { ...updateData, updated_at: db.serverDate() }
    })
    
    return { success: true, message: '更新成功' }
  } catch (err) {
    return { success: false, message: err.message }
  }
}
