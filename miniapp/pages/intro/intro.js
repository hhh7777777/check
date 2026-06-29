const api = require('../../utils/api')

Page({
  data: {
    activity: {},
    loaded: false,
    statusBarHeight: 0
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo()
    this.setData({ statusBarHeight: sysInfo.statusBarHeight || 20 })
    this.getActivityInfo()
  },

  async getActivityInfo() {
    try {
      const res = await api.getActivity()
      if (res && res.data) {
        this.setData({ activity: res.data, loaded: true })
      } else {
        this.setData({ loaded: true })
      }
    } catch (err) {
      console.error('获取活动信息失败', err)
      this.setData({ loaded: true })
    }
  },

  goBack() {
    wx.navigateBack({ delta: 1 })
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  }
})
