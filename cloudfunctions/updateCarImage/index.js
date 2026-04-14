// 云函数：车型图片更新与审核
// 目标：
// 1. 普通用户上传图片时只写入待审核图，不影响正式图
// 2. 管理员可直接上传正式图、审核通过待审核图、删除图片
// 3. 所有敏感动作都在云端做管理员白名单校验
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

const DAILY_UPLOAD_LIMIT = 10

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

function pickPendingImage(car = {}) {
  return String(car.pending_image || car.pending_image_url || '').trim()
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
  const safeFileIds = [...new Set(fileIds.filter(fileId => typeof fileId === 'string' && fileId.startsWith('cloud://')))]
  if (safeFileIds.length === 0) return

  try {
    await cloud.deleteFile({
      fileList: safeFileIds
    })
  } catch (err) {
    console.warn('删除云存储旧图片失败:', err.message)
  }
}

exports.main = async (event) => {
  const {
    carId = '',
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

  if (!carId) {
    return {
      success: false,
      code: 400,
      msg: '缺少 carId',
      message: '缺少 carId'
    }
  }

  try {
    const isAdmin = await isAdminOpenid(OPENID)
    const carRes = await db.collection('cars').doc(carId).get()
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
    const pendingImage = pickPendingImage(car)

    if (action === 'delete') {
      if (!isAdmin) {
        return {
          success: false,
          code: 403,
          msg: '仅管理员可操作',
          message: '仅管理员可操作'
        }
      }

      await db.collection('cars').doc(carId).update({
        data: {
          image_url: '',
          pending_image: '',
          pending_image_url: '',
          image_status: 'normal',
          updated_at: db.serverDate()
        }
      })

      await deleteCloudFiles([currentImageUrl, pendingImage])

      return {
        success: true,
        code: 0,
        msg: '删除成功',
        message: '删除成功',
        data: {
          image_status: 'normal',
          image_url: '',
          pending_image: ''
        }
      }
    }

    if (action === 'approve') {
      if (!isAdmin) {
        return {
          success: false,
          code: 403,
          msg: '仅管理员可操作',
          message: '仅管理员可操作'
        }
      }

      if (!pendingImage) {
        return {
          success: false,
          code: 400,
          msg: '当前没有待审核图片',
          message: '当前没有待审核图片'
        }
      }

      await db.collection('cars').doc(carId).update({
        data: {
          image_url: pendingImage,
          pending_image: '',
          pending_image_url: '',
          image_status: 'normal',
          last_uploader_openid: car.last_uploader_openid || OPENID,
          updated_at: db.serverDate()
        }
      })

      // 审核通过后删除旧正式图，节省云存储空间。
      if (currentImageUrl && currentImageUrl !== pendingImage) {
        await deleteCloudFiles([currentImageUrl])
      }

      return {
        success: true,
        code: 0,
        msg: '审核通过',
        message: '审核通过，正式图片已更新',
        data: {
          image_status: 'normal',
          image_url: pendingImage,
          pending_image: ''
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

    // 普通上传与管理员直传都记录上传日志；普通用户保留每日限制。
    if (!isAdmin) {
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

      await db.collection('cars').doc(carId).update({
        data: {
          pending_image: imageUrl,
          pending_image_url: imageUrl,
          image_status: 'reviewing',
          last_uploader_openid: OPENID,
          updated_at: db.serverDate()
        }
      })

      // 如果有旧待审核图且被新图替换，删除旧待审核文件，避免堆积。
      if (pendingImage && pendingImage !== imageUrl) {
        await deleteCloudFiles([pendingImage])
      }

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
        message: '图片已提交审核，审核通过后将替换正式展示图',
        data: {
          image_status: 'reviewing',
          image_url: currentImageUrl,
          pending_image: imageUrl,
          isAdmin: false
        }
      }
    }

    // 管理员直传正式图。
    await db.collection('cars').doc(carId).update({
      data: {
        image_url: imageUrl,
        pending_image: '',
        pending_image_url: '',
        image_status: 'normal',
        last_uploader_openid: OPENID,
        updated_at: db.serverDate()
      }
    })

    // 直传成功后清理旧图和旧待审核图。
    await deleteCloudFiles([
      currentImageUrl && currentImageUrl !== imageUrl ? currentImageUrl : '',
      pendingImage && pendingImage !== imageUrl ? pendingImage : ''
    ])

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
        image_status: 'normal',
        image_url: imageUrl,
        pending_image: '',
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
