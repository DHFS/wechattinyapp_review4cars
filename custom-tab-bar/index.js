Component({
  data: {
    selected: 0
  },
  methods: {
    // 切换 Tab
    switchTab(e) {
      const data = e.currentTarget.dataset
      const url = data.path
      
      wx.switchTab({
        url: url
      })
      
      this.setData({
        selected: data.index
      })
    },
    
    // 跳转到添加车型页
    goAddCar() {
      wx.navigateTo({
        url: '/pages/addCar/addCar'
      })
    }
  }
})
