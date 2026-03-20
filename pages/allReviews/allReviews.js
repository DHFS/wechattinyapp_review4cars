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

  onLoad() {
    // 从全局获取用户信息
    this.loadUserInfoFromApp()
  },

  // 从全局 App 获取用户信息
  loadUserInfoFromApp() {
    console.log('尝试从全局获取用户信息, app:', app)
    
    // 防御性检查
    if (!app || typeof app.getUserInfo !== 'function') {
      console.error('app 实例或 getUserInfo 方法不可用')
      // 降级方案
      this.loadAllReviewsWithoutOpenid()
      return
    }
    
    const userInfo = app.getUserInfo()
    if (userInfo && userInfo.openid) {
      console.log('从全局获取用户信息:', userInfo.openid)
      this.setData({ currentOpenid: userInfo.openid })
      this.loadAllReviews()
      this.loadStatistics()
    } else {
      console.log('全局用户信息未准备好，等待登录回调')
      // 注册登录成功回调
      if (typeof app.onLoginSuccess === 'function') {
        app.onLoginSuccess((info) => {
          console.log('登录成功回调:', info.openid)
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

    const db = wx.cloud.database()

    try {
      const res = await db.collection('reviews')
        .where({ _openid: currentOpenid })
        .orderBy('created_at', 'desc')
        .skip(page * pageSize)
        .limit(pageSize)
        .get()

      if (res.data.length === 0) {
        this.setData({
          allReviews: page === 0 ? [] : this.data.allReviews,
          loading: false,
          hasMore: false
        })
        return
      }

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

      const hasMore = reviewsWithCarInfo.length === pageSize
      const newAllReviews = page === 0 ? reviewsWithCarInfo : [...this.data.allReviews, ...reviewsWithCarInfo]

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
    console.log('尝试查询并过滤当前用户数据...')
    this.setData({ loading: true })
    
    const db = wx.cloud.database()
    
    try {
      // 查询所有评价
      const res = await db.collection('reviews')
        .orderBy('created_at', 'desc')
        .get()
      
      console.log('查询到原始数据:', res.data.length, '条')
      
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
      
      console.log('检测到当前用户openid:', userOpenid, '评价数:', maxCount)
      
      if (!userOpenid || userOpenid === 'unknown') {
        console.error('无法识别当前用户')
        this.setData({ loading: false })
        return
      }
      
      this.setData({ currentOpenid: userOpenid })
      
      // 【关键安全修复】只保留当前用户的评价
      const myReviews = res.data.filter(item => item._openid === userOpenid)
      console.log('过滤后当前用户评价:', myReviews.length, '条')
      
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
            return {
              _id: review._id,
              carId: review.car_id,
              brand: car?.brand || '未知品牌',
              modelName: car?.model_name || '未知车型',
              powerType: car?.power_type || '纯电',
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
    
    const db = wx.cloud.database()
    try {
      // 查询所有评价
      const res = await db.collection('reviews').get()
      
      // 如果没有数据，直接返回
      if (res.data.length === 0) {
        this.setData({ reviewCount: 0, avgScore: '0.0' })
        return
      }
      
      // 确定要统计的 openid
      let targetOpenid = currentOpenid
      
      // 如果没有 currentOpenid，从数据中推断
      if (!targetOpenid) {
        const openidCount = {}
        res.data.forEach(item => {
          const oid = item._openid || 'unknown'
          openidCount[oid] = (openidCount[oid] || 0) + 1
        })
        
        let maxCount = 0
        for (const [oid, count] of Object.entries(openidCount)) {
          if (count > maxCount) {
            maxCount = count
            targetOpenid = oid
          }
        }
      }
      
      // 只过滤当前用户的数据
      const myReviews = res.data.filter(item => item._openid === targetOpenid)
      const count = myReviews.length
      
      if (count === 0) {
        this.setData({ reviewCount: 0, avgScore: '0.0' })
        return
      }

      const totalScore = myReviews.reduce((sum, item) => sum + (item.total_score || 0), 0)
      const avg = Math.round(totalScore / count).toString()

      this.setData({ reviewCount: count, avgScore: avg })
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

      // 更新车型平均分
      await this.updateCarAverageScore(carId)

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
      
      if (res.result.success) {
        console.log('车型平均分已更新:', res.result.avg_score?.toFixed(1))
      } else {
        console.error('更新车型平均分失败:', res.result.message)
      }
    } catch (err) {
      console.error('调用更新车型平均分云函数失败:', err)
    }
  },

  // 阻止冒泡
  preventBubble() {}
})
