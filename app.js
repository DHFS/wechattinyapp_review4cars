App({
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
        env: '', // 这里可以填写您的云开发环境ID，如果不填则使用默认环境
        traceUser: true // 记录用户访问记录
      })
      console.log('云开发环境初始化成功')
    }
  },

  globalData: {
    userInfo: null
  }
})
