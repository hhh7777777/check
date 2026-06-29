const api = require('../../utils/api')

Page({
  data: {
    statusBarHeight: 0,
    activity: {},
    name: '',
    phoneLast4: ''
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
        this.setData({ activity: res.data })
      }
    } catch (err) {
      console.error('获取活动信息失败', err)
    }
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },

  onPhoneInput(e) {
    this.setData({ phoneLast4: e.detail.value })
  },

  async onQuery() {
    const { name, phoneLast4 } = this.data
    if (!name.trim() || phoneLast4.length !== 4) {
      wx.showToast({ title: '请输入姓名和手机号后四位', icon: 'none' })
      return
    }

    wx.showLoading({ title: '查询中...' })
    try {
      const res = await api.queryAttendee({ name: name.trim(), phoneLast4 })
      wx.hideLoading()

      if (res && res.data) {
        const attendee = Array.isArray(res.data) ? res.data[0] : res.data
        wx.setStorageSync('attendeeInfo', attendee)
        setTimeout(() => {
          wx.reLaunch({ url: '/pages/index/index' })
        }, 1500)
      } else {
        wx.showToast({ title: '暂未查询到参会信息', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '暂未查询到您的参会信息，请联系工作人员', icon: 'none' })
    }
  },

  showPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' })
  }
})
