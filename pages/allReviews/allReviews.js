// ============================================
// 全部评价页面
// 展示用户所有的历史评价
// ============================================

const app = getApp()

Page({
  data: {
    // 全部评价列表
    allReviews: [],
    // 加载状态
    loading: true,
    // 是否还有更多
    hasMore: true,
    // 页码
    page: 0,
    // 每页数量
    pageSize: 20,
    // 统计
    reviewCount: 0,
    avgScore: '0.0',
    // 当前用户openid
    currentOpenid: ''
  },

  getDossierCode(index, reviewId) {
    const numericIndex = Number(index) + 1
    const fallback = String(numericIndex).padStart(3, '0')
    if (!reviewId) return fallback

    return String(reviewId)
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(-3)
      .toUpperCase()
      .padStart(3, '0')
  },

  formatArchiveRank(index) {
    return `#${String(Number(index) + 1).padStart(2, '0')}`
  },

  getArchiveDateLabel(date) {
    if (!date) return '未记录'

    const d = new Date(date)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}.${month}.${day}`
  },

  getArchiveActionLabel(statusType) {
    if (statusType === 'pending') return '审核中'
    if (statusType === 'rejected') return '查看状态'
    return '查看详情'
  },

  buildCommentExcerpt(comment = '') {
    const trimmed = String(comment || '').trim()
    if (!trimmed) return '暂无文字记录'
    return trimmed
  },

  async processReviewImageUrls(reviews = []) {
    const cloudFileIDs = [...new Set(
      reviews
        .map(item => item.imageUrl)
        .filter(url => url && url.startsWith('cloud://'))
    )]

    if (!cloudFileIDs.length) {
      return reviews
    }

    try {
      const tempRes = await wx.cloud.getTempFileURL({
        fileList: cloudFileIDs
      })

      const urlMap = {}
      ;(tempRes.fileList || []).forEach(item => {
        if (item.fileID && item.tempFileURL) {
          urlMap[item.fileID] = item.tempFileURL
        }
      })

      return reviews.map(item => ({
        ...item,
        imageUrl: item.imageUrl && item.imageUrl.startsWith('cloud://')
          ? (urlMap[item.imageUrl] || '')
          : item.imageUrl
      }))
    } catch (err) {
      console.error('转换评价封面图失败:', err)
      return reviews
    }
  },

  getReviewStatusMeta(reviewStatus, carStatus, rejectReason) {
    const normalizedReviewStatus = reviewStatus || 'approved'
    const normalizedCarStatus = carStatus || 'approved'

    if (normalizedReviewStatus === 'pending' || normalizedCarStatus === 'pending') {
      return {
        label: '审核中',
        type: 'pending',
        desc: '当前仅你自己可见，暂不支持修改。'
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

  onLoad() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage']
    })

    // 从全局获取用户信息
    this.loadUserInfoFromApp()
  },

  // 从全局 App 获取用户信息
  loadUserInfoFromApp() {
    // 防御性检查
    if (!app || typeof app.getUserInfo !== 'function') {
      console.error('app 实例或 getUserInfo 方法不可用')
      // 降级方案
      this.loadAllReviewsWithoutOpenid()
      return
    }
    
    const userInfo = app.getUserInfo()
    if (userInfo && userInfo.openid) {
      this.setData({ currentOpenid: userInfo.openid })
      this.loadAllReviews()
      this.loadStatistics()
    } else {
      // 注册登录成功回调
      if (typeof app.onLoginSuccess === 'function') {
        app.onLoginSuccess((info) => {
          this.setData({ currentOpenid: info.openid })
          this.loadAllReviews()
          this.loadStatistics()
        })
      } else {
        // 降级方案
        this.loadAllReviewsWithoutOpenid()
      }
    }
  },

  async onLoadOld() {
    // 获取openid并加载数据
    try {
      const loginRes = await wx.cloud.callFunction({
        name: 'getOpenid'
      })
      if (loginRes.result && loginRes.result.openid) {
        const openid = loginRes.result.openid
        this.setData({ currentOpenid: openid })
        this.loadAllReviews()
        this.loadStatistics()
      } else {
        this.loadAllReviewsWithoutOpenid()
      }
    } catch (err) {
      console.error('获取openid失败:', err)
      this.loadAllReviewsWithoutOpenid()
    }
  },

  onShow() {
    // 页面显示时刷新
    if (this.data.currentOpenid) {
      this.setData({ page: 0, hasMore: true, allReviews: [] })
      this.loadAllReviews()
      this.loadStatistics()
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.setData({
      page: 0,
      hasMore: true,
      allReviews: []
    }, () => {
      Promise.all([
        this.loadAllReviews(),
        this.loadStatistics()
      ]).then(() => {
        wx.stopPullDownRefresh()
      })
    })
  },

  // 加载全部评价
  async loadAllReviews() {
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
          allReviews: page === 0 ? [] : this.data.allReviews,
          loading: false,
          hasMore: false
        })
        return
      }

      const reviewsWithCarInfo = reviewItems.map((review, index) => {
        const statusMeta = this.getReviewStatusMeta(review.review_status, review.car_status, review.reject_reason || review.car_rejected_reason || '')
        const scoreText = review.total_score ? Math.round(Number(review.total_score)).toString() : '0'

        return {
          _id: review._id,
          carId: review.car_id,
          archiveRank: this.formatArchiveRank(index + (page * pageSize)),
          dossierCode: this.getDossierCode(index + (page * pageSize), review._id),
          brand: review.brand || '未知品牌',
          modelName: review.model_name || '未知车型',
          powerType: review.power_type || '纯电',
          modelYear: review.model_year || '',
          priceRange: review.price_range || '',
          imageUrl: review.image_url || '',
          tagColor: this.getTagColor(review.power_type || '纯电'),
          myScore: review.total_score ? Math.round(review.total_score).toString() : '0',
          scoreText,
          comment: review.comment || '',
          excerpt: this.buildCommentExcerpt(review.comment),
          status: review.review_status || 'approved',
          statusLabel: statusMeta.label,
          statusType: statusMeta.type,
          statusDesc: statusMeta.desc,
          canEdit: statusMeta.type === 'approved',
          canShare: statusMeta.type === 'approved',
          canOpenDetail: statusMeta.type === 'approved',
          actionLabel: this.getArchiveActionLabel(statusMeta.type),
          time: this.formatTime(review.created_at),
          archiveDate: this.getArchiveDateLabel(review.created_at),
          dimensions: [
            { name: '动力', score: review.score_power || 0 },
            { name: '操控', score: review.score_handling || 0 },
            { name: '空间', score: review.score_space || 0 },
            { name: '辅驾', score: review.score_adas || 0 },
            { name: '其他', score: review.score_other || 0 }
          ]
        }
      })

      const reviewsWithImages = await this.processReviewImageUrls(reviewsWithCarInfo)

      const hasMore = !!res.result?.hasMore
      const newAllReviews = page === 0 ? reviewsWithImages : [...this.data.allReviews, ...reviewsWithImages]

      this.setData({
        allReviews: newAllReviews,
        loading: false,
        hasMore: hasMore
      })

    } catch (err) {
      console.error('加载全部评价失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  // 【安全修复】查询所有数据后，在代码层面过滤只保留当前用户的数据
  async loadAllReviewsWithoutOpenid() {
    this.setData({ loading: true })
    
    const db = wx.cloud.database()
    
    try {
      // 查询所有评价
      const res = await db.collection('reviews')
        .orderBy('created_at', 'desc')
        .get()
      
      if (res.data.length === 0) {
        this.setData({
          allReviews: [],
          loading: false,
          hasMore: false,
          reviewCount: 0,
          avgScore: '0.0'
        })
        return
      }
      
      // 【关键安全修复】按 _openid 分组，找出当前用户的 openid
      const openidCount = {}
      res.data.forEach(item => {
        const oid = item._openid || 'unknown'
        openidCount[oid] = (openidCount[oid] || 0) + 1
      })
      
      // 找出评价数量最多的 openid（应该是当前用户）
      let maxCount = 0
      let userOpenid = null
      for (const [oid, count] of Object.entries(openidCount)) {
        if (count > maxCount) {
          maxCount = count
          userOpenid = oid
        }
      }
      
      if (!userOpenid || userOpenid === 'unknown') {
        console.error('无法识别当前用户')
        this.setData({ loading: false })
        return
      }
      
      this.setData({ currentOpenid: userOpenid })
      
      // 【关键安全修复】只保留当前用户的评价
      const myReviews = res.data.filter(item => item._openid === userOpenid)
      
      // 计算统计
      const totalScore = myReviews.reduce((sum, item) => sum + (item.total_score || 0), 0)
      const avg = myReviews.length > 0 ? Math.round(totalScore / myReviews.length).toString() : '0.0'
      
      // 获取车型信息
      const reviewsWithCarInfo = await Promise.all(
        myReviews.map(async (review) => {
          try {
            let car = null
            if (review.car_id) {
              const carRes = await db.collection('cars').doc(review.car_id).get()
              car = carRes.data
            }
            
            // 处理评论折叠
            const comment = review.comment || ''
            const maxLength = 120
            const isLongComment = comment.length > maxLength
            const statusMeta = this.getReviewStatusMeta(review.status, car?.status, review.reject_reason || car?.rejected_reason || '')
            
            return {
              _id: review._id,
              carId: review.car_id,
              brand: car?.brand || '未知品牌',
              modelName: car?.model_name || '未知车型',
              powerType: car?.power_type || '纯电',
              modelYear: car?.model_year || '',
              tagColor: this.getTagColor(car?.power_type || '纯电'),
              myScore: review.total_score ? Math.round(review.total_score).toString() : '0',
              comment: comment,
              isLongComment: isLongComment,
              isExpanded: false,
              displayComment: isLongComment ? comment.slice(0, maxLength) + '...' : comment,
              status: review.status || 'approved',
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
          } catch (e) {
            const comment = review.comment || ''
            const maxLength = 120
            const isLongComment = comment.length > maxLength
            
            return {
              _id: review._id,
              carId: review.car_id,
              brand: '未知品牌',
              modelName: '未知车型',
              powerType: '纯电',
              tagColor: '#666666',
              myScore: review.total_score ? Math.round(review.total_score).toString() : '0',
              comment: comment,
              isLongComment: isLongComment,
              isExpanded: false,
              displayComment: isLongComment ? comment.slice(0, maxLength) + '...' : comment,
              time: this.formatTime(review.created_at),
              dimensions: [
                { name: '动力', score: review.score_power || 0 },
                { name: '操控', score: review.score_handling || 0 },
                { name: '空间', score: review.score_space || 0 },
                { name: '辅驾', score: review.score_adas || 0 },
                { name: '其他', score: review.score_other || 0 }
              ]
            }
          }
        })
      )
      
      this.setData({
        allReviews: reviewsWithCarInfo,
        loading: false,
        hasMore: false,
        reviewCount: myReviews.length,
        avgScore: avg
      })
      
    } catch (err) {
      console.error('加载失败:', err)
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
      this.loadAllReviews()
    })
  },

  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({
          url: '/pages/myReviews/myReviews'
        })
      }
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
      
      if (!res.result || !res.result.success) {
        console.error('删除失败:', res.result?.message)
        wx.showToast({ title: res.result?.message || '删除失败', icon: 'none' })
        return
      }
      
      wx.showToast({ title: '删除成功', icon: 'success' })

      if (res.result.shouldRecalculateScore !== false && carId) {
        await this.updateCarAverageScore(carId)
      }

      // 刷新列表
      this.setData({ page: 0, hasMore: true, allReviews: [] }, () => {
        this.loadAllReviews()
        this.loadStatistics()
      })
    } catch (err) {
      console.error('删除评价失败:', err)
      wx.showToast({ title: '删除失败：' + (err.message || '无权限'), icon: 'none' })
    }
  },

  // 更新车型平均分 - 使用云函数
  async updateCarAverageScore(carId) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'updateCarScore',
        data: { carId }
      })
      
      if (!res.result.success) {
        console.error('更新车型平均分失败:', res.result.message)
      }
    } catch (err) {
      console.error('调用更新车型平均分云函数失败:', err)
    }
  },

  // 阻止冒泡
  preventBubble() {},

  onShareAppMessage(res) {
    const target = res?.target
    const dataset = target?.dataset || {}
    const canShare = !!dataset.canshare

    if (!canShare) {
      return {
        title: '车评侦探',
        path: '/pages/index/index'
      }
    }

    const brand = dataset.brand || ''
    const model = dataset.model || ''
    const score = dataset.score || ''
    const carId = dataset.carid || ''
    const imageUrl = dataset.imageurl || ''
    const carName = `${brand} ${model}`.trim()
    const shareTitle = score
      ? `我刚才给${carName}打了${score}分，你打多少分呢？`
      : `我刚才给${carName}打了分，你打多少分呢？`

    const shareConfig = {
      title: shareTitle,
      path: carId ? `/pages/detail/detail?id=${carId}` : '/pages/index/index'
    }

    // 优先使用当前车型封面图作为分享图，避免分享时退化成临时截图。
    if (imageUrl) {
      shareConfig.imageUrl = imageUrl
    }

    return shareConfig
  },

  // 切换评论展开/收起
  toggleComment(e) {
    const { index } = e.currentTarget.dataset
    const { allReviews } = this.data
    const review = allReviews[index]
    
    if (!review || !review.isLongComment) return
    
    const newExpanded = !review.isExpanded
    const maxLength = 120
    
    // 更新该条评价的展开状态和显示内容
    const newAllReviews = allReviews.map((item, i) => {
      if (i === index) {
        return {
          ...item,
          isExpanded: newExpanded,
          displayComment: newExpanded ? item.comment : item.comment.slice(0, maxLength) + '...'
        }
      }
      return item
    })
    
    this.setData({ allReviews: newAllReviews })
  }
})
