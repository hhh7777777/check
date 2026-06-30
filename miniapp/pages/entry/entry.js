const api = require('../../utils/api')

Page({
  data: {
    statusBarHeight: 0,
    activity: {},
    phone: '',
    queryReady: false
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
          attendeeCode: attendee.attendeeCode || '',
          name: attendee.name || '',
          organization: attendee.organization || '',
          identityType: attendee.identityType || '',
          seatNo: attendee.seatNo || '',
          tableNo: attendee.tableNo || '',
          diningPlace: attendee.diningPlace || '',
          hotelName: attendee.hotelName || '',
          roomNo: attendee.roomNo || '',
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
