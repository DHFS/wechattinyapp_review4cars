const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

function chunkArray(list = [], size = 20) {
  const chunks = []
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size))
  }
  return chunks
}

function sortReviewsByCreatedAtDesc(list = []) {
  return [...list].sort((a, b) => {
    const timeA = new Date(a.created_at || 0).getTime()
    const timeB = new Date(b.created_at || 0).getTime()
    return timeB - timeA
  })
}

async function loadReviewsBySubmissionIds(submissionIds = []) {
  if (!submissionIds.length) return []

  const batches = chunkArray([...new Set(submissionIds.filter(Boolean))], 20)
  const results = await Promise.all(
    batches.map(ids => db.collection('reviews').where({
      submission_id: _.in(ids)
    }).get())
  )

  return results.flatMap(batch => batch.data || [])
}

async function loadOwnedReviews(openid = '') {
  const [legacyReviewsRes, ownerReviewsRes, submittedCarsRes] = await Promise.all([
    db.collection('reviews').where({ _openid: openid }).get(),
    db.collection('reviews').where({ owner_openid: openid }).get(),
    db.collection('cars').where({ submitted_by: openid }).get()
  ])

  const submissionIds = (submittedCarsRes.data || [])
    .map(item => item.submission_id)
    .filter(Boolean)
  const linkedSubmissionReviews = await loadReviewsBySubmissionIds(submissionIds)

  const reviewMap = {}
  ;[...(legacyReviewsRes.data || []), ...(ownerReviewsRes.data || []), ...linkedSubmissionReviews]
    .forEach(item => {
      if (item && item._id) {
        reviewMap[item._id] = item
      }
    })

  return sortReviewsByCreatedAtDesc(Object.values(reviewMap))
}

async function loadCarsByIds(carIds = []) {
  if (!carIds.length) return {}

  const batches = chunkArray([...new Set(carIds.filter(Boolean))], 20)
  const results = await Promise.all(
    batches.map(ids => db.collection('cars').where({
      _id: _.in(ids)
    }).get())
  )

  return results.reduce((acc, batch) => {
    ;(batch.data || []).forEach(item => {
      acc[item._id] = item
    })
    return acc
  }, {})
}

function buildReviewItem(review, carMap) {
  const car = review.car_id ? carMap[review.car_id] : null

  return {
    _id: review._id,
    car_id: review.car_id || '',
    user_avatar: review.user_avatar || '',
    user_nickname: review.user_nickname || '',
    image_url: car?.image_url || car?.pending_image_url || '',
    brand: car?.brand || review.car_brand || '未知品牌',
    model_name: car?.model_name || review.car_model_name || '未知车型',
    model_year: car?.model_year || review.car_model_year || '',
    power_type: car?.power_type || review.car_power_type || '纯电',
    price_range: car?.price_range || review.car_price_range || '',
    review_status: review.status || 'approved',
    reject_reason: review.reject_reason || '',
    car_status: car?.status || '',
    car_rejected_reason: car?.rejected_reason || '',
    total_score: Number(review.total_score) || 0,
    comment: review.comment || '',
    score_power: Number(review.score_power) || 0,
    score_handling: Number(review.score_handling) || 0,
    score_space: Number(review.score_space) || 0,
    score_adas: Number(review.score_adas) || 0,
    score_other: Number(review.score_other) || 0,
    created_at: review.created_at,
    updated_at: review.updated_at
  }
}

function getReviewDisplayPriority(review = {}) {
  const reviewStatus = review.review_status || 'approved'
  const carStatus = review.car_status || ''

  if (reviewStatus === 'pending' || carStatus === 'pending') return 0
  if (reviewStatus === 'rejected' || carStatus === 'rejected') return 1
  return 2
}

function sortReviewItemsForDisplay(list = []) {
  return [...list].sort((a, b) => {
    const priorityDiff = getReviewDisplayPriority(a) - getReviewDisplayPriority(b)
    if (priorityDiff !== 0) {
      return priorityDiff
    }

    const timeA = new Date(a.created_at || 0).getTime()
    const timeB = new Date(b.created_at || 0).getTime()
    return timeB - timeA
  })
}

exports.main = async (event) => {
  const { action = 'list', page = 0, pageSize = 20 } = event
  const { OPENID } = cloud.getWXContext()

  if (!OPENID) {
    return {
      success: false,
      message: '未登录'
    }
  }

  try {
    if (action === 'stats') {
      const reviews = await loadOwnedReviews(OPENID)
      const reviewCount = reviews.length
      const avgScore = reviewCount > 0
        ? Math.round(reviews.reduce((sum, item) => sum + (Number(item.total_score) || 0), 0) / reviewCount)
        : 0

      return {
        success: true,
        reviewCount,
        avgScore: String(avgScore || 0)
      }
    }

    const safePage = Math.max(0, Number(page) || 0)
    const safePageSize = Math.min(50, Math.max(1, Number(pageSize) || 20))
    const allOwnedReviews = await loadOwnedReviews(OPENID)
    const startIndex = safePage * safePageSize
    const reviews = allOwnedReviews.slice(startIndex, startIndex + safePageSize)
    const carIds = reviews.map(item => item.car_id).filter(Boolean)
    const carMap = await loadCarsByIds(carIds)
    const reviewItems = sortReviewItemsForDisplay(reviews.map(item => buildReviewItem(item, carMap)))

    return {
      success: true,
      data: reviewItems,
      hasMore: startIndex + safePageSize < allOwnedReviews.length
    }
  } catch (err) {
    console.error('getMyReviews 执行失败:', err)
    return {
      success: false,
      message: err.message || '获取失败'
    }
  }
}
