// 云函数：车型图片更新与审核
// 目标：
// 1. 普通用户上传图片时进入独立待审核队列，不再覆盖上一张待审核图
// 2. 管理员在统一审核中心逐条通过/拒绝，只有通过的图片才会成为正式图
// 3. 所有敏感动作都在云端做管理员白名单校验
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

const DAILY_UPLOAD_LIMIT = 10
const IMAGE_SUBMISSIONS_COLLECTION = 'image_submissions'

function getCarsCollection() {
  return db.collection('cars')
}

function getImageSubmissionsCollection() {
  return db.collection(IMAGE_SUBMISSIONS_COLLECTION)
}

async function isAdminOpenid(openid = '') {
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
    console.warn('读取 admin_users 失败，按非管理员处理:', err.message)
    return false
  }
}

async function countTodayUploads(openid = '') {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

  const res = await db.collection('upload_logs')
    .where({
      _openid: openid,
      upload_date: _.gte(todayStart).and(_.lte(todayEnd))
    })
    .count()

  return res.total || 0
}

async function recordUploadLog({ openid, carId, imageUrl, mode }) {
  await db.collection('upload_logs').add({
    data: {
      _openid: openid,
      car_id: carId,
      image_url: imageUrl,
      mode: mode || 'submit',
      upload_date: db.serverDate(),
      created_at: db.serverDate()
    }
  })
}

async function deleteCloudFiles(fileIds = []) {
  const safeFileIds = [...new Set(
    fileIds.filter(fileId => typeof fileId === 'string' && fileId.startsWith('cloud://'))
  )]

  if (safeFileIds.length === 0) return

  try {
    await cloud.deleteFile({
      fileList: safeFileIds
    })
  } catch (err) {
    console.warn('删除云存储图片失败:', err.message)
  }
}

async function getPendingSummary(carId = '') {
  if (!carId) {
    return {
      pendingCount: 0,
      latestPending: null
    }
  }

  const imageSubmissions = getImageSubmissionsCollection()
  const [countRes, latestRes] = await Promise.all([
    imageSubmissions.where({
      car_id: carId,
      status: 'pending'
    }).count(),
    imageSubmissions.where({
      car_id: carId,
      status: 'pending'
    }).orderBy('created_at', 'desc').limit(1).get()
  ])

  return {
    pendingCount: countRes.total || 0,
    latestPending: (latestRes.data || [])[0] || null
  }
}

async function syncCarPendingState(carId = '', baseCar = null) {
  if (!carId) {
    return {
      pendingCount: 0,
      latestPending: null
    }
  }

  const cars = getCarsCollection()
  const car = baseCar || (await cars.doc(carId).get()).data
  const { pendingCount, latestPending } = await getPendingSummary(carId)

  const updateData = {
    pending_image_count: pendingCount,
    pending_image: latestPending ? latestPending.image_url : '',
    pending_image_url: latestPending ? latestPending.image_url : '',
    image_status: pendingCount > 0 ? 'reviewing' : 'normal',
    updated_at: db.serverDate()
  }

  if (latestPending && latestPending.submitted_by) {
    updateData.last_uploader_openid = latestPending.submitted_by
  } else if (!pendingCount && car && !car.image_url) {
    updateData.last_uploader_openid = ''
  }

  await cars.doc(carId).update({
    data: updateData
  })

  return {
    pendingCount,
    latestPending
  }
}

async function getPendingSubmissionByIdOrCar(submissionId = '', carId = '') {
  const imageSubmissions = getImageSubmissionsCollection()

  if (submissionId) {
    const submissionRes = await imageSubmissions.doc(submissionId).get()
    return submissionRes.data || null
  }

  if (!carId) return null

  const latestRes = await imageSubmissions.where({
    car_id: carId,
    status: 'pending'
  }).orderBy('created_at', 'desc').limit(1).get()

  return (latestRes.data || [])[0] || null
}

exports.main = async (event) => {
  const {
    carId = '',
    submissionId = '',
    imageUrl = '',
    action = 'submit'
  } = event

  const { OPENID } = cloud.getWXContext()

  if (!OPENID) {
    return {
      success: false,
      code: 401,
      msg: '未登录',
      message: '未登录'
    }
  }

  const cars = getCarsCollection()
  const imageSubmissions = getImageSubmissionsCollection()

  if (action === 'listPending') {
    const isAdmin = await isAdminOpenid(OPENID)
    if (!isAdmin) {
      return {
        success: false,
        code: 403,
        msg: '仅管理员可操作',
        message: '仅管理员可操作'
      }
    }

    try {
      const pendingRes = await imageSubmissions.where({
        status: 'pending'
      }).orderBy('created_at', 'desc').limit(100).get()

      const submissions = pendingRes.data || []
      const carIds = [...new Set(submissions.map(item => item.car_id).filter(Boolean))]

      if (carIds.length === 0) {
        return {
          success: true,
          code: 0,
          data: []
        }
      }

      const carRes = await cars.where({
        _id: _.in(carIds),
        status: 'approved'
      }).get()

      const carMap = {}
      ;(carRes.data || []).forEach(item => {
        carMap[item._id] = item
      })

      const data = submissions
        .map(item => {
          const car = carMap[item.car_id]
          if (!car) return null

          return {
            _id: item._id,
            car_id: item.car_id,
            brand: car.brand,
            model_name: car.model_name,
            model_year: car.model_year,
            power_type: car.power_type,
            price_range: car.price_range,
            image_url: item.image_url || '',
            pending_image_url: item.image_url || '',
            current_image_url: car.image_url || '',
            submitted_by: item.submitted_by || '',
            submitted_at: item.submitted_at || item.created_at || '',
            created_at: item.created_at || '',
            updated_at: item.updated_at || item.created_at || ''
          }
        })
        .filter(Boolean)

      return {
        success: true,
        code: 0,
        data
      }
    } catch (err) {
      console.error('获取待审核图片列表失败:', err)
      return {
        success: false,
        code: 500,
        msg: err.message || '获取待审核图片失败',
        message: err.message || '获取待审核图片失败'
      }
    }
  }

  if (!carId && action !== 'approve' && action !== 'reject') {
    return {
      success: false,
      code: 400,
      msg: '缺少 carId',
      message: '缺少 carId'
    }
  }

  try {
    const isAdmin = await isAdminOpenid(OPENID)

    if (action === 'approve' || action === 'reject') {
      if (!isAdmin) {
        return {
          success: false,
          code: 403,
          msg: '仅管理员可操作',
          message: '仅管理员可操作'
        }
      }

      const submission = await getPendingSubmissionByIdOrCar(submissionId, carId)
      if (!submission || submission.status !== 'pending') {
        return {
          success: false,
          code: 400,
          msg: '当前没有待审核图片',
          message: '当前没有待审核图片'
        }
      }

      const targetCarId = submission.car_id
      const carRes = await cars.doc(targetCarId).get()
      const car = carRes.data || null

      if (!car) {
        return {
          success: false,
          code: 404,
          msg: '车型不存在',
          message: '车型不存在'
        }
      }

      const currentImageUrl = String(car.image_url || '').trim()

      if (action === 'reject') {
        const rejectMsg = String(event.rejectReason || '').trim()

        await imageSubmissions.doc(submission._id).update({
          data: {
            status: 'rejected',
            reject_reason: rejectMsg,
            reviewed_at: db.serverDate(),
            reviewed_by: OPENID,
            updated_at: db.serverDate()
          }
        })

        await deleteCloudFiles([submission.image_url])
        const { pendingCount } = await syncCarPendingState(targetCarId, car)

        return {
          success: true,
          code: 0,
          msg: '已拒绝',
          message: '已拒绝待审核图片',
          data: {
            image_status: pendingCount > 0 ? 'reviewing' : 'normal',
            image_url: currentImageUrl,
            pending_count: pendingCount
          }
        }
      }

      await imageSubmissions.doc(submission._id).update({
        data: {
          status: 'approved',
          reviewed_at: db.serverDate(),
          reviewed_by: OPENID,
          updated_at: db.serverDate()
        }
      })

      await cars.doc(targetCarId).update({
        data: {
          image_url: submission.image_url,
          image_rejected_reason: '',
          image_reviewed_at: db.serverDate(),
          image_reviewed_by: OPENID,
          last_uploader_openid: submission.submitted_by || OPENID,
          updated_at: db.serverDate()
        }
      })

      if (currentImageUrl && currentImageUrl !== submission.image_url) {
        await deleteCloudFiles([currentImageUrl])
      }

      const { pendingCount } = await syncCarPendingState(targetCarId)

      return {
        success: true,
        code: 0,
        msg: '审核通过',
        message: '审核通过，正式图片已更新',
        data: {
          image_status: pendingCount > 0 ? 'reviewing' : 'normal',
          image_url: submission.image_url,
          pending_count: pendingCount
        }
      }
    }

    const carRes = await cars.doc(carId).get()
    const car = carRes.data || null

    if (!car) {
      return {
        success: false,
        code: 404,
        msg: '车型不存在',
        message: '车型不存在'
      }
    }

    const currentImageUrl = String(car.image_url || '').trim()

    if (action === 'delete') {
      if (!isAdmin) {
        return {
          success: false,
          code: 403,
          msg: '仅管理员可操作',
          message: '仅管理员可操作'
        }
      }

      await cars.doc(carId).update({
        data: {
          image_url: '',
          image_reviewed_at: db.serverDate(),
          image_reviewed_by: OPENID,
          updated_at: db.serverDate()
        }
      })

      await deleteCloudFiles([currentImageUrl])
      const { pendingCount } = await syncCarPendingState(carId)

      return {
        success: true,
        code: 0,
        msg: '删除成功',
        message: '删除成功',
        data: {
          image_status: pendingCount > 0 ? 'reviewing' : 'normal',
          image_url: '',
          pending_count: pendingCount
        }
      }
    }

    if (!imageUrl || !String(imageUrl).startsWith('cloud://')) {
      return {
        success: false,
        code: 400,
        msg: '图片格式不正确',
        message: '图片格式不正确'
      }
    }

    if (action === 'submit') {
      const todayUploadCount = await countTodayUploads(OPENID)
      if (todayUploadCount >= DAILY_UPLOAD_LIMIT) {
        return {
          success: false,
          code: 'DAILY_LIMIT_REACHED',
          msg: `今日上传次数已用完（限制${DAILY_UPLOAD_LIMIT}张/天），请明天再试`,
          message: `今日上传次数已用完（限制${DAILY_UPLOAD_LIMIT}张/天），请明天再试`,
          todayUploadCount
        }
      }

      await imageSubmissions.add({
        data: {
          car_id: carId,
          image_url: imageUrl,
          status: 'pending',
          submitted_by: OPENID,
          submitted_at: db.serverDate(),
          created_at: db.serverDate(),
          updated_at: db.serverDate()
        }
      })

      const { pendingCount } = await syncCarPendingState(carId, car)

      await recordUploadLog({
        openid: OPENID,
        carId,
        imageUrl,
        mode: 'submit_review'
      })

      return {
        success: true,
        code: 0,
        msg: '提交成功',
        message: '图片已加入审核队列，审核通过后将替换正式展示图',
        data: {
          image_status: 'reviewing',
          image_url: currentImageUrl,
          pending_count: pendingCount,
          isAdmin: false
        }
      }
    }

    if (!isAdmin) {
      return {
        success: false,
        code: 403,
        msg: '仅管理员可操作',
        message: '仅管理员可操作'
      }
    }

    await cars.doc(carId).update({
      data: {
        image_url: imageUrl,
        image_rejected_reason: '',
        image_reviewed_at: db.serverDate(),
        image_reviewed_by: OPENID,
        last_uploader_openid: OPENID,
        updated_at: db.serverDate()
      }
    })

    if (currentImageUrl && currentImageUrl !== imageUrl) {
      await deleteCloudFiles([currentImageUrl])
    }

    const { pendingCount } = await syncCarPendingState(carId)

    await recordUploadLog({
      openid: OPENID,
      carId,
      imageUrl,
      mode: action === 'direct_upload' ? 'direct_upload' : 'admin_upload'
    })

    return {
      success: true,
      code: 0,
      msg: '更新成功',
      message: '正式图片已更新',
      data: {
        image_status: pendingCount > 0 ? 'reviewing' : 'normal',
        image_url: imageUrl,
        pending_count: pendingCount,
        isAdmin: true
      }
    }
  } catch (err) {
    console.error('updateCarImage 失败:', err)
    return {
      success: false,
      code: 500,
      msg: err.message || '更新失败',
      message: err.message || '更新失败'
    }
  }
}
