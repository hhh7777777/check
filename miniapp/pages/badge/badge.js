Page({
  data: {
    attendee: null,
    statusBarHeight: 0
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo()
    this.setData({ statusBarHeight: sysInfo.statusBarHeight || 20 })
    const cached = wx.getStorageSync('attendeeInfo')
    if (cached) {
      this.setData({ attendee: cached })
    } else {
      wx.reLaunch({ url: '/pages/entry/entry' })
    }
  },

  reQuery() {
    try { wx.removeStorageSync('attendeeInfo') } catch (_) {}
    wx.reLaunch({ url: '/pages/entry/entry' })
  },

  previewQr() {
    const { attendee } = this.data
    if (!attendee || !attendee.qrContent) return
    wx.showModal({
      title: '参会凭证',
      content: attendee.qrContent,
      showCancel: false
    })
  },

  goBack() {
    wx.navigateBack({ delta: 1 })
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  }
})
