// ============================================
// 添加新车型页面
// 本地词典优先做品牌/车型联想，云函数负责提交前纠错推荐
// ============================================

const app = getApp()
const carDictionary = require('../../carDictionary.js')
const db = wx.cloud.database()
const _ = db.command

const BRAND_ENTRIES = carDictionary.brands || []
const POWER_TYPE_META = {
  '纯电': {
    color: '#22a568',
    background: 'rgba(34, 165, 104, 0.16)'
  },
  '增程': {
    color: '#007eba',
    background: 'rgba(0, 126, 186, 0.16)'
  },
  '插混': {
    color: '#c172d4',
    background: 'rgba(193, 114, 212, 0.16)'
  },
  '燃油': {
    color: '#ffa200',
    background: 'rgba(255, 162, 0, 0.16)'
  }
}

function normalizeText(text = '') {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[\s\-_.·•/]/g, '')
}

function buildBrandKeywords(entry) {
  return [entry.name, ...(entry.aliases || [])]
    .map(normalizeText)
    .filter(Boolean)
}

function buildModelKeywords(model) {
  return [model.name, ...(model.aliases || [])]
    .map(normalizeText)
    .filter(Boolean)
}

function getBrandEntryByName(name = '') {
  return BRAND_ENTRIES.find(entry => entry.name === name) || null
}

function findExactBrandEntry(input = '') {
  const normalizedInput = normalizeText(input)
  if (!normalizedInput) return null

  return BRAND_ENTRIES.find(entry => buildBrandKeywords(entry).includes(normalizedInput)) || null
}

function findExactModelEntry(brandEntry, input = '') {
  if (!brandEntry) return null

  const normalizedInput = normalizeText(input)
  if (!normalizedInput) return null

  return (brandEntry.models || []).find(model => buildModelKeywords(model).includes(normalizedInput)) || null
}

function buildBrandSuggestion(entry) {
  return {
    name: entry.name,
    subtitle: `${(entry.models || []).length} 个常见车型`,
    aliases: entry.aliases || []
  }
}

function buildModelSuggestion(brandEntry, model) {
  const powerTypeMeta = POWER_TYPE_META[model.powerType] || {}

  return {
    id: `${brandEntry.name}-${model.name}`,
    brand: brandEntry.name,
    model: model.name,
    powerType: model.powerType || '',
    priceRange: model.priceRange || '',
    powerTypeColor: powerTypeMeta.color || '#FFB38E',
    powerTypeBackground: powerTypeMeta.background || 'rgba(255, 107, 53, 0.14)',
    subtitle: model.priceRange || '暂无售价区间'
  }
}

function getBrandSuggestions(query = '') {
  const normalizedQuery = normalizeText(query)

  if (!normalizedQuery) {
    return BRAND_ENTRIES.slice(0, 8).map(buildBrandSuggestion)
  }

  return BRAND_ENTRIES
    .filter(entry => buildBrandKeywords(entry).some(keyword => keyword.includes(normalizedQuery)))
    .slice(0, 8)
    .map(buildBrandSuggestion)
}

function getModelSuggestionsForBrand(brandEntry, query = '') {
  if (!brandEntry) return []

  const models = brandEntry.models || []
  const normalizedQuery = normalizeText(query)

  if (!normalizedQuery) {
    return models.map(model => buildModelSuggestion(brandEntry, model))
  }

  return models
    .filter(model => buildModelKeywords(model).some(keyword => keyword.includes(normalizedQuery)))
    .map(model => buildModelSuggestion(brandEntry, model))
}

function getModelSuggestionsAcrossBrands(query = '') {
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) return []

  const results = []

  BRAND_ENTRIES.forEach(brandEntry => {
    ;(brandEntry.models || []).forEach(model => {
      if (buildModelKeywords(model).some(keyword => keyword.includes(normalizedQuery))) {
        results.push(buildModelSuggestion(brandEntry, model))
      }
    })
  })

  return results.slice(0, 8)
}

Page({
  data: {
    // 表单数据
    formData: {
      brand: '',
      model: '',
      year: '2024款',
      powerType: '',
      price: '',
      imageUrl: ''
    },

    powerTypes: [
      { name: '纯电', value: '纯电', color: '#22a568' },
      { name: '增程', value: '增程', color: '#007eba' },
      { name: '插混', value: '插混', color: '#c172d4' },
      { name: '燃油', value: '燃油', color: '#ffa200' }
    ],

    selectedBrandName: '',
    brandSuggestions: [],
    modelSuggestions: [],
    suggestionItems: [],
    suggestionField: '',
    showSuggestionPanel: false,
    keyboardHeight: 0,
    panelBottomOffset: 12,
    activeInputField: '',
    showBrandSuggestions: false,
    showModelSuggestions: false,
    submitting: false
  },

  onLoad() {
    // 检查登录状态，未登录则引导登录
    if (!app.isLoggedIn()) {
      wx.showModal({
        title: '需要登录',
        content: '添加车型需要先登录',
        showCancel: false,
        confirmText: '去登录',
        success: () => {
          wx.switchTab({ url: '/pages/myReviews/myReviews' })
        }
      })
      return
    }
    
    if (typeof wx.onKeyboardHeightChange === 'function') {
      this.handleKeyboardHeightChange = (res) => {
        const nextHeight = Math.max(res.height || 0, 0)
        const nextData = {
          keyboardHeight: nextHeight
        }

        // 面板打开时锁定当前位置，避免 iOS 在滚动联想列表时因键盘收起导致面板跳动。
        if (nextHeight > 0) {
          nextData.panelBottomOffset = nextHeight + 12
        } else if (!this.data.showSuggestionPanel) {
          nextData.panelBottomOffset = 12
        }

        this.setData({
          ...nextData
        })
      }

      wx.onKeyboardHeightChange(this.handleKeyboardHeightChange)
    }
  },

  onUnload() {
    if (typeof wx.offKeyboardHeightChange === 'function' && this.handleKeyboardHeightChange) {
      wx.offKeyboardHeightChange(this.handleKeyboardHeightChange)
    }
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

    if (field === 'brand') {
      this.handleBrandInput(value)
      return
    }

    if (field === 'model') {
      this.handleModelInput(value)
    }
  },

  showSuggestionPanel(field, items) {
    this.setData({
      suggestionField: field,
      suggestionItems: items,
      showSuggestionPanel: items.length > 0,
      showBrandSuggestions: field === 'brand' && items.length > 0,
      showModelSuggestions: field === 'model' && items.length > 0
    })
  },

  hideSuggestionPanel() {
    this.setData({
      suggestionField: '',
      suggestionItems: [],
      showSuggestionPanel: false,
      panelBottomOffset: this.data.keyboardHeight > 0 ? this.data.keyboardHeight + 12 : 12,
      showBrandSuggestions: false,
      showModelSuggestions: false
    })
  },

  handleBrandInput(value) {
    const exactBrandEntry = findExactBrandEntry(value)
    const brandSuggestions = getBrandSuggestions(value)
    const currentModel = this.data.formData.model
    const shouldShowBrandSuggestions = !!value.trim() && brandSuggestions.length > 0

    this.setData({
      selectedBrandName: exactBrandEntry ? exactBrandEntry.name : '',
      brandSuggestions,
      showBrandSuggestions: shouldShowBrandSuggestions,
      modelSuggestions: exactBrandEntry
        ? getModelSuggestionsForBrand(exactBrandEntry, currentModel)
        : currentModel.trim()
          ? getModelSuggestionsAcrossBrands(currentModel)
          : this.data.modelSuggestions,
      showModelSuggestions: false
    })

    if (this.data.showSuggestionPanel) {
      this.hideSuggestionPanel()
    }
  },

  handleModelInput(value) {
    const brandEntry = this.getResolvedBrandEntry()
    const modelSuggestions = brandEntry
      ? getModelSuggestionsForBrand(brandEntry, value)
      : getModelSuggestionsAcrossBrands(value)
    const shouldShowModelSuggestions = !!value.trim() && modelSuggestions.length > 0

    this.setData({
      modelSuggestions,
      showModelSuggestions: shouldShowModelSuggestions
    })

    if (shouldShowModelSuggestions) {
      this.showSuggestionPanel('model', modelSuggestions)
      return
    }

    if (this.data.suggestionField === 'model') {
      this.hideSuggestionPanel()
    }
  },

  getResolvedBrandEntry() {
    return findExactBrandEntry(this.data.formData.brand) ||
      getBrandEntryByName(this.data.selectedBrandName)
  },

  onBrandFocus() {
    const brandValue = this.data.formData.brand
    const brandSuggestions = getBrandSuggestions(brandValue)
    const shouldShowBrandSuggestions = brandSuggestions.length > 0

    this.setData({
      activeInputField: 'brand',
      brandSuggestions,
      showBrandSuggestions: shouldShowBrandSuggestions
    })
  },

  onModelFocus() {
    const brandEntry = this.getResolvedBrandEntry()
    const modelValue = this.data.formData.model
    const modelSuggestions = brandEntry
      ? getModelSuggestionsForBrand(brandEntry, modelValue)
      : getModelSuggestionsAcrossBrands(modelValue)

    this.setData({
      activeInputField: 'model',
      showBrandSuggestions: false,
      modelSuggestions,
      showModelSuggestions: modelSuggestions.length > 0
    })

    if (modelSuggestions.length > 0) {
      this.showSuggestionPanel('model', modelSuggestions)
      return
    }

    this.hideSuggestionPanel()
  },

  onInputBlur(e) {
    const { field } = e.currentTarget.dataset

    if (this.data.activeInputField === field) {
      this.setData({
        activeInputField: ''
      })
    }
  },

  noop() {},

  onSuggestionMaskTap() {
    this.hideSuggestionPanel()
  },

  selectBrandSuggestion(e) {
    const { brand } = e.currentTarget.dataset
    const brandEntry = getBrandEntryByName(brand)
    const modelSuggestions = brandEntry ? getModelSuggestionsForBrand(brandEntry) : []

    this.setData({
      'formData.brand': brand,
      selectedBrandName: brand,
      brandSuggestions: [],
      showBrandSuggestions: false,
      modelSuggestions,
      showModelSuggestions: false
    })
  },

  selectModelSuggestion(e) {
    const { brand, model, powertype, pricerange } = e.currentTarget.dataset
    const nextData = {
      'formData.model': model,
      selectedBrandName: brand || this.data.selectedBrandName,
      modelSuggestions: [],
      showModelSuggestions: false
    }

    if (brand) {
      nextData['formData.brand'] = brand
    }

    if (powertype) {
      nextData['formData.powerType'] = powertype
    }

    if (pricerange) {
      nextData['formData.price'] = pricerange
    }

    this.setData(nextData)
    this.hideSuggestionPanel()
  },

  onPowerTypeSelect(e) {
    const { value } = e.currentTarget.dataset

    this.setData({
      'formData.powerType': value
    })
  },

  // ============================================
  // 图片上传处理
  // ============================================

  // 选择图片
  chooseImage() {
    // 检查是否登录
    const app = getApp()
    const userInfo = app.globalData.userInfo || {}
    const cachedProfile = wx.getStorageSync('userProfile') || {}
    const isLoggedIn = !!(userInfo.openid || cachedProfile.openid)
    
    if (!isLoggedIn) {
      wx.showModal({
        title: '需要登录',
        content: '上传图片需要登录账号，是否立即登录？',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            // 跳转到我的页面登录
            wx.switchTab({
              url: '/pages/myReviews/myReviews'
            })
          }
        }
      })
      return
    }
    
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'], // 使用压缩图片
      success: (res) => {
        const tempFile = res.tempFiles[0]
        const maxSize = 5 * 1024 * 1024 // 5MB
        
        // 检查文件大小
        if (tempFile.size > maxSize) {
          wx.showToast({
            title: '图片不能超过5MB',
            icon: 'none',
            duration: 2000
          })
          return
        }
        
        this.uploadImage(tempFile.tempFilePath)
      }
    })
  },

  // 上传图片到云存储
  async uploadImage(filePath) {
    wx.showLoading({ title: '上传中...' })

    try {
      const cloudPath = `car-images/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`
      
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath
      })

      this.setData({
        'formData.imageUrl': uploadRes.fileID
      })

      wx.showToast({
        title: '上传成功',
        icon: 'success'
      })
    } catch (err) {
      console.error('上传图片失败:', err)
      wx.showToast({
        title: '上传失败',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
    }
  },

  // 预览图片
  previewImage() {
    const { imageUrl } = this.data.formData
    if (!imageUrl) return

    wx.previewImage({
      urls: [imageUrl],
      current: imageUrl
    })
  },

  // 删除图片
  deleteImage() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这张图片吗？',
      confirmColor: '#ff6b35',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            'formData.imageUrl': ''
          })
        }
      }
    })
  },

  // ============================================
  // 提交前智能纠错
  // ============================================

  async resolveFormDataBeforeSubmit() {
    const { formData } = this.data
    const localBrandEntry = this.getResolvedBrandEntry()
    const localModelEntry = findExactModelEntry(localBrandEntry, formData.model)

    if (localBrandEntry && localModelEntry) {
      return {
        ...formData,
        brand: localBrandEntry.name,
        model: localModelEntry.name,
        powerType: formData.powerType || localModelEntry.powerType || '',
        price: formData.price || localModelEntry.priceRange || ''
      }
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'suggestCarModels',
        data: {
          brandText: formData.brand,
          modelText: formData.model,
          limit: 3
        }
      })

      const result = res.result || {}
      if (!result.success) {
        return {
          ...formData,
          brand: localBrandEntry ? localBrandEntry.name : formData.brand.trim()
        }
      }

      if (result.exactBrandMatched && result.exactModelMatched && result.bestMatch) {
        return {
          ...formData,
          brand: result.bestMatch.brand,
          model: result.bestMatch.model,
          powerType: formData.powerType || result.bestMatch.powerType || '',
          price: formData.price || result.bestMatch.priceRange || ''
        }
      }

      if (result.suggestions && result.suggestions.length > 0) {
        const selectedSuggestion = await this.askUserToChooseSuggestion(result.suggestions)
        if (!selectedSuggestion) {
          return null
        }

        if (selectedSuggestion.keepOriginal) {
          return {
            ...formData,
            brand: localBrandEntry ? localBrandEntry.name : formData.brand.trim()
          }
        }

        return {
          ...formData,
          brand: selectedSuggestion.brand,
          model: selectedSuggestion.model,
          powerType: formData.powerType || selectedSuggestion.powerType || '',
          price: formData.price || selectedSuggestion.priceRange || ''
        }
      }
    } catch (err) {
      console.error('智能纠错调用失败:', err)
    }

    return {
      ...formData,
      brand: localBrandEntry ? localBrandEntry.name : formData.brand.trim()
    }
  },

  askUserToChooseSuggestion(suggestions) {
    const itemList = suggestions
      .map(item => `${item.brand} ${item.model}`)
      .concat('仍按当前输入提交')

    return new Promise((resolve) => {
      wx.showActionSheet({
        alertText: '检测到更可能的车型，建议先确认一下',
        itemList,
        success: (res) => {
          if (res.tapIndex < suggestions.length) {
            resolve(suggestions[res.tapIndex])
            return
          }

          resolve({ keepOriginal: true })
        },
        fail: () => {
          resolve(null)
        }
      })
    })
  },

  // ============================================
  // 新增车型 -> 进入写首评流程
  // ============================================

  // 将审核状态转换成用户更容易理解的文案。
  getSubmissionStatusLabel(status = '') {
    if (status === 'approved') return '已通过'
    if (status === 'rejected') return '已拒绝'
    return '待审核'
  },

  // 保存新增车型草稿，供写首评页最终一次性提交“车型 + 首评”审核包。
  saveDraftAndGoWriteReview(draftData) {
    const nextDraft = {
      ...draftData,
      savedAt: Date.now()
    }

    if (typeof app.savePendingCarDraft === 'function') {
      app.savePendingCarDraft(nextDraft)
    } else {
      app.globalData.pendingCarDraft = nextDraft
      wx.setStorageSync('pendingCarDraft', nextDraft)
    }

    wx.navigateTo({
      url: `/pages/writeReview/writeReview?draftMode=true&carName=${encodeURIComponent(`${draftData.brand} ${draftData.model}`)}`
    })
  },

  async checkDraftContentSecurity({ title = '', content = '' }) {
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
        console.error('新增车型内容安全检测未通过:', {
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
      console.error('新增车型内容安全检测失败:', err)
      return {
        success: false,
        errCode: -1,
        message: '内容安全检测失败，请稍后重试'
      }
    }
  },

  async submitCar() {
    const resolvedFormData = await this.resolveFormDataBeforeSubmit()
    if (!resolvedFormData) {
      return
    }

    const brand = resolvedFormData.brand.trim()
    const modelName = resolvedFormData.model.trim()
    const modelYear = resolvedFormData.year.trim()
    const priceRange = resolvedFormData.price.trim()

    if (!brand) {
      wx.showToast({ title: '请输入品牌厂家', icon: 'none' })
      return
    }
    if (!modelName) {
      wx.showToast({ title: '请输入车型名称', icon: 'none' })
      return
    }
    if (!modelYear) {
      wx.showToast({ title: '请输入年款', icon: 'none' })
      return
    }
    if (!resolvedFormData.powerType) {
      wx.showToast({ title: '请选择动力形式', icon: 'none' })
      return
    }
    if (!priceRange) {
      wx.showToast({ title: '请输入售价区间', icon: 'none' })
      return
    }

    this.setData({
      submitting: true,
      'formData.brand': brand,
      'formData.model': modelName,
      'formData.powerType': resolvedFormData.powerType,
      'formData.price': priceRange
    })

    try {
      const checkRes = await db.collection('cars')
        .where({
          brand: brand,
          model_name: modelName,
          model_year: modelYear,
          status: _.in(['pending', 'approved'])
        })
        .get()

      if (checkRes.data.length > 0) {
        const existingCar = checkRes.data[0]
        const statusLabel = this.getSubmissionStatusLabel(existingCar.status)

        if (existingCar.status === 'approved') {
          wx.showModal({
            title: '车型已存在',
            content: `${existingCar.brand} ${existingCar.model_name} ${existingCar.model_year} 已在榜单中，直接去打分吧！`,
            confirmText: '去打分',
            cancelText: '取消',
            success: (res) => {
              if (res.confirm) {
                wx.navigateTo({
                  url: `/pages/detail/detail?id=${existingCar._id}`
                })
              }
            }
          })
          this.setData({ submitting: false })
          return
        }

        wx.showModal({
          title: '车型已提交',
          content: `${existingCar.brand} ${existingCar.model_name} ${existingCar.model_year} 当前状态：${statusLabel}。请勿重复提交，审核通过后会自动公开展示。`,
          showCancel: false,
          confirmText: '知道了'
        })
        this.setData({ submitting: false })
        return
      }

      const securityRes = await this.checkDraftContentSecurity({
        title: `${brand} ${modelName}`.trim(),
        content: `${modelYear} ${resolvedFormData.powerType} ${priceRange}`.trim()
      })

      if (!securityRes.success) {
        console.error('submitCar 被内容安全拦截:', {
          errCode: securityRes.errCode,
          errMsg: securityRes.errMsg
        })
        wx.showToast({
          title: securityRes.message || '内容含有违规词汇，请修改后重试',
          icon: 'none'
        })
        this.setData({ submitting: false })
        return
      }

      this.saveDraftAndGoWriteReview({
        brand,
        model: modelName,
        year: modelYear,
        powerType: resolvedFormData.powerType,
        price: priceRange,
        imageUrl: resolvedFormData.imageUrl || ''
      })
    } catch (err) {
      console.error('提交车型失败:', err)
      wx.showToast({ title: '提交失败，请重试', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
