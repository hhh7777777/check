const api = require('../../utils/api')

Page({
  data: {
    activity: {},
    loaded: false,
    statusBarHeight: 0,
    hasPdf: false,
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
        const activity = res.data
        this.setData({
          activity,
          loaded: true,
          hasPdf: !!(activity.routePdfUrl || activity.routePdfFileID)
        })
      } else {
        this.setData({ loaded: true })
      }
    } catch (err) {
      console.error('获取活动信息失败', err)
      this.setData({ loaded: true })
    }
  },

  openPdf() {
    const { activity } = this.data
    const pdfUrl = activity.routePdfUrl
    if (!pdfUrl) {
      wx.showToast({ title: '暂无路线PDF', icon: 'none' })
      return
    }
    wx.showLoading({ title: '下载中...' })
    wx.downloadFile({
      url: pdfUrl,
      success(res) {
        wx.hideLoading()
        if (res.statusCode === 200) {
          wx.openDocument({
            filePath: res.tempFilePath,
            fileType: 'pdf',
            showMenu: true,
            success() {},
            fail(err) {
              console.error('打开PDF失败', err)
              wx.showToast({ title: '打开PDF失败', icon: 'none' })
            }
          })
        } else {
          wx.showToast({ title: 'PDF下载失败', icon: 'none' })
        }
      },
      fail(err) {
        wx.hideLoading()
        console.error('下载PDF失败', err)
        wx.showToast({ title: 'PDF下载失败', icon: 'none' })
      }
    })
  },

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
