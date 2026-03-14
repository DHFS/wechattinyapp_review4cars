// ============================================
// 添加新车型页面
// 用户可以自主添加车型信息
// ============================================

Page({
  data: {
    // 表单数据
    // TODO: imageUrl 预留字段，未来支持图片上传功能
    formData: {
      brand: '',
      model: '',
      year: '2024款',
      powerType: '',
      price: '',
      imageUrl: '' // 预留：车辆图片URL
    },

    // 动力形式选项
    powerTypes: [
      { name: '纯电', value: '纯电', color: '#22a568' },
      { name: '增程', value: '增程', color: '#007eba' },
      { name: '插混', value: '插混', color: '#c172d4' },
      { name: '燃油', value: '燃油', color: '#ffa200' }
    ],

    // 提交状态
    submitting: false
  },

  onLoad() {
    // 页面加载
  },

  // ============================================
  // 表单输入处理
  // ============================================

  onInputChange(e) {
    const { field } = e.currentTarget.dataset
    const { value } = e.detail
    
    this.setData({
      [`formData.${field}`]: value
    })
  },

  onPowerTypeSelect(e) {
    const { value } = e.currentTarget.dataset
    
    this.setData({
      'formData.powerType': value
    })
  },

  // ============================================
  // TODO: 图片上传功能（预留接口，未来升级）
  // ============================================
  /*
  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        this.uploadImage(tempFilePath)
      }
    })
  },

  async uploadImage(filePath) {
    wx.showLoading({ title: '上传中...' })
    
    try {
      const cloudPath = `car-images/${Date.now()}-${Math.random().toString(36).substr(2, 6)}.jpg`
      
      const res = await wx.cloud.uploadFile({
        cloudPath,
        filePath
      })
      
      this.setData({
        'formData.imageUrl': res.fileID
      })
      
      wx.showToast({ title: '上传成功', icon: 'success' })
      
    } catch (err) {
      console.error('上传图片失败:', err)
      wx.showToast({ title: '上传失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },
  */

  // ============================================
  // 提交新车型
  // ============================================

  async submitCar() {
    const { formData } = this.data
    
    // 表单验证
    if (!formData.brand.trim()) {
      wx.showToast({ title: '请输入品牌厂家', icon: 'none' })
      return
    }
    if (!formData.model.trim()) {
      wx.showToast({ title: '请输入车型名称', icon: 'none' })
      return
    }
    if (!formData.year.trim()) {
      wx.showToast({ title: '请输入年款', icon: 'none' })
      return
    }
    if (!formData.powerType) {
      wx.showToast({ title: '请选择动力形式', icon: 'none' })
      return
    }
    if (!formData.price.trim()) {
      wx.showToast({ title: '请输入售价区间', icon: 'none' })
      return
    }
    
    this.setData({ submitting: true })
    
    const db = wx.cloud.database()
    
    try {
      // 先检查是否已存在相同车型
      const checkRes = await db.collection('cars')
        .where({
          brand: formData.brand.trim(),
          model_name: formData.model.trim(),
          model_year: formData.year.trim()
        })
        .get()
      
      if (checkRes.data.length > 0) {
        // 已存在相同车型
        const existingCar = checkRes.data[0]
        wx.showModal({
          title: '车型已存在',
          content: `${existingCar.brand} ${existingCar.model_name} ${existingCar.model_year} 已在榜单中，直接去打分吧！`,
          confirmText: '去打分',
          cancelText: '取消',
          success: (res) => {
            if (res.confirm) {
              // 跳转到该车型详情页
              wx.navigateTo({
                url: `/pages/detail/detail?id=${existingCar._id}`
              })
            }
          }
        })
        this.setData({ submitting: false })
        return
      }
      
      // 准备提交数据
      const carData = {
        brand: formData.brand.trim(),
        model_name: formData.model.trim(),
        model_year: formData.year.trim(),
        power_type: formData.powerType,
        price_range: formData.price.trim(),
        image_url: formData.imageUrl || '', // 预留：图片URL
        // 初始评分数据（待后续评价后更新）
        avg_score: 0,
        review_count: 0,
        score_power: 0,
        score_handling: 0,
        score_space: 0,
        score_adas: 0,
        score_other: 0,
        // 状态标记 - 内测期间自动通过，正式上线后可改回 pending
        status: 'approved', // approved: 直接显示在首页
        // 创建信息
        created_at: db.serverDate(),
        created_by: '' // 用户openid，云函数会自动填充
      }
      
      console.log('提交车型数据:', carData)
      
      // 写入 cars 集合
      const res = await db.collection('cars').add({
        data: carData
      })
      
      console.log('提交成功:', res)
      const newCarId = res._id
      
      wx.showToast({
        title: '添加成功',
        icon: 'success',
        duration: 1500
      })
      
      // 延迟后跳转到新车型详情页
      setTimeout(() => {
        wx.redirectTo({
          url: `/pages/detail/detail?id=${newCarId}`
        })
      }, 1500)
      
    } catch (err) {
      console.error('提交车型失败:', err)
      wx.showToast({ title: '提交失败，请重试', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
