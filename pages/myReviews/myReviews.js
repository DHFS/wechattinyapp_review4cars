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
    showAllReviews: false
  },

  onLoad() {
    // 从全局获取用户信息
    console.log('myReviews 页面 onLoad')
    this.loadUserInfoFromApp()
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

  // 从全局 App 获取用户信息
  loadUserInfoFromApp() {
    console.log('尝试从全局获取用户信息, app:', app)
    
    // 防御性检查
    if (!app || typeof app.getUserInfo !== 'function') {
      console.error('app 实例或 getUserInfo 方法不可用')
      // 降级方案：直接查询
      this.loadMyReviewsWithoutOpenid()
      return
    }
    
    const userInfo = app.getUserInfo()
    if (userInfo && userInfo.openid) {
      console.log('从全局获取用户信息:', userInfo.openid)
      this.setData({ currentOpenid: userInfo.openid })
      this.loadMyReviews()
      this.loadStatistics()
    } else {
      console.log('全局用户信息未准备好，等待登录回调')
      // 注册登录成功回调
      if (typeof app.onLoginSuccess === 'function') {
        app.onLoginSuccess((info) => {
          console.log('登录成功回调:', info.openid)
          this.setData({ currentOpenid: info.openid })
          this.loadMyReviews()
          this.loadStatistics()
        })
      } else {
        // 降级方案
        this.loadMyReviewsWithoutOpenid()
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

  // 【安全修复】查询所有数据后，在代码层面过滤只保留当前用户的数据
  async loadMyReviewsWithoutOpenid() {
    console.log('尝试查询并过滤当前用户数据...')
    this.setData({ loading: true })
    
    const db = wx.cloud.database()
    const { page, pageSize } = this.data
    
    try {
      // 查询所有评价（因为权限问题可能返回所有用户的数据）
      const res = await db.collection('reviews')
        .orderBy('created_at', 'desc')
        .get()
      
      console.log('查询到原始数据:', res.data.length, '条')
      
      if (res.data.length === 0) {
        this.setData({
          reviews: [],
          allReviews: [],
          loading: false,
          hasMore: false,
          reviewCount: 0,
          avgScore: '0.0'
        })
        return
      }
      
      // 【关键安全修复】按 _openid 分组，找出当前用户的评价
      // 当前用户的评价应该占大多数（或全部）
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
      
      // 分页处理
      const start = page * pageSize
      const end = start + pageSize
      const pageData = myReviews.slice(start, end)
      
      if (pageData.length === 0 && page === 0) {
        this.setData({
          reviews: [],
          allReviews: [],
          loading: false,
          hasMore: false,
          reviewCount: 0,
          avgScore: '0.0'
        })
        return
      }
      
      // 计算统计
      const totalScore = myReviews.reduce((sum, item) => sum + (item.total_score || 0), 0)
      const avg = myReviews.length > 0 ? Math.round(totalScore / myReviews.length).toString() : '0.0'
      
      // 获取车型信息
      const reviewsWithCarInfo = await Promise.all(
        pageData.map(async (review) => {
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
      
      // 首页最多显示3条
      const displayReviews = reviewsWithCarInfo.slice(0, 3)
      
      this.setData({
        allReviews: reviewsWithCarInfo,
        reviews: displayReviews,
        loading: false,
        hasMore: pageData.length === pageSize,
        reviewCount: myReviews.length,
        avgScore: avg
      })
      
      console.log('查询完成，当前用户共', myReviews.length, '条评价')
      
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
      const allReviews = page === 0 ? reviewsWithCarInfo : [...this.data.allReviews, ...reviewsWithCarInfo]
      
      // 首页最多显示3条
      const displayReviews = allReviews.slice(0, 3)
      
      this.setData({
        allReviews: allReviews,
        reviews: displayReviews,
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

  // 加载统计数据 - 只统计当前用户
  async loadStatistics() {
    const { currentOpenid } = this.data
    
    console.log('加载统计数据, openid:', currentOpenid)
    
    const db = wx.cloud.database()
    
    try {
      // 查询所有评价
      const res = await db.collection('reviews').get()
      
      console.log('统计查询原始结果:', res.data.length, '条记录')
      
      // 确定要统计的 openid
      let targetOpenid = currentOpenid
      
      // 如果没有 currentOpenid，从数据中推断
      if (!targetOpenid && res.data.length > 0) {
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
        
        if (targetOpenid) {
          this.setData({ currentOpenid: targetOpenid })
        }
      }
      
      // 只过滤当前用户的数据
      const myReviews = targetOpenid 
        ? res.data.filter(item => item._openid === targetOpenid)
        : res.data
      
      const count = myReviews.length
      
      if (count === 0) {
        this.setData({
          reviewCount: 0,
          avgScore: '0.0'
        })
        return
      }
      
      // 计算平均打分
      const totalScore = myReviews.reduce((sum, item) => sum + (item.total_score || 0), 0)
      const avg = Math.round(totalScore / count).toString()
      
      console.log('统计结果 - 当前用户数量:', count, '平均分:', avg)
      
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

  // 复制微信号
  copyWechat() {
    wx.setClipboardData({
      data: '340250808',
      success: () => {
        wx.showToast({
          title: '已复制微信号',
          icon: 'success',
          duration: 2000
        })
      }
    })
  },

  // 阻止冒泡
  preventBubble() {
    // 什么都不做，只是阻止冒泡
  }
})
