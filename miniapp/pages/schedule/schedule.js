const api = require('../../utils/api')

Page({
  data: {
    groupedSchedules: [],
    loading: true,
    statusBarHeight: 0
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo()
    this.setData({ statusBarHeight: sysInfo.statusBarHeight || 20 })
    this.getSchedules()
  },

  async getSchedules() {
    try {
      const res = await api.getSchedules()
      if (res && res.data && res.data.length > 0) {
        const grouped = this.groupByDate(res.data)
        this.setData({ groupedSchedules: grouped, loading: false })
      } else {
        this.setData({ loading: false })
      }
    } catch (err) {
      console.error('获取日程失败', err)
      this.setData({ loading: false })
    }
  },

  groupByDate(list) {
    const map = {}
    list.forEach(item => {
      const date = item.date || '未分组'
      if (!map[date]) {
        map[date] = []
      }
      map[date].push(item)
    })
    return Object.keys(map).map(date => ({
      date: date,
      list: map[date]
    }))
  },

  goBack() {
    wx.navigateBack({ delta: 1 })
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  }
})
