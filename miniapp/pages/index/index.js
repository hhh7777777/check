const api = require('../../utils/api')

Page({
  data: {
    // 活动信息
    activity: {},
    // 状态栏高度（自定义导航栏需要）
    statusBarHeight: 0
  },

  onLoad() {
    // 获取状态栏高度
    const sysInfo = wx.getSystemInfoSync()
    this.setData({ statusBarHeight: sysInfo.statusBarHeight || 20 })
    // 获取活动信息
    this.getActivityInfo()
  },

  onShow() {},

  /**
   * 从云函数获取活动信息
   */
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

  /**
   * 跳转到子页面
   */
  goToPage(e) {
    const url = e.currentTarget.dataset.url
    wx.navigateTo({ url })
  }
})
