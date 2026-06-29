const api = require('../../utils/api')

Page({
  data: {
    attendee: null,
    name: '',
    phoneLast4: '',
    queryFailed: false,
    statusBarHeight: 0
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo()
    this.setData({ statusBarHeight: sysInfo.statusBarHeight || 20 })
    const cached = wx.getStorageSync('attendeeInfo')
    if (cached) {
      this.setData({ attendee: cached })
    }
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },

  onPhoneInput(e) {
    this.setData({ phoneLast4: e.detail.value })
  },

  async queryAttendee() {
    const { name, phoneLast4 } = this.data
    if (!name.trim()) {
      wx.showToast({ title: '请输入姓名', icon: 'none' })
      return
    }
    if (!phoneLast4 || phoneLast4.length !== 4) {
      wx.showToast({ title: '请输入手机号后四位', icon: 'none' })
      return
    }

    wx.showLoading({ title: '查询中...' })
    try {
      const res = await api.queryAttendee({ name: name.trim(), phoneLast4: phoneLast4 })
      if (res && res.data) {
        this.setData({ attendee: res.data, queryFailed: false })
        wx.setStorageSync('attendeeInfo', res.data)
      } else {
        this.setData({ queryFailed: true })
      }
    } catch (err) {
      console.error('查询失败', err)
      this.setData({ queryFailed: true })
    }
    wx.hideLoading()
  },

  retry() {
    this.setData({ queryFailed: false, attendee: null })
  },

  reQuery() {
    wx.removeStorageSync('attendeeInfo')
    this.setData({ attendee: null, queryFailed: false, name: '', phoneLast4: '' })
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
