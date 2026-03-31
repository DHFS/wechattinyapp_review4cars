Page({
  data: {
    // 车辆列表
    carList: [],
    // 加载状态
    loading: true,
    // 是否还有更多数据
    hasMore: true,
    // 当前页码
    page: 0,
    // 每页数量
    pageSize: 20
  },

  onLoad() {
    // 页面加载时从数据库获取数据
    this.loadCarList()
  },

  onShow() {
    // 页面显示时刷新数据（从添加车型页或详情页返回时）
    this.setData({ 
      page: 0, 
      hasMore: true,
      carList: []  // 清空列表强制重新加载
    }, () => {
      this.loadCarList()
    })
    // 设置tabBar选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.setData({
      page: 0,
      hasMore: true,
      carList: []
    }, () => {
      this.loadCarList().then(() => {
        wx.stopPullDownRefresh()
      })
    })
  },

  // 上拉加载更多
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore()
    }
  },

  // 从云数据库加载车辆列表
  async loadCarList() {
    this.setData({ loading: true })
    
    const db = wx.cloud.database()
    const { page, pageSize } = this.data
    
    try {
      // 从云数据库获取已审核的车辆列表，按avg_score降序排列
      const res = await db.collection('cars')
        .where({ status: 'approved' })  // 只显示已审核的车型
        .orderBy('avg_score', 'desc')
        .skip(page * pageSize)
        .limit(pageSize)
        .get()
      
      // 处理数据格式，将数据库字段映射到页面字段
      const newList = await Promise.all(res.data.map(async (car) => {
        // 获取动力类型对应的样式类
        let tagClass = ''
        switch (car.power_type) {
          case '增程':
            tagClass = 'tag-zengcheng'
            break
          case '纯电':
            tagClass = 'tag-chundi'
            break
          case '燃油':
            tagClass = 'tag-ranyou'
            break
          case '插混':
            tagClass = 'tag-chahun'
            break
          default:
            tagClass = 'tag-zengcheng'
        }
        
        // 获取该车型最新的3条评价的用户头像和总评价数
        let reviewerAvatars = []
        let reviewCount = 0
        try {
          const reviewRes = await db.collection('reviews')
            .where({ car_id: car._id })
            .orderBy('created_at', 'desc')
            .limit(3)
            .get()
          
          // 实时统计评价数量（先获取总数）
          const countRes = await db.collection('reviews')
            .where({ car_id: car._id })
            .count()
          reviewCount = countRes.total || 0
          
          // 获取最新的3条评价的头像（按时间顺序，最新的在前），保持顺序不做去重
          const avatarList = reviewRes.data
            .map(r => r.user_avatar)
            .filter(avatar => avatar && avatar.trim() !== '')
          
          // 分离云存储fileID和普通URL
          const cloudFileIDs = avatarList.filter(url => url.startsWith('cloud://'))
          const normalUrls = avatarList.filter(url => !url.startsWith('cloud://'))
          
          // 将云存储 fileID 转换为 HTTPS 临时链接
          let urlMap = {}
          if (cloudFileIDs.length > 0) {
            const tempRes = await wx.cloud.getTempFileURL({
              fileList: cloudFileIDs
            })
            tempRes.fileList.forEach(item => {
              if (item.fileID && item.tempFileURL) {
                urlMap[item.fileID] = item.tempFileURL
              }
            })
          }
          
          // 按原始顺序组装头像URL（最新的在前，即数组索引0在最上层）
          reviewerAvatars = avatarList.map(url => {
            if (url.startsWith('cloud://')) {
              return urlMap[url] || ''
            }
            return url
          }).filter(url => url !== '')
          
          console.log('车型', car.model_name, '获取到', reviewerAvatars.length, '个头像:', reviewerAvatars)
          console.log('原始评价数据:', reviewRes.data.map(r => ({ 
            avatar: r.user_avatar, 
            nickname: r.user_nickname,
            time: r.created_at 
          })))
        } catch (e) {
          console.log('获取评价头像失败:', e)
        }
        
        // 处理图片URL（支持云存储fileID和普通URL）
        let imageUrl = car.image_url || ''
        if (imageUrl && imageUrl.startsWith('cloud://')) {
          // 云存储fileID需要在获取列表时批量转换，这里先保留
          // 实际转换在获取列表后统一处理
        }

        return {
          id: car._id,
          brand: car.brand,
          model: car.model_name,
          powerType: car.power_type,
          year: car.model_year,
          price: car.price_range,
          score: car.avg_score ? Math.round(car.avg_score).toString() : '0',
          count: car.review_count || 0,
          tagClass: tagClass,
          reviewerAvatars: reviewerAvatars,
          reviewCount: reviewCount,
          imageUrl: car.image_url || ''
        }
      }))
      
      // 处理图片URL转换（云存储fileID转HTTPS）
      const carListWithImages = await this.processImageUrls(newList)
      
      // 检查是否还有更多数据
      const hasMore = carListWithImages.length === pageSize
      
      // 调试：打印图片状态
      console.log('=== 首页车型图片状态 ===')
      carListWithImages.forEach((car, idx) => {
        console.log(`${idx + 1}. ${car.brand} ${car.model}: imageUrl=${car.imageUrl ? '有' : '无'}`)
      })
      
      this.setData({
        carList: page === 0 ? carListWithImages : [...this.data.carList, ...carListWithImages],
        loading: false,
        hasMore: hasMore
      })
      
      console.log('从数据库加载车辆成功:', newList.length, '条')
      
    } catch (err) {
      console.error('加载车辆列表失败:', err)
      this.setData({ loading: false })
      
      wx.showToast({
        title: '加载失败，请重试',
        icon: 'none'
      })
    }
  },

  // 加载更多数据
  loadMore() {
    this.setData({
      page: this.data.page + 1
    }, () => {
      this.loadCarList()
    })
  },

  // 格式化数字（超过1000显示为1k）
  formatNumber(num) {
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + '万'
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k'
    }
    return num.toString()
  },

  // 处理车型图片URL转换（云存储fileID转临时HTTPS链接）
  async processImageUrls(carList) {
    // 收集所有需要转换的云存储fileID
    const cloudFileIDs = []
    const fileIDMap = new Map()

    carList.forEach((car, index) => {
      if (car.imageUrl && car.imageUrl.startsWith('cloud://')) {
        cloudFileIDs.push(car.imageUrl)
        fileIDMap.set(car.imageUrl, index)
      }
    })

    // 如果没有云存储图片，直接返回
    if (cloudFileIDs.length === 0) {
      return carList
    }

    try {
      // 批量获取临时链接
      const tempRes = await wx.cloud.getTempFileURL({
        fileList: cloudFileIDs
      })

      // 创建fileID到临时URL的映射
      const urlMap = {}
      tempRes.fileList.forEach(item => {
        if (item.fileID && item.tempFileURL) {
          urlMap[item.fileID] = item.tempFileURL
        }
      })

      // 更新carList中的图片URL
      const updatedList = carList.map(car => {
        if (car.imageUrl && car.imageUrl.startsWith('cloud://') && urlMap[car.imageUrl]) {
          return {
            ...car,
            imageUrl: urlMap[car.imageUrl]
          }
        }
        return car
      })

      return updatedList
    } catch (err) {
      console.error('转换图片URL失败:', err)
      return carList
    }
  },

  // 点击卡片跳转详情
  goDetail(e) {
    const id = e.currentTarget.dataset.id
    console.log('点击车辆ID:', id)
    
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    })
  },

  // ============================================
  // 分享功能
  // ============================================
  
  // 分享给朋友/微信群
  onShareAppMessage() {
    return {
      title: '快来车评侦探，看看大家给这些车打了多少分！',
      path: '/pages/index/index',
      imageUrl: '' // 可选：自定义分享图片
    }
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: '快来车评侦探，看看大家给这些车打了多少分！',
      query: '',
      imageUrl: '' // 可选：自定义分享图片
    }
  }
})
