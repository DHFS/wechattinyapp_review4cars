App({
  onLaunch: function () {
    console.log('App onLaunch 执行')
    // 初始化微信云开发环境
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      wx.showModal({
        title: '提示',
        content: '当前微信版本过低，无法使用云开发功能，请升级到最新微信版本后重试。'
      })
    } else {
      wx.cloud.init({
        env: '', // 这里可以填写您的云开发环境ID，如果不填则使用默认环境
        traceUser: true // 记录用户访问记录
      })
      console.log('云开发环境初始化成功')
    }

    // 小程序启动时自动获取用户登录信息
    this.autoLogin()
  },

  // 自动登录 - 获取用户 openid
  async autoLogin() {
    console.log('开始自动登录...')
    try {
      const res = await wx.cloud.callFunction({
        name: 'getOpenid'
      })
      
      console.log('getOpenid 云函数返回:', res)
      
      // 兼容两种返回格式：res.result.openid 或 res.result.userInfo.openId
      const openid = res.result?.openid || res.result?.userInfo?.openId
      
      if (openid) {
        console.log('自动登录成功，获取到 openid:', openid)
        
        // 存储到全局数据
        this.globalData.userInfo = {
          openid: openid,
          appid: res.result?.appid || res.result?.userInfo?.appId
        }
        
        // 尝试从本地缓存读取头像昵称
        const cachedUserInfo = wx.getStorageSync('userProfile') || {}
        if (cachedUserInfo.avatarUrl && cachedUserInfo.nickName) {
          this.globalData.userInfo = {
            ...this.globalData.userInfo,
            ...cachedUserInfo
          }
          console.log('从缓存读取用户信息:', cachedUserInfo.nickName)
        }
        
        // 通知各页面登录成功
        this.notifyLoginSuccess()
      } else {
        console.error('自动登录失败：云函数返回中没有 openid, result:', res.result)
      }
    } catch (err) {
      console.error('自动登录失败:', err)
      // 云函数调用失败，尝试从缓存读取之前的 openid
      const cachedUserInfo = wx.getStorageSync('userProfile') || {}
      if (cachedUserInfo.openid) {
        console.log('从缓存恢复 openid:', cachedUserInfo.openid)
        this.globalData.userInfo = cachedUserInfo
        this.notifyLoginSuccess()
      }
    }
  },

  // 保存用户信息（头像、昵称）
  saveUserProfile(profile) {
    if (profile.avatarUrl && profile.nickName) {
      this.globalData.userInfo = {
        ...this.globalData.userInfo,
        ...profile
      }
      // 保存到缓存，包含 openid
      wx.setStorageSync('userProfile', this.globalData.userInfo)
      console.log('用户信息已保存:', profile.nickName)
    }
  },

  // 获取当前用户信息
  getUserInfo() {
    return this.globalData.userInfo
  },

  // 检查是否已登录
  isLoggedIn() {
    const userInfo = this.globalData.userInfo
    return userInfo && userInfo.openid
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

  globalData: {
    userInfo: null
  }
})
