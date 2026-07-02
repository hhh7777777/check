const api = require('../../utils/api')

function safeUrl(url) {
  if (typeof url !== 'string') return ''
  const trimmed = url.trim()
  if (/['"();\s]/.test(trimmed)) return ''
  if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://')) return ''
  return trimmed
}

function safeColor(color) {
  if (typeof color !== 'string') return ''
  return /^#[0-9a-fA-F]{3,8}$|^rgba?\([^)]+\)$|^hsla?\([^)]+\)$/.test(color.trim()) ? color.trim() : ''
}

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
        const url = safeUrl(cfg[key])
        if (url) {
          uiConfig[key] = cfg[key]
          updates[styleKey] = `background-image: url('${url}'); background-size: cover; background-position: center; background-repeat: no-repeat;`
        }
      })

      if (safeColor(cfg.globalTextColor)) {
        uiConfig.globalTextColor = cfg.globalTextColor
        updates.globalTextStyle = `color: ${cfg.globalTextColor};`
      }
      if (safeColor(cfg.cardTitleColor)) {
        uiConfig.cardTitleColor = cfg.cardTitleColor
        updates.cardTitleStyle = `color: ${cfg.cardTitleColor};`
      }
      if (safeColor(cfg.cardSubtitleColor)) {
        uiConfig.cardSubtitleColor = cfg.cardSubtitleColor
        updates.cardSubtitleStyle = `color: ${cfg.cardSubtitleColor};`
      }
      if (safeColor(cfg.primaryColor)) {
        uiConfig.primaryColor = cfg.primaryColor
        updates.primaryStyle = `color: ${cfg.primaryColor};`
      }
      if (safeColor(cfg.accentColor)) {
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
