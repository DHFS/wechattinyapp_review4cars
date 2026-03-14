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
    pageSize: 20,
    // 悬浮按钮显示状态
    showFab: true,
    // 上次滚动位置
    lastScrollTop: 0
  },

  // 隐藏悬浮按钮的定时器
  hideFabTimer: null,

  onLoad() {
    // 页面加载时从数据库获取数据
    this.loadCarList()
  },

  onShow() {
    // 页面显示时刷新数据（从添加车型页返回时）
    this.setData({ page: 0, hasMore: true }, () => {
      this.loadCarList()
    })
    // 设置tabBar选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.setData({
      page: 0,
      hasMore: true,
      carList: []
    }, () => {
      this.loadCarList().then(() => {
        wx.stopPullDownRefresh()
      })
    })
  },

  // 上拉加载更多
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore()
    }
  },

  // 从云数据库加载车辆列表
  async loadCarList() {
    this.setData({ loading: true })
    
    const db = wx.cloud.database()
    const { page, pageSize } = this.data
    
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
        // 获取动力类型对应的样式类
        let tagClass = ''
        switch (car.power_type) {
          case '增程':
            tagClass = 'tag-zengcheng'
            break
          case '纯电':
            tagClass = 'tag-chundi'
            break
          case '燃油':
            tagClass = 'tag-ranyou'
            break
          case '插混':
            tagClass = 'tag-chahun'
            break
          default:
            tagClass = 'tag-zengcheng'
        }
        
        // 获取该车型最新的3条评价的用户头像和总评价数
        let reviewerAvatars = []
        let reviewCount = car.review_count || 0
        try {
          const reviewRes = await db.collection('reviews')
            .where({ car_id: car._id })
            .orderBy('created_at', 'desc')
            .limit(3)
            .get()
          
          reviewerAvatars = reviewRes.data.map(r => r.user_avatar || '')
        } catch (e) {
          console.log('获取评价头像失败:', e)
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
          tagClass: tagClass,
          reviewerAvatars: reviewerAvatars,
          reviewCount: reviewCount
        }
      }))
      
      // 检查是否还有更多数据
      const hasMore = newList.length === pageSize
      
      this.setData({
        carList: page === 0 ? newList : [...this.data.carList, ...newList],
        loading: false,
        hasMore: hasMore
      })
      
      console.log('从数据库加载车辆成功:', newList.length, '条')
      
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

  // 监听页面滚动
  onPageScroll(e) {
    const { scrollTop } = e
    const { lastScrollTop, showFab } = this.data
    
    // 清除之前的定时器
    if (this.hideFabTimer) {
      clearTimeout(this.hideFabTimer)
    }
    
    // 判断滚动方向
    if (scrollTop > lastScrollTop && scrollTop > 100) {
      // 向下滚动，隐藏按钮
      if (showFab) {
        this.setData({ showFab: false })
      }
    } else if (scrollTop < lastScrollTop) {
      // 向上滚动，显示按钮
      if (!showFab) {
        this.setData({ showFab: true })
      }
    }
    
    // 更新上次滚动位置
    this.setData({ lastScrollTop: scrollTop })
    
    // 1.5秒后显示按钮
    this.hideFabTimer = setTimeout(() => {
      if (!this.data.showFab) {
        this.setData({ showFab: true })
      }
    }, 1500)
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

  // 点击卡片跳转详情
  goDetail(e) {
    const id = e.currentTarget.dataset.id
    console.log('点击车辆ID:', id)
    
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    })
  },

  // 跳转到添加车型页面
  goAddCar() {
    wx.navigateTo({
      url: '/pages/addCar/addCar'
    })
  },

  // 跳转到我的评价页面
  goMyReviews() {
    wx.navigateTo({
      url: '/pages/myReviews/myReviews'
    })
  },

  // 点击悬浮按钮 - 检查登录状态
  async goMyReviewsCheckLogin() {
    wx.showLoading({ title: '检查中...' })
    
    try {
      // 尝试获取用户openid
      const { result } = await wx.cloud.callFunction({
        name: 'getOpenid'
      })
      
      wx.hideLoading()
      
      if (result.openid) {
        // 已登录，直接跳转
        wx.navigateTo({
          url: '/pages/myReviews/myReviews'
        })
      }
    } catch (err) {
      wx.hideLoading()
      
      // 未登录，提示用户授权
      wx.showModal({
        title: '需要登录',
        content: '查看我的评价需要获取您的微信信息，是否授权登录？',
        confirmText: '授权登录',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.doLogin()
          }
        }
      })
    }
  },

  // 执行登录
  doLogin() {
    wx.getUserProfile({
      desc: '用于展示用户头像昵称',
      success: () => {
        // 授权成功，跳转到我的评价页
        wx.navigateTo({
          url: '/pages/myReviews/myReviews'
        })
      },
      fail: () => {
        wx.showToast({
          title: '需要授权才能查看',
          icon: 'none'
        })
      }
    })
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
