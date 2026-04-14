Page({
  data: {
    // 车辆列表
    carList: [],
    // 加载状态
    loading: true,
    // 是否还有更多数据
    hasMore: true,
    // 当前页码
    page: 0,
    // 每页数量
    pageSize: 20
  },

  onLoad() {
    // 首次进入首页时只加载一次，避免 onLoad + onShow 双重请求。
    this._skipNextOnShowReload = true
    this.loadCarList({ reset: true })
  },

  onShow() {
    // 设置tabBar选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }

    // 首次 onShow 不重复请求；后续从详情页/添加页返回时再刷新。
    if (this._skipNextOnShowReload) {
      this._skipNextOnShowReload = false
      return
    }

    this.loadCarList({ reset: true })
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.setData({
      page: 0,
      hasMore: true
    })

    this.loadCarList({ reset: true }).then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 上拉加载更多
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore()
    }
  },

  // 从云数据库加载车辆列表
  async loadCarList(options = {}) {
    this.setData({ loading: true })
    
    const db = wx.cloud.database()
    const { pageSize } = this.data
    const reset = !!options.reset
    const page = reset ? 0 : this.data.page
    
    try {
      // 从云数据库获取已审核的车辆列表，按avg_score降序排列
      const res = await db.collection('cars')
        .where({ status: 'approved' })  // 只显示已审核的车型
        .orderBy('avg_score', 'desc')
        .skip(page * pageSize)
        .limit(pageSize)
        .get()
      
      // 处理数据格式，将数据库字段映射到页面字段
      const newList = await Promise.all(res.data.map(async (car) => {
        let reviewerAvatars = []
        const reviewCount = Number(car.review_count) || 0
        try {
          if (reviewCount > 0) {
            const reviewRes = await db.collection('reviews')
              .where({ car_id: car._id })
              .orderBy('created_at', 'desc')
              .limit(3)
              .get()

            reviewerAvatars = reviewRes.data
              .map(r => r.user_avatar)
              .filter(avatar => avatar && avatar.trim() !== '')
          }
        } catch (e) {
          console.error('获取评价头像失败:', e)
        }

        return {
          id: car._id,
          brand: car.brand,
          model: car.model_name,
          powerType: car.power_type,
          year: car.model_year,
          price: car.price_range,
          score: car.avg_score ? Math.round(car.avg_score).toString() : '0',
          count: car.review_count || 0,
          tagClass: this.getPowerTagClass(car.power_type),
          reviewerAvatars: reviewerAvatars,
          reviewCount: reviewCount,
          imageUrl: car.image_url || ''
        }
      }))
      
      // 批量处理卡片图片和头像 URL，避免每台车单独 getTempFileURL。
      const carListWithImages = await this.processCardMediaUrls(newList)
      
      // 检查是否还有更多数据
      const hasMore = carListWithImages.length === pageSize
      
      this.setData({
        page,
        carList: page === 0 ? carListWithImages : [...this.data.carList, ...carListWithImages],
        loading: false,
        hasMore: hasMore
      })
      
    } catch (err) {
      console.error('加载车辆列表失败:', err)
      this.setData({ loading: false })
      
      wx.showToast({
        title: '加载失败，请重试',
        icon: 'none'
      })
    }
  },

  // 加载更多数据
  loadMore() {
    this.setData({
      page: this.data.page + 1
    }, () => {
      this.loadCarList()
    })
  },

  getPowerTagClass(powerType) {
    switch (powerType) {
      case '增程':
        return 'tag-zengcheng'
      case '纯电':
        return 'tag-chundi'
      case '燃油':
        return 'tag-ranyou'
      case '插混':
        return 'tag-chahun'
      default:
        return 'tag-zengcheng'
    }
  },

  // 格式化数字（超过1000显示为1k）
  formatNumber(num) {
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + '万'
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k'
    }
    return num.toString()
  },

  // 批量处理卡片封面图和评价头像的 fileID 转换。
  async processCardMediaUrls(carList) {
    const cloudFileIDs = new Set()

    carList.forEach((car) => {
      if (car.imageUrl && car.imageUrl.startsWith('cloud://')) {
        cloudFileIDs.add(car.imageUrl)
      }

      ;(car.reviewerAvatars || []).forEach((avatarUrl) => {
        if (avatarUrl && avatarUrl.startsWith('cloud://')) {
          cloudFileIDs.add(avatarUrl)
        }
      })
    })

    if (cloudFileIDs.size === 0) {
      return carList
    }

    try {
      const tempRes = await wx.cloud.getTempFileURL({
        fileList: Array.from(cloudFileIDs)
      })

      const urlMap = {}
      tempRes.fileList.forEach(item => {
        if (item.fileID && item.tempFileURL) {
          urlMap[item.fileID] = item.tempFileURL
        }
      })

      return carList.map(car => ({
        ...car,
        imageUrl: car.imageUrl && car.imageUrl.startsWith('cloud://')
          ? (urlMap[car.imageUrl] || '')
          : car.imageUrl,
        reviewerAvatars: (car.reviewerAvatars || [])
          .map((avatarUrl) => {
            if (avatarUrl && avatarUrl.startsWith('cloud://')) {
              return urlMap[avatarUrl] || ''
            }
            return avatarUrl
          })
          .filter(Boolean)
      }))
    } catch (err) {
      console.error('批量转换首页媒体URL失败:', err)
      return carList
    }
  },

  // 点击卡片跳转详情
  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    })
  },

  // 跳转添加车型页面（需登录）
  goAddCar() {
    const app = getApp()
    const userInfo = app.globalData.userInfo || {}
    
    if (!app.isLoggedIn()) {
      wx.showModal({
        title: '需要登录',
        content: '添加车型需要先登录',
        showCancel: false,
        confirmText: '去登录',
        success: () => {
          wx.switchTab({ url: '/pages/myReviews/myReviews' })
        }
      })
      return
    }
    wx.navigateTo({ url: '/pages/addCar/addCar' })
  },

  // ============================================
  // 分享功能
  // ============================================
  
  // 分享给朋友/微信群
  onShareAppMessage() {
    return {
      title: '快来车评侦探，看看大家给这些车打了多少分！',
      path: '/pages/index/index',
      imageUrl: '' // 可选：自定义分享图片
    }
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: '快来车评侦探，看看大家给这些车打了多少分！',
      query: '',
      imageUrl: '' // 可选：自定义分享图片
    }
  }
})
