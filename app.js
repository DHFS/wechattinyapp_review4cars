App({
  pendingCarDraftStorageKey: 'pendingCarDraft',

  onLaunch: function () {
    // 初始化微信云开发环境
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      wx.showModal({
        title: '提示',
        content: '当前微信版本过低，无法使用云开发功能，请升级到最新微信版本后重试。'
      })
    } else {
      wx.cloud.init({
        env: 'cloud1-0gk6sd0s2d93d22d',
        traceUser: true // 记录用户访问记录
      })
    }

    // 小程序启动时自动获取用户登录信息
    this.autoLogin()
  },

  // 自动登录 - 获取用户 openid
  async autoLogin() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getOpenid'
      })
      
      // 兼容两种返回格式：res.result.openid 或 res.result.userInfo.openId
      const openid = res.result?.openid || res.result?.userInfo?.openId
      
      if (openid) {
        // 存储到全局数据
        this.globalData.userInfo = {
          openid: openid,
          appid: res.result?.appid || res.result?.userInfo?.appId,
          isAdmin: !!res.result?.isAdmin
        }
        
        // 尝试从本地缓存读取头像昵称
        const cachedUserInfo = wx.getStorageSync('userProfile') || {}
        if (cachedUserInfo.avatarUrl && cachedUserInfo.nickName) {
          this.globalData.userInfo = {
            ...this.globalData.userInfo,
            ...cachedUserInfo,
            isAdmin: !!res.result?.isAdmin
          }
        }
        
        // 通知各页面登录成功
        this.notifyLoginSuccess()
      } else {
        console.error('自动登录失败：云函数返回中没有 openid')
      }
    } catch (err) {
      console.error('自动登录失败:', err)
      // 云函数调用失败，尝试从缓存读取之前的 openid
      const cachedUserInfo = wx.getStorageSync('userProfile') || {}
      if (cachedUserInfo.openid) {
        this.globalData.userInfo = {
          ...cachedUserInfo,
          isAdmin: !!cachedUserInfo.isAdmin
        }
        this.notifyLoginSuccess()
      }
    }
  },

  // 保存用户信息（头像、昵称）
  saveUserProfile(profile) {
    if (profile.avatarUrl && profile.nickName) {
      this.globalData.userInfo = {
        ...this.globalData.userInfo,
        ...profile,
        isAdmin: !!(profile.isAdmin ?? this.globalData.userInfo?.isAdmin)
      }
      // 保存到缓存，包含 openid
      wx.setStorageSync('userProfile', this.globalData.userInfo)
    }
  },

  // 获取当前用户信息
  getUserInfo() {
    return this.globalData.userInfo
  },

  // 检查是否已登录
  isLoggedIn() {
    const userInfo = this.globalData.userInfo
    return !!(userInfo && userInfo.openid)
  },

  // 检查当前用户是否为管理员
  isAdmin() {
    const userInfo = this.globalData.userInfo || {}
    return !!userInfo.isAdmin
  },

  // 检查是否已完善资料（头像+昵称）
  hasCompleteProfile() {
    const userInfo = this.globalData.userInfo
    return userInfo && userInfo.avatarUrl && userInfo.nickName
  },

  // 通知各页面登录成功
  notifyLoginSuccess() {
    // 如果有页面在监听登录状态，通知它们
    if (this.loginSuccessCallback) {
      this.loginSuccessCallback(this.globalData.userInfo)
    }
  },

  // 注册登录成功回调
  onLoginSuccess(callback) {
    this.loginSuccessCallback = callback
  },

  // 保存新增车型草稿，兼容页面切换或小程序短暂回收场景
  savePendingCarDraft(draft) {
    const nextDraft = draft || null
    this.globalData.pendingCarDraft = nextDraft

    if (nextDraft) {
      wx.setStorageSync(this.pendingCarDraftStorageKey, nextDraft)
      return
    }

    wx.removeStorageSync(this.pendingCarDraftStorageKey)
  },

  // 获取新增车型草稿，优先读内存，其次读本地缓存
  getPendingCarDraft() {
    if (this.globalData.pendingCarDraft) {
      return this.globalData.pendingCarDraft
    }

    const cachedDraft = wx.getStorageSync(this.pendingCarDraftStorageKey) || null
    if (cachedDraft) {
      this.globalData.pendingCarDraft = cachedDraft
    }
    return cachedDraft
  },

  // 清空新增车型草稿
  clearPendingCarDraft() {
    this.globalData.pendingCarDraft = null
    wx.removeStorageSync(this.pendingCarDraftStorageKey)
  },

  globalData: {
    userInfo: null,
    pendingCarDraft: null
  }
})
