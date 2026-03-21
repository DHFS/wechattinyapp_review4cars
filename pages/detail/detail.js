// ============================================
// 车评侦探 - 车型详情页
// 包含雷达图、五维打分、评价编辑删除、云数据库操作
// ============================================

const app = getApp()

Page({
  data: {
    // 车型信息 - 初始为空，从数据库加载
    carInfo: {
      id: '',
      brand: '',
      model: '',
      powerType: '',
      tagColor: '#666666',
      year: '',
      price: '',
      avgScore: '-'
    },

    // 五维得分数据（用于展示）
    dimensions: [
      { name: '动力三电', score: 88, color: '#FF6B35', weight: '30%' },
      { name: '操控底盘', score: 85, color: '#4CAF50', weight: '20%' },
      { name: '空间内饰', score: 95, color: '#2196F3', weight: '20%' },
      { name: '辅驾安全', score: 92, color: '#9C27B0', weight: '20%' },
      { name: '其他体验', score: 80, color: '#FFC107', weight: '10%' }
    ],

    // 用户评分项（用于打分）- 默认0分
    ratingItems: [
      { key: 'power', name: '动力三电', value: 0, color: '#FFFFFF', desc: '加速性能、平顺程度、续航表现', weight: 0.3 },
      { key: 'handling', name: '操控底盘', value: 0, color: '#FFFFFF', desc: '悬挂调校、转向手感、驾驶乐趣', weight: 0.2 },
      { key: 'space', name: '空间内饰', value: 0, color: '#FFFFFF', desc: '空间布置、乘坐舒适度、人机工学、内饰质感', weight: 0.2 },
      { key: 'adas', name: '辅驾安全', value: 0, color: '#FFFFFF', desc: '辅助驾驶、主动安全、被动安全', weight: 0.2 },
      { key: 'other', name: '其他体验', value: 0, color: '#FFFFFF', desc: '音响效果、车机体验、用车成本、NVH等', weight: 0.1 }
    ],

    // 计算后的综合得分 - 未评分时显示"-"
    calculatedScore: '-',

    // 文字评价
    comment: '',

    // 提交状态
    submitting: false,

    // 当前用户openid（从全局获取）
    currentOpenid: '',

    // 编辑状态
    editingReview: false,
    editingReviewId: '',
    editingRatingItems: [],
    editingCalculatedScore: '-',
    editingComment: '',

    // 评价列表
    reviews: [],
    
    // 页面加载状态
    pageLoading: true,
    
    // 用户是否已评价
    hasReviewed: false,
    userReviewId: '',
    userReviewData: null,

    // 完善资料弹窗
    showProfileModal: false,
    tempAvatarUrl: '',
    tempNickname: '',
    tempAvatarFile: null,
    isEditingReview: false
  },

  onLoad(options) {
    // 获取从首页传递的车型ID
    const carId = options.id || options.car_id || ''
    const autoEdit = options.edit === 'true'
    
    this.setData({
      'carInfo.id': carId,
      autoEdit: autoEdit
    })
    
    console.log('详情页加载，车型ID:', carId, '自动进入编辑:', autoEdit)
    
    // 从全局获取用户信息
    this.loadUserInfoFromApp()
    
    // 加载车型详情和评价列表
    this.loadPageData(carId, autoEdit)
  },

  onShow() {
    // 从撰写评价页面返回时刷新数据
    const carId = this.data.carInfo.id
    if (carId) {
      console.log('详情页显示，刷新数据')
      this.loadPageData(carId, false)
    }
  },

  // 加载页面数据
  async loadPageData(carId, autoEdit) {
    // 加载车型详情
    await this.loadCarDetail(carId)
    
    // 加载评价列表并检查用户是否已评价
    await this.loadReviews(carId)
    
    // 如果是从"我的评价"页面跳转过来且已评价，自动进入编辑模式
    if (autoEdit && this.data.hasReviewed) {
      console.log('自动进入编辑模式')
      this.startEditFromMyReview()
    }
  },

  // 从全局 App 获取用户信息
  loadUserInfoFromApp() {
    console.log('尝试从全局获取用户信息, app:', app)
    
    // 防御性检查
    if (!app) {
      console.error('app 实例未获取到')
      return
    }
    
    if (typeof app.getUserInfo !== 'function') {
      console.error('app.getUserInfo 不是函数, app:', app)
      return
    }
    
    const userInfo = app.getUserInfo()
    console.log('从全局获取的用户信息:', userInfo)
    
    if (userInfo && userInfo.openid) {
      console.log('从全局获取到 openid:', userInfo.openid)
      this.setData({ currentOpenid: userInfo.openid })
    } else {
      console.log('全局用户信息未准备好，等待登录回调')
      // 注册登录成功回调
      if (typeof app.onLoginSuccess === 'function') {
        app.onLoginSuccess((info) => {
          console.log('登录成功回调:', info.openid)
          this.setData({ currentOpenid: info.openid })
          // 重新加载评价列表以更新"是否已评价"状态
          if (this.data.carInfo.id) {
            this.loadReviews(this.data.carInfo.id)
          }
        })
      }
    }
  },

  onReady() {
    // 页面渲染完成后绘制雷达图
    this.drawRadarChart()
  },

  // 下拉刷新
  onPullDownRefresh() {
    Promise.all([
      this.loadCarDetail(this.data.carInfo.id),
      this.loadReviews(this.data.carInfo.id)
    ]).then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // ============================================
  // 雷达图绘制 - 带分数标签
  // ============================================
  
  drawRadarChart() {
    const query = wx.createSelectorQuery()
    query.select('#radarCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0] || !res[0].node) return
        
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const dpr = wx.getSystemInfoSync().pixelRatio
        
        canvas.width = res[0].width * dpr
        canvas.height = res[0].height * dpr
        ctx.scale(dpr, dpr)
        
        const width = res[0].width
        const height = res[0].height
        const centerX = width / 2
        const centerY = height / 2
        const radius = Math.min(width, height) / 2 - 50
        
        const { dimensions } = this.data
        const values = dimensions.map(d => d.score)
        const labels = dimensions.map(d => d.name)
        const angleStep = (Math.PI * 2) / labels.length
        
        ctx.clearRect(0, 0, width, height)
        
        // 绘制网格
        for (let i = 1; i <= 5; i++) {
          ctx.beginPath()
          ctx.strokeStyle = 'rgba(255,255,255,0.1)'
          ctx.lineWidth = 1
          for (let j = 0; j < labels.length; j++) {
            const angle = j * angleStep - Math.PI / 2
            const r = (radius / 5) * i
            const x = centerX + Math.cos(angle) * r
            const y = centerY + Math.sin(angle) * r
            if (j === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.closePath()
          ctx.stroke()
        }
        
        // 绘制轴线和标签
        for (let i = 0; i < labels.length; i++) {
          const angle = i * angleStep - Math.PI / 2
          const x = centerX + Math.cos(angle) * radius
          const y = centerY + Math.sin(angle) * radius
          
          // 轴线
          ctx.beginPath()
          ctx.strokeStyle = 'rgba(255,255,255,0.15)'
          ctx.lineWidth = 1
          ctx.moveTo(centerX, centerY)
          ctx.lineTo(x, y)
          ctx.stroke()
          
          // 标签
          ctx.fillStyle = '#AAAAAA'
          ctx.font = '12px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          const labelX = centerX + Math.cos(angle) * (radius + 20)
          const labelY = centerY + Math.sin(angle) * (radius + 20)
          ctx.fillText(labels[i], labelX, labelY)
          
          // 分数标签 - 显示在每个维度的数据点旁边（保留1位小数）
          const scoreR = (values[i] / 100) * radius + 15
          const scoreX = centerX + Math.cos(angle) * scoreR
          const scoreY = centerY + Math.sin(angle) * scoreR
          ctx.fillStyle = '#FFFFFF'
          ctx.font = 'bold 11px sans-serif'
          ctx.fillText(Math.round(values[i]) + '分', scoreX, scoreY)
        }
        
        // 绘制数据区域
        ctx.beginPath()
        ctx.fillStyle = 'rgba(255, 107, 53, 0.25)'
        ctx.strokeStyle = '#FF6B35'
        ctx.lineWidth = 2
        
        for (let i = 0; i < values.length; i++) {
          const angle = i * angleStep - Math.PI / 2
          const r = (values[i] / 100) * radius
          const x = centerX + Math.cos(angle) * r
          const y = centerY + Math.sin(angle) * r
          
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        
        // 绘制数据点
        for (let i = 0; i < values.length; i++) {
          const angle = i * angleStep - Math.PI / 2
          const r = (values[i] / 100) * radius
          const x = centerX + Math.cos(angle) * r
          const y = centerY + Math.sin(angle) * r
          
          ctx.beginPath()
          ctx.fillStyle = '#FF6B35'
          ctx.arc(x, y, 4, 0, Math.PI * 2)
          ctx.fill()
          
          ctx.beginPath()
          ctx.strokeStyle = '#FFFFFF'
          ctx.lineWidth = 1.5
          ctx.arc(x, y, 4, 0, Math.PI * 2)
          ctx.stroke()
        }
      })
  },

  onRadarTouch() {},

  // ============================================
  // 用户相关
  // ============================================
  
  // 获取当前用户信息（从全局App）
  getCurrentUserInfo() {
    return app.getUserInfo()
  },

  // 检查用户是否已完善资料
  checkUserProfile() {
    return app.hasCompleteProfile()
  },

  // ============================================
  // 数据加载
  // ============================================
  
  async loadCarDetail(carId) {
    if (!carId) return
    
    const db = wx.cloud.database()
    try {
      const res = await db.collection('cars').doc(carId).get()
      const car = res.data
      
      // 计算五维平均分
      const scorePower = car.score_power || 0
      const scoreHandling = car.score_handling || 0
      const scoreSpace = car.score_space || 0
      const scoreAdas = car.score_adas || 0
      const scoreOther = car.score_other || 0
      
      // 如果有评价数据，计算平均分（分数颜色根据评分动态设置）
      let avgDimensions = [
        { name: '动力三电', score: Math.round(scorePower), color: this.getScoreColor(scorePower), weight: '30%' },
        { name: '操控底盘', score: Math.round(scoreHandling), color: this.getScoreColor(scoreHandling), weight: '20%' },
        { name: '空间内饰', score: Math.round(scoreSpace), color: this.getScoreColor(scoreSpace), weight: '20%' },
        { name: '辅驾安全', score: Math.round(scoreAdas), color: this.getScoreColor(scoreAdas), weight: '20%' },
        { name: '其他体验', score: Math.round(scoreOther), color: this.getScoreColor(scoreOther), weight: '10%' }
      ]
      
      this.setData({
        carInfo: {
          id: carId,
          brand: car.brand,
          model: car.model_name,
          powerType: car.power_type,
          tagColor: this.getTagColor(car.power_type),
          year: car.model_year,
          price: car.price_range,
          avgScore: car.avg_score ? Math.round(car.avg_score).toString() : '0',
          reviewCount: car.review_count || 0
        },
        dimensions: avgDimensions,
        pageLoading: false
      }, () => {
        this.drawRadarChart()
      })
      
    } catch (err) {
      console.error('加载车型详情失败:', err)
      this.setData({ pageLoading: false })
      wx.showToast({
        title: '加载失败，请重试',
        icon: 'none'
      })
    }
  },

  getTagColor(powerType) {
    const colorMap = {
      '增程': '#007eba',
      '纯电': '#22a568',
      '燃油': '#ffa200',
      '插混': '#c172d4'
    }
    return colorMap[powerType] || '#666666'
  },

  // 根据分数获取颜色
  getScoreColor(score) {
    if (score >= 90) return '#FF6B35' // 橙色
    if (score >= 80) return '#4CAF50' // 绿色
    if (score >= 60) return '#FFFFFF' // 白色
    return '#F44336' // 红色
  },

  async loadReviews(carId) {
    if (!carId) return
    
    const db = wx.cloud.database()
    const { currentOpenid } = this.data
    
    try {
      // 直接查询该车型的所有评价（需要数据库权限设置为所有人可读）
      const res = await db.collection('reviews')
        .where({ car_id: carId })
        .orderBy('created_at', 'desc')
        .limit(50)
        .get()
      
      console.log('加载评价数据:', res.data.length, '条')
      console.log('第一条评价数据:', res.data[0] ? {
        id: res.data[0]._id,
        avatar: res.data[0].user_avatar,
        nickname: res.data[0].user_nickname
      } : '无数据')
      
      const reviewData = res.data
      
      // 检查当前用户是否已评价
      const userReview = reviewData.find(item => item._openid === currentOpenid)
      const hasReviewed = !!userReview
      
      // 收集所有需要转换的头像 fileID（去重）- 和首页榜单逻辑一致
      const avatarList = reviewData
        .map(item => item.user_avatar)
        .filter(avatar => avatar && avatar.trim() !== '')
      
      const cloudFileIDs = avatarList.filter(url => url.startsWith('cloud://'))
      const normalUrls = avatarList.filter(url => !url.startsWith('cloud://'))
      
      // 去重
      const avatarFileIDs = [...new Set(cloudFileIDs)]
      
      console.log('详情页 - 头像列表:', avatarList)
      console.log('详情页 - 需要转换的cloud://头像:', avatarFileIDs)
      console.log('详情页 - 普通URL头像:', normalUrls)
      
      // 批量获取临时链接 - 和首页榜单逻辑一致，一次性转换
      let avatarUrlMap = {}
      if (avatarFileIDs.length > 0) {
        try {
          const tempRes = await wx.cloud.getTempFileURL({
            fileList: avatarFileIDs
          })
          tempRes.fileList.forEach(item => {
            if (item.fileID && item.tempFileURL) {
              avatarUrlMap[item.fileID] = item.tempFileURL
            } else {
              console.log('头像转换失败:', item.fileID, item.errMsg)
            }
          })
          console.log('头像URL映射:', avatarUrlMap)
        } catch (e) {
          console.log('获取头像临时链接失败:', e)
        }
      } else {
        console.log('没有需要转换的cloud://头像')
      }
      
      const defaultAvatar = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'
      
      const reviews = reviewData.map(item => {
        // 处理头像链接 - 和首页榜单逻辑一致
        let userAvatar = item.user_avatar
        
        if (userAvatar && userAvatar.startsWith('cloud://')) {
          // cloud:// 链接，尝试转换
          const converted = avatarUrlMap[userAvatar]
          userAvatar = converted || defaultAvatar
        } else if (userAvatar && userAvatar.startsWith('http')) {
          // 已经是 HTTPS 链接，直接使用
          // 保持原样
        } else {
          // 无效格式，使用默认头像
          userAvatar = defaultAvatar
        }
        
        // 处理评论折叠
        const comment = item.comment || ''
        const maxLength = 120
        const isLongComment = comment.length > maxLength
        
        return {
          _id: item._id,
          _openid: item._openid,
          userAvatar: userAvatar,
          userNickname: item.user_nickname,
          time: this.formatTime(item.created_at),
          totalScore: item.total_score ? Math.round(item.total_score).toString() : '0',
          comment: comment,
          isLongComment: isLongComment,
          isExpanded: false,
          displayComment: isLongComment ? comment.slice(0, maxLength) + '...' : comment,
          dimensions: [
            { name: '动力', score: Math.round(item.score_power), color: this.getScoreColor(item.score_power) },
            { name: '操控', score: Math.round(item.score_handling), color: this.getScoreColor(item.score_handling) },
            { name: '空间', score: Math.round(item.score_space), color: this.getScoreColor(item.score_space) },
            { name: '辅驾', score: Math.round(item.score_adas), color: this.getScoreColor(item.score_adas) },
            { name: '其他', score: Math.round(item.score_other), color: this.getScoreColor(item.score_other) }
          ],
          isOwner: item._openid === currentOpenid
        }
      })
      
      // 输出调试信息
      console.log('第一个评价的头像:', reviews[0]?.userAvatar)
      console.log('第一个评价的昵称:', reviews[0]?.userNickname)
      console.log('第一个评价的原始头像:', reviewData[0]?.user_avatar)
      console.log('所有评价的头像:', reviews.map(r => ({avatar: r.userAvatar, nickname: r.userNickname})))
      
      this.setData({ 
        reviews,
        hasReviewed,
        userReviewId: hasReviewed ? userReview._id : '',
        userReviewData: hasReviewed ? userReview : null
      })
      
      console.log('用户是否已评价:', hasReviewed)
      console.log('评价数据已设置到页面, 共', reviews.length, '条')
    } catch (err) {
      console.error('加载评价列表失败:', err)
    }
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

  // ============================================
  // 评分相关 - 实时显示
  // ============================================

  onSliderChange(e) {
    const { key } = e.currentTarget.dataset
    const value = e.detail.value
    
    const ratingItems = this.data.ratingItems.map(item => {
      if (item.key === key) return { ...item, value }
      return item
    })
    
    this.setData({ ratingItems }, () => {
      this.calculateTotalScore()
    })
  },

  onInputComment(e) {
    this.setData({ comment: e.detail.value })
  },

  // ============================================
  // 综合得分计算 - 有未评分项时显示"-"
  // ============================================
  
  calculateTotalScore() {
    const { ratingItems } = this.data
    
    // 检查是否所有项都已评分
    const hasUnrated = ratingItems.some(item => item.value === 0)
    if (hasUnrated) {
      this.setData({ calculatedScore: '-' })
      return '-'
    }
    
    const power = ratingItems.find(i => i.key === 'power').value * 0.3
    const handling = ratingItems.find(i => i.key === 'handling').value * 0.2
    const space = ratingItems.find(i => i.key === 'space').value * 0.2
    const adas = ratingItems.find(i => i.key === 'adas').value * 0.2
    const other = ratingItems.find(i => i.key === 'other').value * 0.1
    
    const total = power + handling + space + adas + other
    const formatted = total.toFixed(1)
    
    this.setData({ calculatedScore: formatted })
    return formatted
  },

  // ============================================
  // 提交评价 - 先验证，填写资料，最后提交
  // ============================================
  
  // 表单验证
  validateForm() {
    const { ratingItems, comment } = this.data
    const hasUnrated = ratingItems.some(item => item.value === 0)
    if (hasUnrated) {
      wx.showToast({ title: '请为所有维度评分', icon: 'none' })
      return false
    }
    if (!comment.trim()) {
      wx.showToast({ title: '请输入评价内容', icon: 'none' })
      return false
    }
    return true
  },

  // 提交评价入口 - 跳转到全屏编辑页
  submitReview() {
    const { hasReviewed, carInfo } = this.data
    
    // 检查是否已评价过
    if (hasReviewed) {
      wx.showModal({
        title: '您已评价过',
        content: '您已经为该车型提交过评价，是否修改您的评价？',
        confirmText: '修改评价',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.startEditFromMyReview()
          }
        }
      })
      return
    }
    
    // 跳转到全屏编辑页
    wx.navigateTo({
      url: `/pages/writeReview/writeReview?carId=${carInfo.id}&carName=${encodeURIComponent(carInfo.brand + ' ' + carInfo.model)}`
    })
  },

  // 关闭资料弹窗
  closeProfileModal() {
    this.setData({ 
      showProfileModal: false,
      isEditingReview: false
    })
  },

  // 选择头像
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail
    console.log('选择的头像:', avatarUrl)
    this.setData({
      tempAvatarUrl: avatarUrl,
      tempAvatarFile: avatarUrl
    })
  },

  // 输入昵称
  onNicknameInput(e) {
    this.setData({ tempNickname: e.detail.value })
  },

  // 昵称输入完成
  onNicknameChange(e) {
    this.setData({ tempNickname: e.detail.value })
  },

  // 上传头像到云存储
  async uploadAvatar(filePath) {
    try {
      const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath
      })
      console.log('头像上传成功:', uploadRes.fileID)
      return uploadRes.fileID
    } catch (err) {
      console.error('头像上传失败:', err)
      throw err
    }
  },

  // 确认资料并提交
  async confirmProfile() {
    const { tempAvatarUrl, tempNickname, isEditingReview, submitting } = this.data
    
    // 防止重复提交
    if (submitting) {
      console.log('正在提交中，请勿重复点击')
      return
    }
    
    if (!tempAvatarUrl) {
      wx.showToast({ title: '请选择头像', icon: 'none' })
      return
    }
    if (!tempNickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    
    this.setData({ submitting: true })
    
    try {
      // 上传头像到云存储
      const avatarUrl = await this.uploadAvatar(tempAvatarUrl)
      
      // 保存用户信息到全局 App
      const userInfo = {
        avatarUrl: avatarUrl,
        nickName: tempNickname.trim()
      }
      if (app && typeof app.saveUserProfile === 'function') {
        app.saveUserProfile(userInfo)
      }
      
      this.setData({ 
        showProfileModal: false,
        isEditingReview: false
      })
      
      // 根据状态决定是提交新评价还是更新评价
      if (isEditingReview) {
        await this.doUpdateReview(userInfo)
      } else {
        await this.doSubmitReview(userInfo)
      }
    } catch (err) {
      console.error('保存头像失败:', err)
      wx.showToast({ title: '上传头像失败，请重试', icon: 'none' })
      this.setData({ submitting: false })
    }
  },
  
  // 真正的提交逻辑
  async doSubmitReview(userInfo) {
    const { carInfo, ratingItems, calculatedScore, comment } = this.data
    
    console.log('doSubmitReview 接收到的 userInfo:', userInfo)
    
    this.setData({ submitting: true })
    
    try {
      const db = wx.cloud.database()
      
      const reviewData = {
        car_id: carInfo.id,
        user_avatar: userInfo.avatarUrl,
        user_nickname: userInfo.nickName,
        score_power: ratingItems.find(i => i.key === 'power').value,
        score_handling: ratingItems.find(i => i.key === 'handling').value,
        score_space: ratingItems.find(i => i.key === 'space').value,
        score_adas: ratingItems.find(i => i.key === 'adas').value,
        score_other: ratingItems.find(i => i.key === 'other').value,
        total_score: parseFloat(calculatedScore),
        comment: comment.trim(),
        created_at: db.serverDate()
      }
      
      console.log('准备保存的 reviewData:', reviewData)
      
      const addResult = await db.collection('reviews').add({ data: reviewData })
      console.log('保存成功，返回结果:', addResult)
      await this.updateCarAverageScore(carInfo.id)
      
      wx.showToast({ title: '评价成功', icon: 'success' })
      
      await Promise.all([
        this.loadCarDetail(carInfo.id),
        this.loadReviews(carInfo.id)
      ])
      
      this.setData({
        comment: '',
        ratingItems: this.data.ratingItems.map(item => ({ ...item, value: 0 })),
        calculatedScore: '-'
      })
    } catch (err) {
      console.error('提交评价失败:', err)
      wx.showToast({ title: '提交失败，请重试', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  // 更新车型平均分 - 使用云函数（管理员权限）
  async updateCarAverageScore(carId) {
    console.log('开始更新车型平均分, carId:', carId)
    try {
      const res = await wx.cloud.callFunction({
        name: 'updateCarScore',
        data: { carId }
      })
      
      console.log('updateCarScore 云函数返回:', JSON.stringify(res, null, 2))
      
      if (!res.result) {
        console.error('云函数返回结果为空, res:', res)
        return
      }
      
      // 检查返回结构
      console.log('res.result 类型:', typeof res.result)
      console.log('res.result 内容:', res.result)
      console.log('res.result.success:', res.result?.success)
      console.log('res.result.message:', res.result?.message)
      
      if (res.result && res.result.success === true) {
        console.log('车型平均分已更新:', res.result.avg_score, '评价数:', res.result.review_count)
      } else {
        console.error('更新车型平均分失败:', res.result?.message || '未知错误')
        wx.showToast({ title: '更新分数失败', icon: 'none' })
      }
    } catch (err) {
      console.error('调用更新车型平均分云函数失败:', err)
      wx.showToast({ title: '更新分数失败', icon: 'none' })
    }
  },

  // ============================================
  // 删除评价
  // ============================================
  
  deleteReview(e) {
    const reviewId = e.currentTarget.dataset.id
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条评价吗？',
      confirmColor: '#FF5252',
      success: (res) => {
        if (res.confirm) {
          this.doDeleteReview(reviewId)
        }
      }
    })
  },

  async doDeleteReview(reviewId) {
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
      
      // 更新车型平均分
      await this.updateCarAverageScore(this.data.carInfo.id)
      
      wx.showToast({ title: '删除成功', icon: 'success' })
      
      // 刷新数据
      await Promise.all([
        this.loadCarDetail(this.data.carInfo.id),
        this.loadReviews(this.data.carInfo.id)
      ])
      
    } catch (err) {
      console.error('删除评价失败:', err)
      wx.showToast({ title: '删除失败：' + (err.message || '无权限'), icon: 'none' })
    }
  },

  // ============================================
  // 编辑评价
  // ============================================
  
  // 从用户自己的评价数据进入编辑模式
  // 点击"修改我的评价"按钮进入编辑模式
  startEditFromButton() {
    console.log('用户点击修改评价按钮')
    this.startEditFromMyReview()
  },

  startEditFromMyReview() {
    const { userReviewData, userReviewId, carInfo } = this.data
    
    if (!userReviewData) {
      wx.showToast({ title: '无法获取评价数据', icon: 'none' })
      return
    }
    
    // 跳转到全屏编辑页（编辑模式）
    wx.navigateTo({
      url: `/pages/writeReview/writeReview?carId=${carInfo.id}&carName=${encodeURIComponent(carInfo.brand + ' ' + carInfo.model)}&isEdit=true&reviewId=${userReviewId}`
    })
  },
  
  startEdit(e) {
    const reviewId = e.currentTarget.dataset.id
    const review = this.data.reviews.find(r => r._id === reviewId)
    const { carInfo } = this.data
    
    if (!review || !carInfo) return
    
    // 跳转到全屏编辑页（编辑模式）
    wx.navigateTo({
      url: `/pages/writeReview/writeReview?carId=${carInfo.id}&carName=${encodeURIComponent(carInfo.brand + ' ' + carInfo.model)}&isEdit=true&reviewId=${reviewId}`
    })
  },

  cancelEdit() {
    this.setData({
      editingReview: false,
      editingReviewId: '',
      editingComment: ''
    })
  },

  onEditSliderChange(e) {
    const { key } = e.currentTarget.dataset
    const value = e.detail.value
    
    const editingRatingItems = this.data.editingRatingItems.map(item => {
      if (item.key === key) return { ...item, value }
      return item
    })
    
    const hasUnrated = editingRatingItems.some(item => item.value === 0)
    const editingCalculatedScore = hasUnrated ? '-' : (
      editingRatingItems[0].value * 0.3 +
      editingRatingItems[1].value * 0.2 +
      editingRatingItems[2].value * 0.2 +
      editingRatingItems[3].value * 0.2 +
      editingRatingItems[4].value * 0.1
    ).toFixed(0)
    
    this.setData({ editingRatingItems, editingCalculatedScore })
  },

  onEditInputComment(e) {
    this.setData({ editingComment: e.detail.value })
  },

  // 编辑评价入口
  updateReview() {
    const { editingRatingItems, editingComment, submitting } = this.data
    
    // 防止重复提交
    if (submitting) {
      console.log('正在提交中，请勿重复点击')
      return
    }
    
    const hasUnrated = editingRatingItems.some(item => item.value === 0)
    if (hasUnrated) {
      wx.showToast({ title: '请为所有维度评分', icon: 'none' })
      return
    }
    
    if (!editingComment.trim()) {
      wx.showToast({ title: '请输入评价内容', icon: 'none' })
      return
    }
    
    // 获取全局用户信息
    let userInfo = null
    if (app && typeof app.getUserInfo === 'function') {
      userInfo = app.getUserInfo()
    }
    
    // 如果用户已完善资料，直接更新
    if (userInfo && userInfo.avatarUrl && userInfo.nickName) {
      this.doUpdateReview({
        avatarUrl: userInfo.avatarUrl,
        nickName: userInfo.nickName
      })
      return
    }
    
    // 未完善资料，显示完善资料弹窗
    this.setData({
      showProfileModal: true,
      tempAvatarUrl: userInfo?.avatarUrl || '',
      tempNickname: userInfo?.nickName || '',
      tempAvatarFile: null,
      isEditingReview: true
    })
  },
  
  // 真正的更新逻辑 - 使用云函数
  async doUpdateReview(userInfo) {
    const { editingReviewId, editingRatingItems, editingCalculatedScore, editingComment } = this.data
    
    this.setData({ submitting: true })
    
    try {
      const updateData = {
        score_power: editingRatingItems[0].value,
        score_handling: editingRatingItems[1].value,
        score_space: editingRatingItems[2].value,
        score_adas: editingRatingItems[3].value,
        score_other: editingRatingItems[4].value,
        total_score: parseFloat(editingCalculatedScore),
        comment: editingComment.trim()
      }
      
      // 如果获取到了用户信息，更新用户信息
      if (userInfo && userInfo.avatarUrl) {
        updateData.user_avatar = userInfo.avatarUrl
        updateData.user_nickname = userInfo.nickName
        console.log('更新评价时同步更新用户信息:', updateData.user_avatar, updateData.user_nickname)
      }
      
      // 使用云函数更新（管理员权限）
      const res = await wx.cloud.callFunction({
        name: 'updateReview',
        data: {
          reviewId: editingReviewId,
          updateData
        }
      })
      
      console.log('updateReview 云函数返回:', res)
      
      if (!res.result) {
        console.error('云函数返回结果为空')
        wx.showToast({ title: '修改失败：服务器返回空', icon: 'none' })
        return
      }
      
      if (!res.result.success) {
        console.error('云函数返回错误:', res.result.message)
        wx.showToast({ title: res.result.message || '修改失败', icon: 'none' })
        return
      }
      
      // 先更新平均分，等待完成
      await this.updateCarAverageScore(this.data.carInfo.id)
      
      // 延迟一下确保数据库更新完成
      await new Promise(resolve => setTimeout(resolve, 500))
      
      wx.showToast({ title: '修改成功', icon: 'success' })
      
      this.setData({
        editingReview: false,
        editingReviewId: '',
        editingComment: ''
      })
      
      // 重新加载车型详情和评价列表
      await this.loadCarDetail(this.data.carInfo.id)
      await this.loadReviews(this.data.carInfo.id)
    } catch (err) {
      console.error('修改评价失败:', err)
      wx.showToast({ title: '修改失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  // ============================================
  // 分享功能
  // ============================================
  
  onShareAppMessage() {
    const { carInfo } = this.data
    const carName = `${carInfo.brand} ${carInfo.model}`
    const score = carInfo.avgScore
    
    return {
      title: `车友们给 ${carName} 打出了 ${score} 分，你也来评评理！`,
      path: `/pages/detail/detail?id=${carInfo.id}`
    }
  },

  onShareTimeline() {
    const { carInfo } = this.data
    const carName = `${carInfo.brand} ${carInfo.model}`
    const score = carInfo.avgScore
    
    return {
      title: `车友们给 ${carName} 打出了 ${score} 分，你也来评评理！`,
      query: `id=${carInfo.id}`
    }
  },

  // 切换评论展开/收起
  toggleComment(e) {
    const { index } = e.currentTarget.dataset
    const { reviews } = this.data
    const review = reviews[index]
    
    if (!review || !review.isLongComment) return
    
    const newExpanded = !review.isExpanded
    const maxLength = 120
    
    // 更新该条评价的展开状态和显示内容
    const newReviews = reviews.map((item, i) => {
      if (i === index) {
        return {
          ...item,
          isExpanded: newExpanded,
          displayComment: newExpanded ? item.comment : item.comment.slice(0, maxLength) + '...'
        }
      }
      return item
    })
    
    this.setData({ reviews: newReviews })
  }
})
