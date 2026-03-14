// ============================================
// 我的评价页面
// 集中展示用户历史评价过的所有车型
// ============================================

Page({
  data: {
    // 评价列表
    reviews: [],
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
    currentOpenid: ''
  },

  async onLoad() {
    // 创建临时登录获取openid
    console.log('myReviews 页面 onLoad')
    try {
      const loginRes = await wx.cloud.callFunction({
        name: 'getOpenid'
      })
      console.log('云函数返回:', loginRes)
      if (loginRes.result && loginRes.result.openid) {
        const openid = loginRes.result.openid
        console.log('获取到openid:', openid)
        this.setData({ currentOpenid: openid })
        this.loadMyReviews()
        this.loadStatistics()
      } else {
        console.log('未能获取openid，尝试直接查询')
        // 尝试直接查询（数据库记录中会自动带上_openid）
        this.loadMyReviewsWithoutOpenid()
      }
    } catch (err) {
      console.error('获取openid失败:', err)
      // 尝试直接查询
      this.loadMyReviewsWithoutOpenid()
    }
  },

  onShow() {
    // 页面显示时刷新（点击tabBar或从详情页返回时触发）
    console.log('myReviews onShow, 开始刷新数据')
    // 先显示加载状态，让用户知道正在刷新
    this.setData({ loading: true, page: 0, hasMore: true, reviews: [] }, () => {
      // 优先使用openid查询，没有则使用备用方案
      if (this.data.currentOpenid) {
        console.log('使用openid刷新:', this.data.currentOpenid)
        this.loadMyReviews()
        this.loadStatistics()
      } else {
        console.log('使用备用方案刷新')
        this.loadMyReviewsWithoutOpenid()
      }
    })
    // 设置tabBar选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
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

  // 不依赖openid直接查询（利用云数据库权限自动过滤）
  async loadMyReviewsWithoutOpenid() {
    console.log('尝试不依赖openid查询...')
    this.setData({ loading: true })
    
    const db = wx.cloud.database()
    
    try {
      // 查询reviews集合，云数据库会自动过滤当前用户的数据
      const res = await db.collection('reviews')
        .orderBy('created_at', 'desc')
        .limit(10)
        .get()
      
      console.log('直接查询结果:', res.data)
      
      if (res.data.length === 0) {
        console.log('未查询到数据')
        this.setData({
          reviews: [],
          loading: false,
          hasMore: false,
          reviewCount: 0,
          avgScore: '0.0'
        })
        return
      }
      
      // 计算统计
      const count = res.data.length
      const totalScore = res.data.reduce((sum, item) => sum + (item.total_score || 0), 0)
      const avg = count > 0 ? Math.round(totalScore / count).toString() : '0.0'
      
      // 获取车型信息
      const reviewsWithCarInfo = await Promise.all(
        res.data.map(async (review) => {
          try {
            let car = null
            if (review.car_id) {
              const carRes = await db.collection('cars').doc(review.car_id).get()
              car = carRes.data
            }
            
            return {
              _id: review._id,
              carId: review.car_id,
              brand: car?.brand || '未知品牌',
              modelName: car?.model_name || '未知车型',
              powerType: car?.power_type || '纯电',
              modelYear: car?.model_year || '',
              tagColor: this.getTagColor(car?.power_type || '纯电'),
              myScore: review.total_score ? Math.round(review.total_score).toString() : '0',
              comment: review.comment,
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
            return {
              _id: review._id,
              carId: review.car_id,
              brand: '未知品牌',
              modelName: '未知车型',
              powerType: '纯电',
              modelYear: '',
              tagColor: '#666666',
              myScore: review.total_score ? Math.round(review.total_score).toString() : '0',
              comment: review.comment,
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
        reviews: reviewsWithCarInfo,
        loading: false,
        hasMore: false,
        reviewCount: count,
        avgScore: avg
      })
      
      console.log('备用查询完成，统计:', count, '条，平均分:', avg)
      
    } catch (err) {
      console.error('查询失败:', err)
      this.setData({ loading: false })
    }
  },

  // 加载用户的评价列表
  async loadMyReviews() {
    const { currentOpenid, page, pageSize } = this.data
    
    console.log('加载我的评价, openid:', currentOpenid)
    
    if (!currentOpenid) {
      console.log('openid为空，不加载')
      this.setData({ loading: false })
      return
    }
    
    this.setData({ loading: true })
    
    const db = wx.cloud.database()
    
    try {
      // 查询用户的所有评价
      console.log('开始查询reviews集合...')
      const res = await db.collection('reviews')
        .where({ _openid: currentOpenid })
        .orderBy('created_at', 'desc')
        .skip(page * pageSize)
        .limit(pageSize)
        .get()
      
      console.log('查询到的评价数据:', res.data)
      
      if (res.data.length === 0) {
        console.log('没有评价记录')
        this.setData({
          reviews: page === 0 ? [] : this.data.reviews,
          loading: false,
          hasMore: false
        })
        return
      }
      
      // 获取车型详细信息
      const reviewsWithCarInfo = await Promise.all(
        res.data.map(async (review, index) => {
          console.log(`处理第${index + 1}条评价:`, review._id, 'car_id:', review.car_id)
          
          try {
            // 查询车型信息
            let car = null
            if (review.car_id) {
              const carRes = await db.collection('cars').doc(review.car_id).get()
              car = carRes.data
              console.log('查询到车型信息:', car?.brand, car?.model_name)
            }
            
            // 获取动力类型颜色
            const tagColor = this.getTagColor(car?.power_type || '纯电')
            
            return {
              _id: review._id,
              carId: review.car_id,
              brand: car?.brand || '未知品牌',
              modelName: car?.model_name || '未知车型',
              powerType: car?.power_type || '纯电',
              modelYear: car?.model_year || '',
              tagColor: tagColor,
              myScore: review.total_score ? Math.round(review.total_score).toString() : '0',
              comment: review.comment,
              time: this.formatTime(review.created_at),
              dimensions: [
                { name: '动力', score: review.score_power || 0 },
                { name: '操控', score: review.score_handling || 0 },
                { name: '空间', score: review.score_space || 0 },
                { name: '辅驾', score: review.score_adas || 0 },
                { name: '其他', score: review.score_other || 0 }
              ]
            }
          } catch (carErr) {
            console.error('获取车型信息失败:', carErr)
            // 返回基本数据，不因车型查询失败而中断
            return {
              _id: review._id,
              carId: review.car_id,
              brand: '未知品牌',
              modelName: '未知车型',
              powerType: '纯电',
              modelYear: '',
              tagColor: '#666666',
              myScore: review.total_score ? Math.round(review.total_score).toString() : '0',
              comment: review.comment,
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
      
      console.log('处理后的评价列表:', reviewsWithCarInfo)
      
      const hasMore = reviewsWithCarInfo.length === pageSize
      
      this.setData({
        reviews: page === 0 ? reviewsWithCarInfo : [...this.data.reviews, ...reviewsWithCarInfo],
        loading: false,
        hasMore: hasMore
      })
      
      // 同步更新统计数据
      const totalScore = res.data.reduce((sum, item) => sum + (item.total_score || 0), 0)
      const avg = res.data.length > 0 ? Math.round(totalScore / res.data.length).toString() : '0.0'
      this.setData({
        reviewCount: res.data.length,
        avgScore: avg
      })
      
      console.log('评价列表加载完成，总数:', reviewsWithCarInfo.length, '统计:', res.data.length, '条')
      
    } catch (err) {
      console.error('加载评价列表失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  // 加载统计数据
  async loadStatistics() {
    const { currentOpenid } = this.data
    
    console.log('加载统计数据, openid:', currentOpenid)
    
    if (!currentOpenid) return
    
    const db = wx.cloud.database()
    
    try {
      // 查询用户所有评价
      const res = await db.collection('reviews')
        .where({ _openid: currentOpenid })
        .get()
      
      console.log('统计查询结果:', res.data.length, '条记录')
      
      const count = res.data.length
      
      if (count === 0) {
        this.setData({
          reviewCount: 0,
          avgScore: '0.0'
        })
        return
      }
      
      // 计算平均打分
      const totalScore = res.data.reduce((sum, item) => sum + (item.total_score || 0), 0)
      const avg = Math.round(totalScore / count).toString()
      
      console.log('统计结果 - 数量:', count, '平均分:', avg)
      
      this.setData({
        reviewCount: count,
        avgScore: avg
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
      this.loadMyReviews()
    })
  },

  // 跳转到车型详情
  goCarDetail(e) {
    const carId = e.currentTarget.dataset.carid
    
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

  // 执行删除
  async doDeleteReview(reviewId, carId) {
    const db = wx.cloud.database()
    
    try {
      // 删除评价
      await db.collection('reviews').doc(reviewId).remove()
      
      wx.showToast({ title: '删除成功', icon: 'success' })
      
      // 更新车型平均分
      await this.updateCarAverageScore(carId)
      
      // 刷新列表和统计数据
      this.setData({ page: 0, hasMore: true, reviews: [] }, () => {
        if (this.data.currentOpenid) {
          this.loadMyReviews()
          this.loadStatistics()
        } else {
          this.loadMyReviewsWithoutOpenid()
        }
      })
      
    } catch (err) {
      console.error('删除评价失败:', err)
      wx.showToast({ title: '删除失败', icon: 'none' })
    }
  },

  // 更新车型平均分（删除后更新）
  async updateCarAverageScore(carId) {
    const db = wx.cloud.database()
    
    try {
      // 获取该车所有评价
      const res = await db.collection('reviews')
        .where({ car_id: carId })
        .get()
      
      const reviews = res.data
      const count = reviews.length
      
      if (count === 0) {
        // 如果没有评价了，清空车型数据
        await db.collection('cars').doc(carId).update({
          data: {
            avg_score: 0,
            review_count: 0,
            score_power: 0,
            score_handling: 0,
            score_space: 0,
            score_adas: 0,
            score_other: 0,
            updated_at: db.serverDate()
          }
        })
        console.log('车型评价已清空')
        return
      }
      
      // 计算各维度平均分
      const avgPower = reviews.reduce((sum, r) => sum + r.score_power, 0) / count
      const avgHandling = reviews.reduce((sum, r) => sum + r.score_handling, 0) / count
      const avgSpace = reviews.reduce((sum, r) => sum + r.score_space, 0) / count
      const avgAdas = reviews.reduce((sum, r) => sum + r.score_adas, 0) / count
      const avgOther = reviews.reduce((sum, r) => sum + r.score_other, 0) / count
      
      // 计算综合平均分
      const avgTotal = reviews.reduce((sum, r) => sum + r.total_score, 0) / count
      
      // 更新车型数据
      await db.collection('cars').doc(carId).update({
        data: {
          avg_score: avgTotal,
          review_count: count,
          score_power: avgPower,
          score_handling: avgHandling,
          score_space: avgSpace,
          score_adas: avgAdas,
          score_other: avgOther,
          updated_at: db.serverDate()
        }
      })
      
      console.log('车型平均分已更新:', avgTotal.toFixed(1))
      
    } catch (err) {
      console.error('更新车型平均分失败:', err)
    }
  },

  // 返回首页
  goHome() {
    wx.switchTab({
      url: '/pages/index/index'
    })
  },

  // 分享功能
  onShareAppMessage() {
    return {
      title: '看看我评价过哪些车',
      path: '/pages/myReviews/myReviews'
    }
  }
})
