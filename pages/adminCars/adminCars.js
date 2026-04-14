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
        content: '当前账号不是管理员，无法打开车型审核台。',
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
    const cloudFileIDs = cars
      .map(item => item.pendingImageUrl)
      .filter(url => url && url.startsWith('cloud://'))

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
          : (car.pendingImageUrl || '')
      }))
    } catch (err) {
      console.error('审核页转换图片失败:', err)
      return cars
    }
  },

  async loadPendingCars() {
    this.setData({ loading: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'reviewCarSubmission',
        data: {
          action: 'listPending'
        }
      })

      if (!res.result || !res.result.success) {
        throw new Error(res.result?.message || '获取待审核车型失败')
      }

      const cars = (res.result.data || []).map(item => ({
        id: item._id,
        brand: item.brand,
        modelName: item.model_name,
        modelYear: item.model_year,
        powerType: item.power_type,
        priceRange: item.price_range,
        submittedAt: this.formatTime(item.submitted_at || item.created_at),
        submittedBy: item.submitted_by || item.created_by || '',
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

      const processedCars = await this.processImageUrls(cars)

      this.setData({
        loading: false,
        pendingCars: processedCars
      })
    } catch (err) {
      console.error('加载待审核车型失败:', err)
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
    const { id, name } = e.currentTarget.dataset

    wx.showModal({
      title: '确认通过',
      content: `确认通过 ${name} 的整包提交吗？通过后，车型和首评都会公开展示。`,
      confirmColor: '#22a568',
      success: (res) => {
        if (res.confirm) {
          this.reviewCar(id, 'approve')
        }
      }
    })
  },

  rejectCar(e) {
    const { id, name } = e.currentTarget.dataset

    wx.showModal({
      title: '拒绝提交',
      content: `请输入拒绝 ${name} 的原因`,
      editable: true,
      placeholderText: '例如：车型命名不规范、缺少关键信息',
      confirmColor: '#ff6b35',
      success: (res) => {
        if (!res.confirm) return
        this.reviewCar(id, 'reject', res.content || '信息不完整，请补充后重新提交')
      }
    })
  },

  async reviewCar(carId, decision, rejectReason = '') {
    wx.showLoading({
      title: decision === 'approve' ? '通过中...' : '拒绝中...'
    })

    try {
      const res = await wx.cloud.callFunction({
        name: 'reviewCarSubmission',
        data: {
          action: 'review',
          carId,
          decision,
          rejectReason
        }
      })

      if (!res.result || !res.result.success) {
        throw new Error(res.result?.message || '审核操作失败')
      }

      wx.showToast({
        title: decision === 'approve' ? '已通过' : '已拒绝',
        icon: 'success'
      })

      this.loadPendingCars()
    } catch (err) {
      console.error('审核车型失败:', err)
      wx.showToast({
        title: err.message || '审核失败',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
    }
  }
})
