const app = getApp()

Page({
  data: {
    loading: true,
    pendingCars: []
  },

  onLoad() {
    if (!app.isAdmin || !app.isAdmin()) {
      wx.showModal({
        title: '无权限访问',
        content: '当前账号不是管理员，无法打开审核中心。',
        showCancel: false,
        success: () => {
          wx.switchTab({
            url: '/pages/myReviews/myReviews'
          })
        }
      })
      return
    }

    this.loadPendingCars()
  },

  onShow() {
    if (app.isAdmin && app.isAdmin()) {
      this.loadPendingCars()
    }
  },

  onPullDownRefresh() {
    this.loadPendingCars().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  formatTime(date) {
    if (!date) return ''
    const d = new Date(date)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}`
  },

  async processImageUrls(cars) {
    const cloudFileIDs = [...new Set(
      cars
        .flatMap(item => [item.pendingImageUrl, item.currentImageUrl])
        .filter(url => url && url.startsWith('cloud://'))
    )]

    if (cloudFileIDs.length === 0) {
      return cars
    }

    try {
      const tempRes = await wx.cloud.getTempFileURL({
        fileList: cloudFileIDs
      })

      const urlMap = {}
      tempRes.fileList.forEach(item => {
        if (item.fileID && item.tempFileURL) {
          urlMap[item.fileID] = item.tempFileURL
        }
      })

      return cars.map(car => ({
        ...car,
        previewImageUrl: car.pendingImageUrl && car.pendingImageUrl.startsWith('cloud://')
          ? (urlMap[car.pendingImageUrl] || '')
          : (car.pendingImageUrl || ''),
        currentPreviewImageUrl: car.currentImageUrl && car.currentImageUrl.startsWith('cloud://')
          ? (urlMap[car.currentImageUrl] || '')
          : (car.currentImageUrl || '')
      }))
    } catch (err) {
      console.error('审核页转换图片失败:', err)
      return cars
    }
  },

  getTaskTimestamp(item = {}) {
    const source = item.updated_at || item.submitted_at || item.created_at || Date.now()
    return new Date(source).getTime()
  },

  async loadPendingCars() {
    this.setData({ loading: true })

    try {
      const [submissionRes, imageRes] = await Promise.all([
        wx.cloud.callFunction({
          name: 'reviewCarSubmission',
          data: {
            action: 'listPending'
          }
        }),
        wx.cloud.callFunction({
          name: 'updateCarImage',
          data: {
            action: 'listPending'
          }
        })
      ])

      if (!submissionRes.result || !submissionRes.result.success) {
        throw new Error(submissionRes.result?.message || '获取待审核车型失败')
      }

      if (!imageRes.result || !imageRes.result.success) {
        throw new Error(imageRes.result?.message || '获取待审核图片失败')
      }

      const carTasks = (submissionRes.result.data || []).map(item => ({
        id: item._id,
        taskType: 'car_submission',
        taskBadge: '整包审核',
        taskActionLabel: '通过并上榜',
        taskRejectLabel: '拒绝整包',
        taskDesc: '审核通过后，车型、评分、首评与提交图片会一起公开展示。',
        brand: item.brand,
        modelName: item.model_name,
        modelYear: item.model_year,
        powerType: item.power_type,
        priceRange: item.price_range,
        submittedAt: this.formatTime(item.submitted_at || item.created_at),
        timestamp: this.getTaskTimestamp(item),
        submittedBy: item.submitted_by || item.created_by || '',
        currentImageUrl: '',
        pendingImageUrl: item.pending_image_url || '',
        hasPendingImage: !!item.pending_image_url,
        pendingReview: item.pending_review ? {
          reviewerName: item.pending_review.user_nickname || '未命名用户',
          totalScore: Math.round(Number(item.pending_review.total_score) || 0),
          comment: item.pending_review.comment || '',
          submittedAt: this.formatTime(item.pending_review.created_at),
          dimensions: [
            { name: '动力', score: Number(item.pending_review.score_power) || 0 },
            { name: '操控', score: Number(item.pending_review.score_handling) || 0 },
            { name: '空间', score: Number(item.pending_review.score_space) || 0 },
            { name: '辅驾', score: Number(item.pending_review.score_adas) || 0 },
            { name: '其他', score: Number(item.pending_review.score_other) || 0 }
          ]
        } : null
      }))

      const imageTasks = (imageRes.result.data || []).map(item => ({
        id: item._id,
        taskType: 'image_submission',
        taskBadge: '图片审核',
        taskActionLabel: '通过图片',
        taskRejectLabel: '拒绝图片',
        taskDesc: '该车型已在榜单展示中，本次只审核这一张用户补充图片，队列中的每张图都会单独处理。',
        carId: item.car_id,
        brand: item.brand,
        modelName: item.model_name,
        modelYear: item.model_year,
        powerType: item.power_type,
        priceRange: item.price_range,
        submittedAt: this.formatTime(item.submitted_at || item.created_at),
        timestamp: this.getTaskTimestamp(item),
        submittedBy: item.submitted_by || '',
        currentImageUrl: item.current_image_url || '',
        pendingImageUrl: item.pending_image_url || item.image_url || '',
        hasPendingImage: !!(item.pending_image_url || item.image_url),
        pendingReview: null
      }))

      const cars = [...carTasks, ...imageTasks]
        .sort((a, b) => b.timestamp - a.timestamp)

      const processedCars = await this.processImageUrls(cars)

      this.setData({
        loading: false,
        pendingCars: processedCars
      })
    } catch (err) {
      console.error('加载待审核任务失败:', err)
      this.setData({ loading: false })
      wx.showToast({
        title: err.message || '加载失败',
        icon: 'none'
      })
    }
  },

  previewImage(e) {
    const { url } = e.currentTarget.dataset
    if (!url) return

    wx.previewImage({
      current: url,
      urls: [url]
    })
  },

  approveCar(e) {
    const { id, name, type } = e.currentTarget.dataset
    const isImageTask = type === 'image_submission'

    wx.showModal({
      title: '确认通过',
      content: isImageTask
        ? `确认通过 ${name} 的待审核图片吗？通过后会替换当前正式封面图。`
        : `确认通过 ${name} 的整包提交吗？通过后，车型和首评都会公开展示。`,
      confirmColor: '#22a568',
      success: (res) => {
        if (res.confirm) {
          this.reviewCar(id, type, 'approve')
        }
      }
    })
  },

  rejectCar(e) {
    const { id, name, type } = e.currentTarget.dataset
    const isImageTask = type === 'image_submission'

    wx.showModal({
      title: isImageTask ? '拒绝图片' : '拒绝提交',
      content: `请输入拒绝 ${name} 的原因`,
      editable: true,
      placeholderText: isImageTask
        ? '例如：图片模糊、构图不清晰、与车型不符'
        : '例如：车型命名不规范、缺少关键信息',
      confirmColor: '#ff6b35',
      success: (res) => {
        if (!res.confirm) return
        this.reviewCar(
          id,
          type,
          'reject',
          res.content || (isImageTask ? '图片不符合展示要求，请重新提交' : '信息不完整，请补充后重新提交')
        )
      }
    })
  },

  async reviewCar(taskId, taskType, decision, rejectReason = '') {
    wx.showLoading({
      title: decision === 'approve' ? '通过中...' : '拒绝中...'
    })

    try {
      const isImageTask = taskType === 'image_submission'
      const res = await wx.cloud.callFunction(
        isImageTask
          ? {
              name: 'updateCarImage',
              data: {
                submissionId: taskId,
                action: decision === 'approve' ? 'approve' : 'reject',
                rejectReason
              }
            }
          : {
              name: 'reviewCarSubmission',
              data: {
                action: 'review',
                carId: taskId,
                decision,
                rejectReason
              }
            }
      )

      if (!res.result || !res.result.success) {
        throw new Error(res.result?.message || '审核操作失败')
      }

      wx.showToast({
        title: decision === 'approve' ? '已通过' : '已拒绝',
        icon: 'success'
      })

      this.loadPendingCars()
    } catch (err) {
      console.error('审核任务失败:', err)
      wx.showToast({
        title: err.message || '审核失败',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
    }
  }
})
