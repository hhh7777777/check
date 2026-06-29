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

  /**
   * 使用微信内置地图导航（免费）
   */
  openNavigation() {
    const { activity } = this.data
    if (activity.latitude && activity.longitude) {
      wx.openLocation({
        latitude: activity.latitude,
        longitude: activity.longitude,
        name: activity.location || '活动地点',
        scale: 18
      })
    } else {
      wx.showToast({ title: '暂无导航坐标', icon: 'none' })
    }
  },

  goBack() {
    wx.navigateBack({ delta: 1 })
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  }
})
