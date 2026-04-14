// 全屏评价编辑页
const app = getApp()

Page({
  data: {
    // 车型信息
    carId: '',
    carName: '',
    draftMode: false,
    
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
    commentPlaceholder: '分享你的真实用车体验\n\n可以从这些方面展开：\n1. 为什么选这台车\n2. 平时主要怎么开\n3. 动力、操控、空间等真实感受\n4. 最满意和最想吐槽的地方\n5. 会不会推荐给别人\n\n建议 200-1000 字',
    
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
    const { carId, carName, isEdit, reviewId, draftMode } = options
    const resolvedDraftMode = draftMode === 'true'
    const pendingCarDraft = typeof app.getPendingCarDraft === 'function'
      ? app.getPendingCarDraft()
      : app.globalData.pendingCarDraft

    this.setData({ 
      carId,
      carName: decodeURIComponent(carName || ''),
      draftMode: resolvedDraftMode,
      isEdit: isEdit === 'true',
      reviewId: reviewId || ''
    })

    if (resolvedDraftMode && !pendingCarDraft) {
      wx.showModal({
        title: '草稿已失效',
        content: '新增车型草稿不存在，请重新填写车型信息。',
        showCancel: false,
        success: () => {
          wx.navigateBack({
            delta: 1
          })
        }
      })
      return
    }
    
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

    this.updateRatingItem(key, value)
  },

  updateRatingItem(key, nextValue) {
    const clampedValue = Math.max(0, Math.min(100, Number(nextValue) || 0))

    const ratingItems = this.data.ratingItems.map(item => {
      if (item.key === key) return { ...item, value: clampedValue }
      return item
    })

    this.setData({ ratingItems }, () => {
      this.calculateTotalScore()
    })
  },

  onQuickScore(e) {
    const { key, value } = e.currentTarget.dataset
    this.updateRatingItem(key, value)
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

  async checkReviewContentSecurity({ title = '', content = '' }) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'checkContentSecurity',
        data: {
          title,
          content
        }
      })

      const result = res.result || {}
      if (!result.success) {
        console.error('评价内容安全检测未通过:', {
          errCode: result.errCode,
          errMsg: result.errMsg
        })

        const fallbackMessage = result.errCode === -604101
          ? '内容安全服务配置异常，请稍后重试'
          : '内容安全检测未通过，请调整后重试'

        return {
          success: false,
          errCode: result.errCode || -1,
          errMsg: result.errMsg || '',
          debugMessage: result.debugMessage || '',
          message: result.message || fallbackMessage
        }
      }

      return {
        success: true
      }
    } catch (err) {
      console.error('评价内容安全检测失败:', err)
      return {
        success: false,
        errCode: -1,
        message: '内容安全检测失败，请稍后重试'
      }
    }
  },

  // 提交评价
  async submitReview() {
    const { carId, carName, ratingItems, calculatedScore, comment, isEdit, reviewId, submitting, draftMode } = this.data
    
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
      const sanitizedComment = comment.trim()
      const securityRes = await this.checkReviewContentSecurity({
        title: carName,
        content: sanitizedComment
      })

      if (!securityRes.success) {
        console.error('submitReview 被内容安全拦截:', {
          errCode: securityRes.errCode,
          errMsg: securityRes.errMsg
        })
        wx.showToast({
          title: securityRes.message || '内容安全检测未通过，请调整后重试',
          icon: 'none'
        })
        return
      }
      
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
        comment: sanitizedComment,
        updated_at: db.serverDate()
      }
      
      if (isEdit && reviewId) {
        // 更新评价
        await wx.cloud.callFunction({
          name: 'updateReview',
          data: { reviewId, updateData: reviewData }
        })
        wx.showToast({ title: '修改成功', icon: 'success' })
      } else if (draftMode) {
        const pendingCarDraft = typeof app.getPendingCarDraft === 'function'
          ? app.getPendingCarDraft()
          : app.globalData.pendingCarDraft

        if (!pendingCarDraft) {
          throw new Error('新增车型草稿不存在，请重新填写')
        }

        const submitRes = await wx.cloud.callFunction({
          name: 'submitPendingCarReview',
          data: {
            carDraft: pendingCarDraft,
            reviewDraft: {
              userAvatar: userInfo.avatarUrl,
              userNickname: userInfo.nickName,
              scorePower: ratingItems[0].value,
              scoreHandling: ratingItems[1].value,
              scoreSpace: ratingItems[2].value,
              scoreAdas: ratingItems[3].value,
              scoreOther: ratingItems[4].value,
              totalScore: parseFloat(calculatedScore),
              comment: sanitizedComment
            }
          }
        })

        if (!submitRes.result || !submitRes.result.success) {
          throw new Error(submitRes.result?.message || '提交审核失败')
        }

        if (typeof app.clearPendingCarDraft === 'function') {
          app.clearPendingCarDraft()
        } else {
          app.globalData.pendingCarDraft = null
          wx.removeStorageSync('pendingCarDraft')
        }
        wx.showModal({
          title: '提交成功',
          content: '你刚才新增的车型、评分和评论都已进入审核。审核结束后会出现在首页，你也可以到“我的评价”里查看或删除这条评论。',
          showCancel: false,
          confirmText: '返回首页',
          success: () => {
            wx.switchTab({
              url: '/pages/index/index'
            })
          }
        })
        return
      } else {
        // 新增评价
        reviewData.status = 'approved'
        reviewData.audit_locked = false
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
      wx.showToast({ title: err.message || '提交失败，请重试', icon: 'none' })
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
