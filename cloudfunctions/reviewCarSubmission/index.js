// 云函数：车型提交流审核
// 支持两类操作：
// 1. listPending: 获取待审核车型列表
// 2. review: 审核通过 / 拒绝某个车型提交
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

const DEFAULT_GLOBAL_AVERAGE_SCORE = 75
const PRIOR_SAMPLE_SIZE = 10

function roundToOneDecimal(value) {
  const numericValue = Number(value) || 0
  return Math.round(numericValue * 10) / 10
}

function getRankStatus(reviewCount) {
  const count = Number(reviewCount) || 0

  if (count >= 10) return 'official'
  if (count >= 3) return 'pending'
  return 'observation'
}

function computeRankScore(avgScore, reviewCount, globalAverageScore) {
  const R = Number(avgScore) || 0
  const v = Number(reviewCount) || 0
  const m = PRIOR_SAMPLE_SIZE
  const C = Number(globalAverageScore) || DEFAULT_GLOBAL_AVERAGE_SCORE
  const denominator = v + m

  if (denominator <= 0) {
    return roundToOneDecimal(C)
  }

  return roundToOneDecimal((v / denominator) * R + (m / denominator) * C)
}

async function isAdmin(openid = '') {
  if (!openid) return false

  try {
    const res = await db.collection('admin_users')
      .where({
        _openid: openid,
        status: 'active'
      })
      .limit(1)
      .get()

    return (res.data || []).length > 0
  } catch (err) {
    console.warn('读取 admin_users 失败，按无权限处理:', err.message)
    return false
  }
}

async function findLinkedReview(carId = '', submissionId = '') {
  if (submissionId) {
    const reviewRes = await db.collection('reviews')
      .where({ submission_id: submissionId })
      .limit(1)
      .get()

    const bySubmissionId = (reviewRes.data || [])[0] || null
    if (bySubmissionId) return bySubmissionId
  }

  if (!carId) return null

  const fallbackRes = await db.collection('reviews')
    .where({ car_id: carId })
    .orderBy('created_at', 'desc')
    .limit(1)
    .get()

  return (fallbackRes.data || [])[0] || null
}

async function getGlobalAverageScore(carId, currentAvgScore, currentReviewCount) {
  const aggregateRes = await db.collection('cars')
    .aggregate()
    .match({
      _id: _.neq(carId),
      review_count: _.gt(0),
      avg_score: _.gt(0),
      status: 'approved'
    })
    .group({
      _id: null,
      carCount: $.sum(1),
      averageScore: $.avg('$avg_score')
    })
    .end()

  const stats = aggregateRes.list[0]
  const otherCarsCount = Number(stats?.carCount) || 0
  const otherCarsAverage = Number(stats?.averageScore) || 0

  if ((Number(currentReviewCount) || 0) > 0) {
    if (otherCarsCount > 0) {
      return roundToOneDecimal(((otherCarsAverage * otherCarsCount) + currentAvgScore) / (otherCarsCount + 1))
    }
    return roundToOneDecimal(currentAvgScore || DEFAULT_GLOBAL_AVERAGE_SCORE)
  }

  if (otherCarsCount > 0) {
    return roundToOneDecimal(otherCarsAverage)
  }

  return DEFAULT_GLOBAL_AVERAGE_SCORE
}

async function applyFallbackScoreFromReview(carId = '', review = null) {
  if (!carId || !review) return

  const avgScore = roundToOneDecimal(review.total_score || 0)
  const reviewCount = avgScore > 0 ? 1 : 0
  const globalAverageScore = await getGlobalAverageScore(carId, avgScore, reviewCount)
  const rankScore = computeRankScore(avgScore, reviewCount, globalAverageScore)
  const rankStatus = getRankStatus(reviewCount)

  await db.collection('cars').doc(carId).update({
    data: {
      avg_score: avgScore,
      review_count: reviewCount,
      rank_score: rankScore,
      rank_status: rankStatus,
      score_power: roundToOneDecimal(review.score_power || 0),
      score_handling: roundToOneDecimal(review.score_handling || 0),
      score_space: roundToOneDecimal(review.score_space || 0),
      score_adas: roundToOneDecimal(review.score_adas || 0),
      score_other: roundToOneDecimal(review.score_other || 0),
      updated_at: db.serverDate()
    }
  })
}

exports.main = async (event) => {
  const { action = 'listPending', carId = '', decision = '', rejectReason = '' } = event
  const { OPENID } = cloud.getWXContext()

  if (!(await isAdmin(OPENID))) {
    return {
      success: false,
      message: '无管理员权限'
    }
  }

  try {
    if (action === 'listPending') {
      const carRes = await db.collection('cars')
        .where({ status: 'pending' })
        .orderBy('submitted_at', 'desc')
        .limit(100)
        .get()

      const cars = carRes.data || []
      const submissionIds = cars
        .map(item => item.submission_id)
        .filter(Boolean)
      let reviewMap = {}

      if (submissionIds.length > 0) {
        const reviewRes = await db.collection('reviews')
          .where({
            submission_id: db.command.in(submissionIds)
          })
          .get()

        reviewMap = (reviewRes.data || []).reduce((acc, item) => {
          acc[item.submission_id] = item
          return acc
        }, {})
      }

      return {
        success: true,
        data: cars.map(item => ({
          ...item,
          pending_review: reviewMap[item.submission_id] || null
        }))
      }
    }

    if (action === 'review') {
      if (!carId) {
        return { success: false, message: 'carId不能为空' }
      }

      if (!['approve', 'reject'].includes(decision)) {
        return { success: false, message: 'decision 必须为 approve 或 reject' }
      }

      const carRes = await db.collection('cars').doc(carId).get()
      const car = carRes.data || {}
      const linkedReview = await findLinkedReview(carId, car.submission_id || '')
      const nextStatus = decision === 'approve' ? 'approved' : 'rejected'
      const updateData = {
        status: nextStatus,
        reviewed_at: db.serverDate(),
        reviewed_by: OPENID,
        updated_at: db.serverDate()
      }

      if (decision === 'approve') {
        updateData.approved_at = db.serverDate()
        updateData.approved_by = OPENID
        updateData.rejected_reason = ''
        // 如果用户在提交车型时一并上传了图片，审核通过时再写入正式封面图。
        if (!car.image_url && car.pending_image_url) {
          updateData.image_url = car.pending_image_url
          updateData.image_status = 'approved'
        }
      } else {
        updateData.rejected_reason = String(rejectReason || '').trim()
      }

      await db.collection('cars').doc(carId).update({
        data: updateData
      })

      if (linkedReview) {
        const reviewUpdateData = {
          status: nextStatus,
          audit_locked: decision !== 'approve',
          updated_at: db.serverDate(),
          reject_reason: decision === 'reject' ? String(rejectReason || '').trim() : ''
        }

        await db.collection('reviews').doc(linkedReview._id).update({
          data: reviewUpdateData
        })
      }

      if (decision === 'approve') {
        const scoreRes = await cloud.callFunction({
          name: 'updateCarScore',
          data: {
            carId,
            forceApprovedReviewId: linkedReview?._id || '',
            forceApprovedReview: linkedReview
              ? {
                  _id: linkedReview._id,
                  car_id: linkedReview.car_id,
                  status: 'approved',
                  total_score: linkedReview.total_score,
                  score_power: linkedReview.score_power,
                  score_handling: linkedReview.score_handling,
                  score_space: linkedReview.score_space,
                  score_adas: linkedReview.score_adas,
                  score_other: linkedReview.score_other
                }
              : null
          }
        })

        const updateScoreResult = scoreRes.result || {}
        if (!updateScoreResult.success || Number(updateScoreResult.review_count) === 0) {
          if (linkedReview) {
            await applyFallbackScoreFromReview(carId, linkedReview)
          }
        }
      }

      return {
        success: true,
        status: nextStatus
      }
    }

    return {
      success: false,
      message: '不支持的 action'
    }
  } catch (err) {
    console.error('reviewCarSubmission 云函数执行失败:', err)
    return {
      success: false,
      message: err.message || '审核失败'
    }
  }
}
