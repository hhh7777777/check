Page({
  data: {
    statusBarHeight: 0
  },
  onLoad() {
    const sysInfo = wx.getWindowInfo()
    this.setData({ statusBarHeight: sysInfo.statusBarHeight || 20 })
  },
  goBack() {
    wx.navigateBack({ delta: 1 })
  }
})
