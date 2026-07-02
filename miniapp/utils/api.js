const config = require('../config')

function validateConfig() {
  const envIdValid = /^[a-zA-Z0-9][a-zA-Z0-9-]{2,63}$/.test(config.envId)
  const serviceNameValid = /^[a-z][a-z0-9-]{0,62}$/.test(config.serviceName)
  if (!envIdValid || !serviceNameValid) {
    const message = '云托管配置无效，请检查 miniapp/config.js 中的 envId 和 serviceName'
    console.error(message, config)
    if (!validateConfig._shown) {
      validateConfig._shown = true
      wx.showModal({ title: '配置错误', content: message, showCancel: false })
    }
    return false
  }
  return true
}

function normalizePhone(phone) {
  const normalized = String(phone || '')
    .trim()
    .replace(/[０-９＋]/g, (character) => {
      if (character === '＋') return '+'
      return String(character.charCodeAt(0) - 0xFF10)
    })
    .replace(/[()\s-]/g, '')
    .replace(/^00(\d+)/, '+$1')
  return /^\+86(1[3-9]\d{9})$/.test(normalized) ? normalized.slice(3) : normalized
}

function isValidPhone(phone) {
  const normalized = normalizePhone(phone)
  return /^1[3-9]\d{9}$/.test(normalized) || /^\+[1-9]\d{6,14}$/.test(normalized)
}

function request(path, method = 'GET', data = {}) {
  return new Promise((resolve, reject) => {
    if (!validateConfig()) {
      reject({ message: '云托管配置无效' })
      return
    }
    wx.cloud.callContainer({
      config: { env: config.envId },
      path,
      method,
      header: { 'X-WX-SERVICE': config.serviceName },
      data,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ data: res.data })
          return
        }
        reject(res.data || { message: '请求失败' })
      },
      fail(error) {
        console.error('云托管请求失败', error)
        reject({ message: '网络请求失败', error })
      }
    })
  })
}

module.exports = {
  normalizePhone,
  isValidPhone,
  getActivity: () => request('/api/activity'),
  getSchedules: () => request('/api/schedules'),
  queryAttendee: (data) => request('/api/attendee/query', 'POST', {
    phone: data.phone
  }),
  getLiveImages: () => request('/api/live-images'),
  getUiConfig: () => request('/api/miniapp/uiConfig'),
}
