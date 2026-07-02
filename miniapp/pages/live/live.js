const api = require('../../utils/api')

Page({
  data: {
    currentImage: null,
    statusBarHeight: 0
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo()
    this.setData({ statusBarHeight: sysInfo.statusBarHeight || 20 })
    this.loadLatestImage()
  },

  onShow() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
    this.loadLatestImage(true)
    this._timer = setInterval(() => {
      this.loadLatestImage(true)
    }, 30000)
  },

  onHide() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  },

  onUnload() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  },

  async loadLatestImage(silent) {
    try {
      const res = await api.getLiveImages()
      if (res && res.data && res.data.length > 0) {
        this.setData({ currentImage: res.data[0] })
      } else {
        this.setData({ currentImage: null })
      }
    } catch (err) {
      console.error('获取图片失败', err)
    }
  },

  previewImage() {
    if (!this.data.currentImage) return
    wx.previewImage({
      current: this.data.currentImage.imageUrl,
      urls: [this.data.currentImage.imageUrl]
    })
  },

  goBack() { wx.navigateBack({ delta: 1 }) },
  goHome() { wx.reLaunch({ url: '/pages/index/index' }) }
})
