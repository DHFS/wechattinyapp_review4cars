// ============================================
// 添加新车型页面
// 本地词典优先做品牌/车型联想，云函数负责提交前纠错推荐
// ============================================

const app = getApp()
const carDictionary = require('../../carDictionary.js')

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
  // 提交新车型
  // ============================================

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

    const db = wx.cloud.database()

    try {
      const checkRes = await db.collection('cars')
        .where({
          brand: brand,
          model_name: modelName,
          model_year: modelYear
        })
        .get()

      if (checkRes.data.length > 0) {
        const existingCar = checkRes.data[0]
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

      const currentUserInfo = app && typeof app.getUserInfo === 'function'
        ? app.getUserInfo()
        : null

      const carData = {
        brand: brand,
        model_name: modelName,
        model_year: modelYear,
        power_type: resolvedFormData.powerType,
        price_range: priceRange,
        image_url: resolvedFormData.imageUrl || '',
        avg_score: 0,
        review_count: 0,
        score_power: 0,
        score_handling: 0,
        score_space: 0,
        score_adas: 0,
        score_other: 0,
        status: 'approved',
        created_at: db.serverDate(),
        created_by: currentUserInfo?.openid || ''
      }

      const res = await db.collection('cars').add({
        data: carData
      })

      wx.showToast({
        title: '添加成功',
        icon: 'success',
        duration: 1500
      })

      setTimeout(() => {
        wx.redirectTo({
          url: `/pages/detail/detail?id=${res._id}`
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
