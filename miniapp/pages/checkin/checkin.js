const api = require('../../utils/api')

Page({
  data: {
    operator: '',
    operatorName: '',
    scanResult: '',  // 'success' | 'already' | 'invalid'
    checkedAttendee: {},
    checkinTime: '',
    statusBarHeight: 0,
    manualCode: ''
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo()
    this.setData({ statusBarHeight: sysInfo.statusBarHeight || 20 })
  },

  onOperatorInput(e) {
    this.setData({ operatorName: e.detail.value })
  },

  enterCheckin() {
    const name = this.data.operatorName.trim()
    if (!name) {
      wx.showToast({ title: '请输入操作员名称', icon: 'none' })
      return
    }
    this.setData({ operator: name })
  },

  startScan() {
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode'],
      success: (res) => {
        this.handleScanResult(res.result)
      },
      fail: (err) => {
        console.error('扫码失败', err)
        wx.showToast({ title: '扫码取消', icon: 'none' })
      }
    })
  },

  /**
   * 手动输入参会码
   */
  onManualCodeInput(e) {
    this.setData({ manualCode: e.detail.value })
  },

  /**
   * 手动签到
   */
  manualCheckin() {
    const code = this.data.manualCode.trim()
    if (!code) {
      wx.showToast({ title: '请输入参会码', icon: 'none' })
      return
    }
    this.handleScanResult('CHECKIN:' + code)
  },

  async handleScanResult(result) {
    // 解析二维码内容，格式：CHECKIN:{attendeeCode}
    if (!result || !result.startsWith('CHECKIN:')) {
      this.setData({ scanResult: 'invalid' })
      return
    }

    const attendeeCode = result.replace('CHECKIN:', '')
    if (!attendeeCode) {
      this.setData({ scanResult: 'invalid' })
      return
    }

    wx.showLoading({ title: '签到处理中...' })
    try {
      const res = await api.checkin({
        attendeeCode: attendeeCode,
        operator: this.data.operator
      })

      if (res && res.data) {
        const now = new Date()
        const timeStr = now.getFullYear() + '-' +
          String(now.getMonth() + 1).padStart(2, '0') + '-' +
          String(now.getDate()).padStart(2, '0') + ' ' +
          String(now.getHours()).padStart(2, '0') + ':' +
          String(now.getMinutes()).padStart(2, '0') + ':' +
          String(now.getSeconds()).padStart(2, '0')

        if (res.data.alreadyCheckedIn) {
          this.setData({
            scanResult: 'already',
            checkedAttendee: res.data,
            checkinTime: res.data.checkinTime || timeStr
          })
        } else {
          this.setData({
            scanResult: 'success',
            checkedAttendee: res.data,
            checkinTime: timeStr
          })
        }
      } else {
        this.setData({ scanResult: 'invalid' })
      }
    } catch (err) {
      console.error('签到失败', err)
      this.setData({ scanResult: 'invalid' })
    }
    wx.hideLoading()
  },

  continueScan() {
    this.setData({
      scanResult: '',
      checkedAttendee: {},
      checkinTime: '',
      manualCode: ''
    })
    // 自动开始扫码
    setTimeout(() => {
      this.startScan()
    }, 300)
  },

  goBack() {
    wx.navigateBack({ delta: 1 })
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  }
})
