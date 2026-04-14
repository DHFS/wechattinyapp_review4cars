// 云函数：更新车型平均分、贝叶斯排名分与榜单状态
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

// 当前项目使用 100 分制，因此这里使用 75 分作为 7.5 分的等价兜底值。
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

  const rankScore = (v / denominator) * R + (m / denominator) * C
  return roundToOneDecimal(rankScore)
}

// 待审核/已拒绝评价不能进入公开榜单，因此这里只统计公开生效的评价。
async function getCurrentCarReviewStats(carId, forceApprovedReviewId = '', forceApprovedReview = null) {
  const res = await db.collection('reviews')
    .where({ car_id: carId })
    .get()

  const reviews = [...(res.data || [])]

  // 某些审核通过后的跨云函数读取存在短暂延迟，可能导致最新首评暂时还查不到。
  // 这里允许调用方把“刚通过的那条评价完整数据”直接带进来，确保首页分数能立即生效。
  if (forceApprovedReview && forceApprovedReview._id) {
    const exists = reviews.some(item => item._id === forceApprovedReview._id)
    if (!exists) {
      reviews.push({
        ...forceApprovedReview,
        status: 'approved'
      })
    }
  }

  const effectiveReviews = reviews.filter(item => {
    if (!item.status || item.status === 'approved') {
      return true
    }

    // 管理员刚审核通过首评时，数据库状态可能还没完全反映到后续读取。
    // 这里允许调用方显式指定一条“本次应计入”的评价，避免新车型首页分数仍为 0。
    if (forceApprovedReviewId && item._id === forceApprovedReviewId) {
      return true
    }

    return false
  })

  if (effectiveReviews.length === 0) {
    return null
  }

  const reviewCount = effectiveReviews.length
  const avg = (field) => effectiveReviews.reduce((sum, item) => sum + (Number(item[field]) || 0), 0) / reviewCount

  return {
    reviewCount,
    avgTotal: avg('total_score'),
    avgPower: avg('score_power'),
    avgHandling: avg('score_handling'),
    avgSpace: avg('score_space'),
    avgAdas: avg('score_adas'),
    avgOther: avg('score_other')
  }
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
      const mergedAverage = ((otherCarsAverage * otherCarsCount) + currentAvgScore) / (otherCarsCount + 1)
      return roundToOneDecimal(mergedAverage)
    }
    return roundToOneDecimal(currentAvgScore || DEFAULT_GLOBAL_AVERAGE_SCORE)
  }

  if (otherCarsCount > 0) {
    return roundToOneDecimal(otherCarsAverage)
  }

  return DEFAULT_GLOBAL_AVERAGE_SCORE
}

exports.main = async (event) => {
  const { carId, forceApprovedReviewId = '', forceApprovedReview = null } = event

  if (!carId) {
    return { success: false, message: 'carId不能为空' }
  }

  try {
    const reviewStats = await getCurrentCarReviewStats(carId, forceApprovedReviewId, forceApprovedReview)
    const reviewCount = Number(reviewStats?.reviewCount) || 0
    const avgScore = roundToOneDecimal(reviewStats?.avgTotal || 0)
    const avgPower = roundToOneDecimal(reviewStats?.avgPower || 0)
    const avgHandling = roundToOneDecimal(reviewStats?.avgHandling || 0)
    const avgSpace = roundToOneDecimal(reviewStats?.avgSpace || 0)
    const avgAdas = roundToOneDecimal(reviewStats?.avgAdas || 0)
    const avgOther = roundToOneDecimal(reviewStats?.avgOther || 0)
    const globalAverageScore = await getGlobalAverageScore(carId, avgScore, reviewCount)
    const rankScore = computeRankScore(avgScore, reviewCount, globalAverageScore)
    const rankStatus = getRankStatus(reviewCount)

    await db.collection('cars').doc(carId).update({
      data: {
        avg_score: avgScore,
        review_count: reviewCount,
        rank_score: rankScore,
        rank_status: rankStatus,
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
      avg_score: avgScore,
      review_count: reviewCount,
      rank_score: rankScore,
      rank_status: rankStatus,
      global_average_score: globalAverageScore
    }
  } catch (err) {
    console.error('更新车型平均分失败:', err)
    return { success: false, message: err.message }
  }
}
