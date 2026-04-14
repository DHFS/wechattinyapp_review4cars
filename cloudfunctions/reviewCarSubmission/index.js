// 云函数：车型提交流审核
// 支持两类操作：
// 1. listPending: 获取待审核车型列表
// 2. review: 审核通过 / 拒绝某个车型提交
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

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
      const linkedReviewRes = await db.collection('reviews')
        .where({
          submission_id: car.submission_id || '__no_submission_id__'
        })
        .limit(1)
        .get()
      const linkedReview = (linkedReviewRes.data || [])[0] || null
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
        await cloud.callFunction({
          name: 'updateCarScore',
          data: { carId }
        })
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
