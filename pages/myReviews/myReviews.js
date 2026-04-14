// ============================================
// 我的评价页面
// 集中展示用户历史评价过的所有车型
// ============================================

const app = getApp()

Page({
  data: {
    // 评价列表（首页最多显示3条）
    reviews: [],
    // 全部评价列表
    allReviews: [],
    // 加载状态
    loading: true,
    // 是否还有更多
    hasMore: true,
    // 页码
    page: 0,
    // 每页数量
    pageSize: 10,
    // 统计
    reviewCount: 0,
    avgScore: '0.0',
    // 当前用户openid
    currentOpenid: '',
    // 是否显示全部评价
    showAllReviews: false,
    // 关于我们展开状态
    aboutUsExpanded: false,
    // 登录状态
    isLoggedIn: false,
    // 是否管理员
    isAdmin: false,
    // 用户头像
    userAvatar: '',
    displayUserAvatar: '',
    // 用户昵称
    userName: '',
    // 资料设置弹窗
    showProfileModal: false,
    tempAvatarUrl: '',
    tempNickname: ''
  },

  onLoad() {
    // 从全局获取用户信息
    this.loadUserInfoFromApp()
  },

  onShow() {
    // 页面显示时刷新（点击tabBar或从详情页返回时触发）
    // 检查登录状态（使用同步方式获取最新状态）
    const app = getApp()
    const userInfo = app.globalData.userInfo || {}
    const cachedProfile = wx.getStorageSync('userProfile') || {}
    const openid = userInfo.openid || cachedProfile.openid || ''
    const isLoggedIn = !!openid
    const avatar = userInfo.avatarUrl || cachedProfile.avatarUrl || ''
    const name = userInfo.nickName || cachedProfile.nickName || ''
    
    // 更新页面状态
    this.setData({
      isLoggedIn,
      isAdmin: !!userInfo.isAdmin,
      currentOpenid: openid,
      userAvatar: avatar,
      displayUserAvatar: avatar || this.getDefaultAvatar(),
      userName: name
    }, () => {
      this.resolveDisplayAvatar()
    })
    
    // 只有在已登录状态下才加载数据
    if (isLoggedIn && openid) {
      // 先显示加载状态
      this.setData({ loading: true, page: 0, hasMore: true, reviews: [] }, () => {
        this.loadMyReviews()
        this.loadStatistics()
      })
    } else {
      // 未登录状态，重置数据为初始值
      this.setData({
        loading: false,
        reviews: [],
        allReviews: [],
        reviewCount: 0,
        avgScore: '0.0'
      })
    }
    // 设置tabBar选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
  },

  // 从全局 App 获取用户信息
  loadUserInfoFromApp() {
    // 先检查登录状态（同时加载头像昵称）
    this.checkLoginStatus()
    
    // 防御性检查
    if (!app || typeof app.getUserInfo !== 'function') {
      console.error('app 实例或 getUserInfo 方法不可用')
      return
    }
    
    const userInfo = app.getUserInfo()
    const cachedProfile = wx.getStorageSync('userProfile') || {}
    
    // 合并全局和缓存的用户信息
    const openid = userInfo?.openid || cachedProfile.openid || ''
    const avatarUrl = userInfo?.avatarUrl || cachedProfile.avatarUrl || ''
    const nickName = userInfo?.nickName || cachedProfile.nickName || ''
    
    if (openid) {
      this.setData({ 
        currentOpenid: openid,
        isLoggedIn: true,
        isAdmin: !!(userInfo?.isAdmin || cachedProfile.isAdmin),
        userAvatar: avatarUrl,
        displayUserAvatar: avatarUrl || this.getDefaultAvatar(),
        userName: nickName
      }, () => {
        this.resolveDisplayAvatar()
      })
      this.loadMyReviews()
      this.loadStatistics()
    } else {
      // 注册登录成功回调
      if (typeof app.onLoginSuccess === 'function') {
        app.onLoginSuccess((info) => {
          this.setData({ 
            currentOpenid: info.openid,
            isLoggedIn: true,
            isAdmin: !!info.isAdmin,
            userAvatar: info.avatarUrl || '',
            displayUserAvatar: info.avatarUrl || this.getDefaultAvatar(),
            userName: info.nickName || ''
          }, () => {
            this.resolveDisplayAvatar()
          })
          this.loadMyReviews()
          this.loadStatistics()
        })
      }
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.setData({
      page: 0,
      hasMore: true,
      reviews: []
    }, () => {
      Promise.all([
        this.loadMyReviews(),
        this.loadStatistics()
      ]).then(() => {
        wx.stopPullDownRefresh()
      })
    })
  },

  getDefaultAvatar() {
    return 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'
  },

  async resolveDisplayAvatar() {
    const avatar = this.data.userAvatar || ''

    if (!avatar) {
      this.setData({
        displayUserAvatar: this.getDefaultAvatar()
      })
      return
    }

    if (!avatar.startsWith('cloud://')) {
      this.setData({
        displayUserAvatar: avatar
      })
      return
    }

    try {
      const tempRes = await wx.cloud.getTempFileURL({
        fileList: [avatar]
      })

      const tempUrl = tempRes.fileList?.[0]?.tempFileURL || ''
      if (tempUrl) {
        this.setData({
          displayUserAvatar: tempUrl
        })
      } else {
        this.setData({
          displayUserAvatar: this.getDefaultAvatar()
        })
      }
    } catch (err) {
      console.error('转换用户头像失败:', err)
      this.setData({
        displayUserAvatar: this.getDefaultAvatar()
      })
    }
  },

  // 加载用户的评价列表
  async loadMyReviews() {
    const { currentOpenid, page, pageSize } = this.data

    if (!currentOpenid) {
      this.setData({ loading: false })
      return
    }
    
    this.setData({ loading: true })
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'getMyReviews',
        data: {
          action: 'list',
          page,
          pageSize
        }
      })

      const reviewItems = res.result?.data || []

      if (!res.result?.success) {
        throw new Error(res.result?.message || '获取评价失败')
      }
      if (reviewItems.length === 0) {
        this.setData({
          reviews: page === 0 ? [] : this.data.reviews,
          allReviews: page === 0 ? [] : this.data.allReviews,
          loading: false,
          hasMore: false
        })
        return
      }
      
      const reviewsWithCarInfo = reviewItems.map((review) => {
        const statusMeta = this.getReviewStatusMeta(review.review_status, review.car_status, review.reject_reason || review.car_rejected_reason || '')

        return {
          _id: review._id,
          carId: review.car_id,
          brand: review.brand || '未知品牌',
          modelName: review.model_name || '未知车型',
          powerType: review.power_type || '纯电',
          modelYear: review.model_year || '',
          tagColor: this.getTagColor(review.power_type || '纯电'),
          myScore: review.total_score ? Math.round(review.total_score).toString() : '0',
          comment: review.comment,
          status: review.review_status || 'approved',
          statusLabel: statusMeta.label,
          statusType: statusMeta.type,
          statusDesc: statusMeta.desc,
          canEdit: statusMeta.type === 'approved',
          canOpenDetail: statusMeta.type === 'approved',
          time: this.formatTime(review.created_at),
          dimensions: [
            { name: '动力', score: review.score_power || 0 },
            { name: '操控', score: review.score_handling || 0 },
            { name: '空间', score: review.score_space || 0 },
            { name: '辅驾', score: review.score_adas || 0 },
            { name: '其他', score: review.score_other || 0 }
          ]
        }
      })
      
      if ((!this.data.userAvatar || !this.data.userName) && reviewItems.length > 0) {
        const firstProfile = reviewItems.find(item => item.user_avatar || item.user_nickname) || {}
        const nextAvatar = firstProfile.user_avatar || this.data.userAvatar
        const nextName = firstProfile.user_nickname || this.data.userName

        this.setData({
          userAvatar: nextAvatar || this.data.userAvatar,
          userName: nextName || this.data.userName
        }, () => {
          this.resolveDisplayAvatar()
        })

        if ((nextAvatar || nextName) && app && typeof app.saveUserProfile === 'function') {
          const currentUserInfo = app.getUserInfo() || {}
          app.saveUserProfile({
            openid: currentUserInfo.openid,
            avatarUrl: nextAvatar || currentUserInfo.avatarUrl,
            nickName: nextName || currentUserInfo.nickName
          })
        }
      }
      
      const hasMore = !!res.result?.hasMore
      const allReviews = page === 0 ? reviewsWithCarInfo : [...this.data.allReviews, ...reviewsWithCarInfo]
      
      // 首页最多显示3条
      const displayReviews = allReviews.slice(0, 3)
      
      this.setData({
        allReviews: allReviews,
        reviews: displayReviews,
        loading: false,
        hasMore: hasMore
      })

    } catch (err) {
      console.error('加载评价列表失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  // 加载统计数据 - 只统计当前用户
  async loadStatistics() {
    const { currentOpenid } = this.data

    try {
      if (!currentOpenid) return

      const res = await wx.cloud.callFunction({
        name: 'getMyReviews',
        data: {
          action: 'stats'
        }
      })

      if (!res.result?.success) {
        throw new Error(res.result?.message || '统计失败')
      }

      this.setData({
        reviewCount: res.result.reviewCount || 0,
        avgScore: res.result.avgScore || '0.0'
      })
      
    } catch (err) {
      console.error('加载统计数据失败:', err)
    }
  },

  // 获取动力类型颜色
  getTagColor(powerType) {
    const colorMap = {
      '纯电': '#22a568',
      '增程': '#007eba',
      '插混': '#c172d4',
      '燃油': '#ffa200'
    }
    return colorMap[powerType] || '#666666'
  },

  getReviewStatusMeta(reviewStatus, carStatus, rejectReason) {
    const normalizedReviewStatus = reviewStatus || 'approved'
    const normalizedCarStatus = carStatus || 'approved'

    if (normalizedReviewStatus === 'pending' || normalizedCarStatus === 'pending') {
      return {
        label: '审核中',
        type: 'pending',
        desc: '审核中，仅自己可见'
      }
    }

    if (normalizedReviewStatus === 'rejected' || normalizedCarStatus === 'rejected') {
      return {
        label: '未通过',
        type: 'rejected',
        desc: rejectReason ? `未通过原因：${rejectReason}` : '当前审核未通过。'
      }
    }

    return {
      label: '已发布',
      type: 'approved',
      desc: ''
    }
  },

  // 格式化时间
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

  // 加载更多
  loadMore() {
    if (this.data.loading || !this.data.hasMore) return
    
    this.setData({ page: this.data.page + 1 }, () => {
      this.loadMyReviews()
    })
  },

  // 跳转到车型详情
  goCarDetail(e) {
    const carId = e.currentTarget.dataset.carid
    const canOpen = e.currentTarget.dataset.canopen

    if (!canOpen) {
      wx.showToast({
        title: '当前内容暂不支持查看详情',
        icon: 'none'
      })
      return
    }
    
    wx.navigateTo({
      url: `/pages/detail/detail?id=${carId}&edit=true`
    })
  },

  // 删除评价
  deleteReview(e) {
    const reviewId = e.currentTarget.dataset.reviewid
    const carId = e.currentTarget.dataset.carid
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条评价吗？删除后无法恢复。',
      confirmColor: '#FF5252',
      success: (res) => {
        if (res.confirm) {
          this.doDeleteReview(reviewId, carId)
        }
      }
    })
  },

  // 执行删除 - 使用云函数
  async doDeleteReview(reviewId, carId) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'deleteReview',
        data: { reviewId }
      })
      
      console.log('deleteReview 云函数返回:', res)
      
      if (!res.result || !res.result.success) {
        console.error('删除失败:', res.result?.message)
        wx.showToast({ title: res.result?.message || '删除失败', icon: 'none' })
        return
      }
      
      wx.showToast({ title: '删除成功', icon: 'success' })
      
      if (res.result.shouldRecalculateScore !== false && carId) {
        await this.updateCarAverageScore(carId)
      }
      
      // 刷新列表和统计数据（仅在登录状态下）
      if (this.data.isLoggedIn && this.data.currentOpenid) {
        this.setData({ page: 0, hasMore: true, reviews: [] }, () => {
          this.loadMyReviews()
          this.loadStatistics()
        })
      }
      
    } catch (err) {
      console.error('删除评价失败:', err)
      wx.showToast({ title: '删除失败：' + (err.message || '无权限'), icon: 'none' })
    }
  },

  // 更新车型平均分（删除后更新）- 使用云函数
  async updateCarAverageScore(carId) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'updateCarScore',
        data: { carId }
      })
      
      if (res.result.success) {
        console.log('车型平均分已更新:', res.result.avg_score?.toFixed(1))
      } else {
        console.error('更新车型平均分失败:', res.result.message)
      }
    } catch (err) {
      console.error('调用更新车型平均分云函数失败:', err)
    }
  },

  // 返回首页
  goHome() {
    wx.switchTab({
      url: '/pages/index/index'
    })
  },

  // 查看全部评价
  viewAllReviews() {
    wx.navigateTo({
      url: '/pages/allReviews/allReviews'
    })
  },

  // 分享功能
  onShareAppMessage() {
    return {
      title: '看看我评价过哪些车',
      path: '/pages/myReviews/myReviews'
    }
  },

  // 阻止冒泡
  preventBubble() {
    // 什么都不做，只是阻止冒泡
  },

  // 切换板块展开/收起
  toggleSection(e) {
    const { section } = e.currentTarget.dataset
    if (section === 'aboutUs') {
      this.setData({ aboutUsExpanded: !this.data.aboutUsExpanded })
    }
  },

  // ============================================
  // 登录/退出登录
  // ============================================

  // 检查登录状态
  checkLoginStatus() {
    const app = getApp()
    const userInfo = app.globalData.userInfo || {}
    const cachedProfile = wx.getStorageSync('userProfile') || {}
    
    const openid = userInfo.openid || cachedProfile.openid || ''
    const isLoggedIn = !!openid
    const avatar = userInfo.avatarUrl || cachedProfile.avatarUrl || ''
    const name = userInfo.nickName || cachedProfile.nickName || ''
    
      this.setData({
        isLoggedIn,
        isAdmin: !!(userInfo.isAdmin || cachedProfile.isAdmin),
        currentOpenid: openid,
        userAvatar: avatar,
        displayUserAvatar: avatar || this.getDefaultAvatar(),
        userName: name
    }, () => {
      this.resolveDisplayAvatar()
    })
    
  },

  // 处理登录 - 显示资料设置弹窗
  handleLogin() {
    this.setData({
      showProfileModal: true,
      tempAvatarUrl: '',
      tempNickname: ''
    })
  },

  // 关闭资料弹窗
  closeProfileModal() {
    this.setData({ showProfileModal: false })
  },

  // 选择头像
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail
    this.setData({ tempAvatarUrl: avatarUrl })
  },

  // 输入昵称
  onNicknameInput(e) {
    this.setData({ tempNickname: e.detail.value })
  },

  // 上传头像到云存储
  async uploadAvatar(filePath) {
    const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`
    const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath })
    return uploadRes.fileID
  },

  // 确认资斞
  async confirmProfile() {
    const { tempAvatarUrl, tempNickname } = this.data
    
    if (!tempAvatarUrl) {
      wx.showToast({ title: '请选择头像', icon: 'none' })
      return
    }
    if (!tempNickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    
    wx.showLoading({ title: '登录中...' })
    
    try {
      // 上传头像到云存储
      const avatarUrl = await this.uploadAvatar(tempAvatarUrl)
      const nickName = tempNickname.trim()
      
      // 获取openid
      let openid = ''
      const globalUserInfo = app.globalData.userInfo || {}
      
      if (globalUserInfo.openid) {
        openid = globalUserInfo.openid
      } else {
        const cachedProfile = wx.getStorageSync('userProfile') || {}
        if (cachedProfile.openid) {
          openid = cachedProfile.openid
        } else {
          try {
            const res = await wx.cloud.callFunction({ name: 'getOpenid' })
            if (res.result && res.result.openid) {
              openid = res.result.openid
            }
          } catch (e) {
            console.error('获取 openid 失败:', e)
          }
        }
      }
      
      // 保存用户信息到全局
      app.saveUserProfile({ openid, avatarUrl, nickName })
      
      // 更新页面状态
      this.setData({
        isLoggedIn: !!openid,
        isAdmin: app.isAdmin(),
        userAvatar: avatarUrl,
        displayUserAvatar: avatarUrl || this.getDefaultAvatar(),
        userName: nickName,
        currentOpenid: openid,
        showProfileModal: false
      }, () => {
        this.resolveDisplayAvatar()
      })
      
      wx.showToast({ title: '登录成功', icon: 'success', duration: 1500 })
      
      // 延迟加载数据
      setTimeout(() => {
        if (openid) {
          this.setData({ loading: true, page: 0, hasMore: true, reviews: [] }, () => {
            this.loadMyReviews()
            this.loadStatistics()
          })
        }
      }, 500)
    } catch (err) {
      console.error('登录失败:', err)
      wx.showToast({ title: '上传头像失败，请重试', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // 处理退出登录
  handleLogout() {
    wx.showModal({
      title: '确认退出',
      content: '退出后将无法提交新的评价，确定要退出登录吗？',
      confirmColor: '#ff6b35',
      success: (res) => {
        if (res.confirm) {
          // 清除本地缓存
          wx.removeStorageSync('userProfile')
          
          // 清除全局数据
          const app = getApp()
          app.globalData.userInfo = {}
          
          // 更新页面状态
          this.setData({
            isLoggedIn: false,
            isAdmin: false,
            userAvatar: '',
            displayUserAvatar: this.getDefaultAvatar(),
            userName: '',
            currentOpenid: ''
          })
          
          wx.showToast({
            title: '已退出登录',
            icon: 'success'
          })
          
          // 刷新数据（会显示空状态）
          this.onShow()
        }
      }
    })
  },

  // 打开管理员车型审核页
  goAdminCars() {
    if (!this.data.isAdmin) {
      wx.showToast({
        title: '无管理员权限',
        icon: 'none'
      })
      return
    }

    wx.navigateTo({
      url: '/pages/adminCars/adminCars'
    })
  }
})
