const config = require('../config')

function validateConfig() {
  const envIdValid = /^[a-zA-Z0-9][a-zA-Z0-9-]{2,63}$/.test(config.envId)
  const serviceNameValid = /^[a-z][a-z0-9-]{0,62}$/.test(config.serviceName)
  if (!envIdValid || !serviceNameValid) {
    const message = '云托管配置无效，请检查 miniapp/config.js 中的 envId 和 serviceName'
    console.error(message, config)
    wx.showModal({ title: '配置错误', content: message, showCancel: false })
    return false
  }
  return true
}

function request(path, method = 'GET', data = {}) {
  return new Promise((resolve, reject) => {
    if (!validateConfig()) {
      reject({ message: '云托管配置无效' })
      return
    }
    wx.cloud.callContainer({
      config: { env: config.envId },
      path: `${config.apiPrefix}${path}`,
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
  getActivity: () => request('/getActivity'),
  getSchedules: () => request('/getSchedules'),
  queryAttendee: (data) => request('/queryAttendee', 'POST', {
    name: data.name,
    last4: data.phoneLast4 || data.last4
  }),
  getLiveImages: () => request('/getLiveImages')
}
