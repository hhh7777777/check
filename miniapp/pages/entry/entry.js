const api = require('../../utils/api')

function safeUrl(url) {
  if (typeof url !== 'string') return ''
  const trimmed = url.trim()
  if (/['"();\s]/.test(trimmed)) return ''
  if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://')) return ''
  return trimmed
}

Page({
  data: {
    statusBarHeight: 0,
    activity: {},
    phone: '',
    queryReady: false,
    globalBgStyle: '',
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo()
    this.setData({ statusBarHeight: sysInfo.statusBarHeight || 20 })
    this.getActivityInfo()
    this.loadUiConfig()
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

  async loadUiConfig() {
    try {
      const res = await api.getUiConfig()
      if (res && res.data && res.data.globalBgImageUrl) {
        const url = safeUrl(res.data.globalBgImageUrl)
        if (url) {
          this.setData({
            globalBgStyle: `background-image: url('${url}'); background-size: cover; background-position: center; background-repeat: no-repeat;`
          })
        }
      }
    } catch (err) {
      console.error('获取界面配置失败', err)
    }
  },

  onPhoneInput(e) {
    const phone = e.detail.value
    this.setData({ phone, queryReady: api.isValidPhone(phone) })
  },

  async onQuery() {
    const phone = api.normalizePhone(this.data.phone)
    if (!api.isValidPhone(phone)) {
      wx.showToast({ title: '请输入正确手机号', icon: 'none' })
      return
    }

    wx.showLoading({ title: '查询中...' })
    try {
      const res = await api.queryAttendee({ phone })
      if (res && res.data) {
        const attendee = Array.isArray(res.data) ? res.data[0] : res.data
        const safeAttendee = {
          activityId: attendee.activityId || this.data.activity._id || '',
          attendeeCode: attendee.attendeeCode || '',
          name: attendee.name || '',
          organization: attendee.organization || '',
          identityType: attendee.identityType || '',
          seatNo: attendee.seatNo || '',
          remark: attendee.remark || '',
          qrContent: attendee.qrContent || (attendee.attendeeCode ? `PASS:${attendee.attendeeCode}` : '')
        }
        try { wx.setStorageSync('attendeeInfo', safeAttendee) } catch (_) {}
        wx.reLaunch({ url: '/pages/index/index' })
      } else {
        wx.showToast({ title: '未查询到参会信息', icon: 'none' })
      }
    } catch (_err) {
      wx.showToast({ title: '未查询到您的参会信息，请联系工作人员', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  showPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' })
  }
})
