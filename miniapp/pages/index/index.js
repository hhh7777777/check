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
    ready: false,
    globalTextStyle: '',
    cardTitleStyle: '',
    cardSubtitleStyle: '',
    primaryStyle: '',
    accentStyle: '',
  },

  onLoad() {
    const sysInfo = wx.getSystemInfoSync()
    this.setData({ statusBarHeight: sysInfo.statusBarHeight || 20 })
    this.init()
  },

  onShow() {},

  async init() {
    const [activityRes, uiRes] = await Promise.all([
      api.getActivity().catch(() => null),
      api.getUiConfig().catch(() => null),
    ])

    const updates = { ready: true }

    if (activityRes && activityRes.data) {
      updates.activity = activityRes.data
    }

    if (uiRes && uiRes.data) {
      const cfg = uiRes.data
      const uiConfig = {}

      const bgFields = [
        ['globalBgImageUrl', 'globalBgStyle'],
        ['introBgImageUrl', 'introBgStyle'],
        ['scheduleBgImageUrl', 'scheduleBgStyle'],
        ['badgeBgImageUrl', 'badgeBgStyle'],
        ['seatingBgImageUrl', 'seatingBgStyle'],
        ['routeBgImageUrl', 'routeBgStyle'],
        ['liveBgImageUrl', 'liveBgStyle'],
      ]
      bgFields.forEach(([key, styleKey]) => {
        if (cfg[key]) {
          uiConfig[key] = cfg[key]
          updates[styleKey] = `background-image: url('${cfg[key]}'); background-size: cover; background-position: center; background-repeat: no-repeat;`
        }
      })

      if (cfg.globalTextColor) {
        uiConfig.globalTextColor = cfg.globalTextColor
        updates.globalTextStyle = `color: ${cfg.globalTextColor};`
      }
      if (cfg.cardTitleColor) {
        uiConfig.cardTitleColor = cfg.cardTitleColor
        updates.cardTitleStyle = `color: ${cfg.cardTitleColor};`
      }
      if (cfg.cardSubtitleColor) {
        uiConfig.cardSubtitleColor = cfg.cardSubtitleColor
        updates.cardSubtitleStyle = `color: ${cfg.cardSubtitleColor};`
      }
      if (cfg.primaryColor) {
        uiConfig.primaryColor = cfg.primaryColor
        updates.primaryStyle = `color: ${cfg.primaryColor};`
      }
      if (cfg.accentColor) {
        uiConfig.accentColor = cfg.accentColor
        updates.accentStyle = `color: ${cfg.accentColor};`
      }

      updates.uiConfig = uiConfig
    }

    this.setData(updates)
  },

  goToPage(e) {
    const url = e.currentTarget.dataset.url
    wx.navigateTo({ url })
  }
})
