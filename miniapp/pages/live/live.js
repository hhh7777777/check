const api = require('../../utils/api')
const qrcode = require('../../utils/qrcode')

// 摄影师上传页面地址（部署云托管后替换为真实地址）
const UPLOAD_BASE = 'https://your-cloud-run-url'

Page({
  data: {
    currentImage: null,
    uploadUrl: '',
    statusBarHeight: 0
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo()
    this.setData({ statusBarHeight: sysInfo.statusBarHeight || 20 })
    this.loadLatestImage()
  },

  onShow() {
    // 每30秒刷新最新图片
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
      }
    } catch (err) {
      console.error('获取图片失败', err)
    }
  },

  // 绘制二维码
  drawQRCode(url) {
    if (!url) return
    qrcode.drawQRCodeToCanvas('#qrCanvas', url, {
      foreground: '#000000',
      background: '#ffffff',
      margin: 4,
      ecLevel: qrcode.EC_LEVEL.M
    }).catch(err => {
      console.error('绘制二维码失败', err)
    })
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
