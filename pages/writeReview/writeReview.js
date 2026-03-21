// 全屏评价编辑页
const app = getApp()

Page({
  data: {
    // 车型信息
    carId: '',
    carName: '',
    
    // 评分数据
    ratingItems: [
      { key: 'power', name: '动力三电', value: 0, desc: '加速性能、平顺程度、续航表现' },
      { key: 'handling', name: '操控底盘', value: 0, desc: '悬挂调校、转向手感、驾驶乐趣' },
      { key: 'space', name: '空间内饰', value: 0, desc: '空间布置、乘坐舒适度、人机工学、内饰质感' },
      { key: 'adas', name: '辅驾安全', value: 0, desc: '辅助驾驶、主动安全、被动安全' },
      { key: 'other', name: '其他体验', value: 0, desc: '音响效果、车机体验、用车成本、NVH等' }
    ],
    calculatedScore: '-',
    
    // 评价内容
    comment: '',
    commentPlaceholder: '分享您的用车体验...\n\n建议您从以下几个方面展开：\n• 购车背景（为什么选择这款车）\n• 日常用车场景（通勤、长途、家用等）\n• 各维度详细体验（动力、操控、空间等）\n• 优点和不足\n• 给潜在买家的建议\n\n字数建议：200-1000字',
    
    // 编辑模式
    isEdit: false,
    reviewId: '',
    
    // 提交状态
    submitting: false,
    
    // 当前显示的步骤：'rating' | 'writing'
    currentStep: 'rating',
    
    // 资料设置弹窗
    showProfileModal: false,
    tempAvatarUrl: '',
    tempNickname: ''
  },

  onLoad(options) {
    const { carId, carName, isEdit, reviewId } = options
    
    this.setData({ 
      carId,
      carName: decodeURIComponent(carName || ''),
      isEdit: isEdit === 'true',
      reviewId: reviewId || ''
    })
    
    // 如果是编辑模式，加载已有数据
    if (isEdit === 'true' && reviewId) {
      this.loadReviewData(reviewId)
    }
  },

  // 加载已有评价数据（编辑模式）
  async loadReviewData(reviewId) {
    const db = wx.cloud.database()
    try {
      const res = await db.collection('reviews').doc(reviewId).get()
      const data = res.data
      
      if (data) {
        this.setData({
          ratingItems: [
            { key: 'power', name: '动力三电', value: data.score_power, desc: '加速性能、平顺程度、续航表现' },
            { key: 'handling', name: '操控底盘', value: data.score_handling, desc: '悬挂调校、转向手感、驾驶乐趣' },
            { key: 'space', name: '空间内饰', value: data.score_space, desc: '空间布置、乘坐舒适度、人机工学、内饰质感' },
            { key: 'adas', name: '辅驾安全', value: data.score_adas, desc: '辅助驾驶、主动安全、被动安全' },
            { key: 'other', name: '其他体验', value: data.score_other, desc: '音响效果、车机体验、用车成本、NVH等' }
          ],
          comment: data.comment || '',
          calculatedScore: Math.round(data.total_score).toString()
        })
      }
    } catch (err) {
      console.error('加载评价数据失败:', err)
    }
  },

  // 评分滑动
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

  // 计算综合得分
  calculateTotalScore() {
    const { ratingItems } = this.data
    
    // 检查是否有未评分项（value为0表示未评分）
    const hasUnrated = ratingItems.some(item => item.value === 0)
    if (hasUnrated) {
      this.setData({ calculatedScore: '-' })
      return
    }
    
    // 百分制权重计算
    const power = ratingItems[0].value * 0.3
    const handling = ratingItems[1].value * 0.2
    const space = ratingItems[2].value * 0.2
    const adas = ratingItems[3].value * 0.2
    const other = ratingItems[4].value * 0.1
    
    const total = power + handling + space + adas + other
    this.setData({ calculatedScore: Math.round(total).toString() })
  },

  // 输入评价
  onCommentInput(e) {
    this.setData({ comment: e.detail.value })
  },

  // 下一步
  nextStep() {
    // 验证评分
    const hasUnrated = this.data.ratingItems.some(item => item.value === 0)
    if (hasUnrated) {
      wx.showToast({ title: '请为所有维度评分', icon: 'none' })
      return
    }
    
    this.setData({ currentStep: 'writing' })
  },

  // 上一步
  prevStep() {
    this.setData({ currentStep: 'rating' })
  },

  // 提交评价
  async submitReview() {
    const { carId, carName, ratingItems, calculatedScore, comment, isEdit, reviewId, submitting } = this.data
    
    if (submitting) return
    
    // 验证
    if (calculatedScore === '-') {
      wx.showToast({ title: '请为所有维度评分', icon: 'none' })
      return
    }
    
    if (!comment.trim()) {
      wx.showToast({ title: '请输入评价内容', icon: 'none' })
      return
    }
    
    // 获取用户信息
    const userInfo = app.getUserInfo()
    if (!userInfo || !userInfo.avatarUrl || !userInfo.nickName) {
      // 未完善资料，显示完善资料弹窗
      this.setData({
        showProfileModal: true,
        tempAvatarUrl: userInfo?.avatarUrl || '',
        tempNickname: userInfo?.nickName || ''
      })
      return
    }
    
    this.setData({ submitting: true })
    
    try {
      const db = wx.cloud.database()
      
      const reviewData = {
        car_id: carId,
        user_avatar: userInfo.avatarUrl,
        user_nickname: userInfo.nickName,
        score_power: ratingItems[0].value,
        score_handling: ratingItems[1].value,
        score_space: ratingItems[2].value,
        score_adas: ratingItems[3].value,
        score_other: ratingItems[4].value,
        total_score: parseFloat(calculatedScore),
        comment: comment.trim(),
        updated_at: db.serverDate()
      }
      
      if (isEdit && reviewId) {
        // 更新评价
        await wx.cloud.callFunction({
          name: 'updateReview',
          data: { reviewId, updateData: reviewData }
        })
        wx.showToast({ title: '修改成功', icon: 'success' })
      } else {
        // 新增评价
        reviewData.created_at = db.serverDate()
        await db.collection('reviews').add({ data: reviewData })
        wx.showToast({ title: '评价成功', icon: 'success' })
      }
      
      // 更新车型平均分
      await this.updateCarAverageScore(carId)
      
      // 返回上一页
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      
    } catch (err) {
      console.error('提交评价失败:', err)
      wx.showToast({ title: '提交失败，请重试', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  // 更新车型平均分
  async updateCarAverageScore(carId) {
    try {
      await wx.cloud.callFunction({
        name: 'updateCarScore',
        data: { carId }
      })
    } catch (err) {
      console.error('更新车型平均分失败:', err)
    }
  },

  // ============ 资料设置弹窗 ============
  
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

  // 确认资料
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
    
    try {
      // 上传头像到云存储
      const avatarUrl = await this.uploadAvatar(tempAvatarUrl)
      
      // 保存用户信息到全局 App
      const userInfo = { avatarUrl, nickName: tempNickname.trim() }
      if (app && typeof app.saveUserProfile === 'function') {
        app.saveUserProfile(userInfo)
      }
      
      this.setData({ showProfileModal: false })
      
      // 继续提交评价
      this.submitReview()
    } catch (err) {
      console.error('保存头像失败:', err)
      wx.showToast({ title: '上传头像失败，请重试', icon: 'none' })
    }
  },

  // 取消返回
  onCancel() {
    wx.navigateBack()
  }
})
