Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: "/pages/index/index",
        text: "排行榜"
      },
      {
        pagePath: "/pages/myReviews/myReviews",
        text: "我的评价"
      }
    ]
  },
  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset
      const url = data.path
      
      wx.switchTab({
        url: url
      })
      
      this.setData({
        selected: data.index
      })
    }
  }
})
