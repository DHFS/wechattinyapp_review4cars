// 云函数：提交“新增车型 + 首评”审核包
// 用户在完成新增车型、打分、写评论后，一次性写入 cars/reviews 两条 pending 数据。
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

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
    console.error('submitPendingCarReview 调用内容安全检测失败:', err)
    return {
      success: false,
      message: '内容安全检测失败，请稍后重试'
    }
  }
}

exports.main = async (event) => {
  const {
    carDraft = {},
    reviewDraft = {}
  } = event

  const { OPENID } = cloud.getWXContext()

  if (!OPENID) {
    return { success: false, message: '未登录' }
  }

  const brand = String(carDraft.brand || '').trim()
  const modelName = String(carDraft.model || '').trim()
  const modelYear = String(carDraft.year || '').trim()
  const powerType = String(carDraft.powerType || '').trim()
  const priceRange = String(carDraft.price || '').trim()
  const pendingImageUrl = String(carDraft.imageUrl || '').trim()
  const comment = String(reviewDraft.comment || '').trim()
  const calculatedScore = Number(reviewDraft.totalScore) || 0

  if (!brand || !modelName || !modelYear || !powerType || !priceRange) {
    return { success: false, message: '车型信息不完整' }
  }

  if (!comment) {
    return { success: false, message: '评价内容不能为空' }
  }

  try {
    const securityRes = await checkReviewContentSecurity(
      `${brand} ${modelName}`.trim(),
      comment
    )

    if (!securityRes.success) {
      const fallbackMessage = securityRes.errCode === -604101
        ? '内容安全服务配置异常，请稍后重试'
        : '内容安全检测未通过，请调整后重试'

      return {
        success: false,
        code: 'CONTENT_SECURITY_REJECTED',
        errCode: securityRes.errCode || -1,
        errMsg: securityRes.errMsg || '',
        message: securityRes.message || fallbackMessage
      }
    }

    const existingRes = await db.collection('cars')
      .where({
        brand,
        model_name: modelName,
        model_year: modelYear,
        status: _.in(['pending', 'approved'])
      })
      .limit(1)
      .get()

    if ((existingRes.data || []).length > 0) {
      const existingCar = existingRes.data[0]
      return {
        success: false,
        code: 'CAR_ALREADY_EXISTS',
        status: existingCar.status || '',
        carId: existingCar._id,
        message: existingCar.status === 'approved'
          ? '车型已存在并已公开'
          : '车型正在审核中，请勿重复提交'
      }
    }

    const submissionId = `submission_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

    const carAddRes = await db.collection('cars').add({
      data: {
        brand,
        model_name: modelName,
        model_year: modelYear,
        power_type: powerType,
        price_range: priceRange,
        image_url: '',
        pending_image_url: pendingImageUrl,
        image_status: pendingImageUrl ? 'pending' : 'none',
        avg_score: 0,
        review_count: 0,
        rank_score: 0,
        rank_status: 'observation',
        score_power: 0,
        score_handling: 0,
        score_space: 0,
        score_adas: 0,
        score_other: 0,
        status: 'pending',
        submission_id: submissionId,
        submitted_at: db.serverDate(),
        submitted_by: OPENID,
        rejected_reason: '',
        created_at: db.serverDate(),
        created_by: OPENID,
        updated_at: db.serverDate()
      }
    })

    const carId = carAddRes._id

    const reviewAddRes = await db.collection('reviews').add({
      data: {
        car_id: carId,
        owner_openid: OPENID,
        car_brand: brand,
        car_model_name: modelName,
        car_model_year: modelYear,
        car_power_type: powerType,
        car_price_range: priceRange,
        user_avatar: reviewDraft.userAvatar || '',
        user_nickname: reviewDraft.userNickname || '',
        score_power: Number(reviewDraft.scorePower) || 0,
        score_handling: Number(reviewDraft.scoreHandling) || 0,
        score_space: Number(reviewDraft.scoreSpace) || 0,
        score_adas: Number(reviewDraft.scoreAdas) || 0,
        score_other: Number(reviewDraft.scoreOther) || 0,
        total_score: calculatedScore,
        comment,
        status: 'pending',
        audit_locked: true,
        submission_type: 'new_car_first_review',
        submission_id: submissionId,
        reject_reason: '',
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    })

    return {
      success: true,
      carId,
      reviewId: reviewAddRes._id,
      submissionId
    }
  } catch (err) {
    console.error('submitPendingCarReview 失败:', err)
    return {
      success: false,
      message: err.message || '提交失败'
    }
  }
}
