const api = require('../../utils/api')

Page({
  data: {
    activity: {},
    statusBarHeight: 0,
    uiConfig: {},
    globalBgStyle: '',
    introBgStyle: '',
    scheduleBgStyle: '',
    badgeBgStyle: '',
    seatingBgStyle: '',
    routeBgStyle: '',
    liveBgStyle: '',
  },

  onLoad() {
    const sysInfo = wx.getSystemInfoSync()
    this.setData({ statusBarHeight: sysInfo.statusBarHeight || 20 })
    this.getActivityInfo()
    this.loadUiConfig()
  },

  onShow() {},

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
      if (res && res.data) {
        const cfg = res.data
        const uiConfig = {}
        const updates = {}

        if (cfg.globalBgImageUrl) {
          uiConfig.globalBgImageUrl = cfg.globalBgImageUrl
          updates.globalBgStyle = `background-image: url('${cfg.globalBgImageUrl}'); background-size: cover; background-position: center; background-repeat: no-repeat;`
        }
        if (cfg.introBgImageUrl) {
          uiConfig.introBgImageUrl = cfg.introBgImageUrl
          updates.introBgStyle = `background-image: url('${cfg.introBgImageUrl}'); background-size: cover; background-position: center; background-repeat: no-repeat;`
        }
        if (cfg.scheduleBgImageUrl) {
          uiConfig.scheduleBgImageUrl = cfg.scheduleBgImageUrl
          updates.scheduleBgStyle = `background-image: url('${cfg.scheduleBgImageUrl}'); background-size: cover; background-position: center; background-repeat: no-repeat;`
        }
        if (cfg.badgeBgImageUrl) {
          uiConfig.badgeBgImageUrl = cfg.badgeBgImageUrl
          updates.badgeBgStyle = `background-image: url('${cfg.badgeBgImageUrl}'); background-size: cover; background-position: center; background-repeat: no-repeat;`
        }
        if (cfg.seatingBgImageUrl) {
          uiConfig.seatingBgImageUrl = cfg.seatingBgImageUrl
          updates.seatingBgStyle = `background-image: url('${cfg.seatingBgImageUrl}'); background-size: cover; background-position: center; background-repeat: no-repeat;`
        }
        if (cfg.routeBgImageUrl) {
          uiConfig.routeBgImageUrl = cfg.routeBgImageUrl
          updates.routeBgStyle = `background-image: url('${cfg.routeBgImageUrl}'); background-size: cover; background-position: center; background-repeat: no-repeat;`
        }
        if (cfg.liveBgImageUrl) {
          uiConfig.liveBgImageUrl = cfg.liveBgImageUrl
          updates.liveBgStyle = `background-image: url('${cfg.liveBgImageUrl}'); background-size: cover; background-position: center; background-repeat: no-repeat;`
        }

        this.setData({ uiConfig, ...updates })
      }
    } catch (err) {
      console.error('获取界面配置失败', err)
    }
  },

  goToPage(e) {
    const url = e.currentTarget.dataset.url
    wx.navigateTo({ url })
  }
})
