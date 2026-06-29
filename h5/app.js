/**
 * H5 参会服务 - 主应用逻辑
 * 使用腾讯云开发 JavaScript SDK 调用云函数
 */

// ==================== 配置 ====================
const CONFIG = {
  // 腾讯云开发环境 ID（从云开发控制台获取）
  envId: 'your-env-id',
  // 云函数名称
  functionName: 'eventApi'
}

// ==================== 全局状态 ====================
let app = null
let currentUser = null
let activityData = null
let schedulesData = []
let attendeeInfo = null

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
  // 初始化腾讯云开发 SDK
  try {
    app = tcb.init({ env: CONFIG.envId })
    console.log('CloudBase initialized')

    // 检查本地缓存的登录状态
    const cachedPhone = localStorage.getItem('queryPhone')
    if (cachedPhone) {
      document.getElementById('phone-input').value = cachedPhone
      document.getElementById('query-btn').disabled = false
    }
  } catch (err) {
    console.error('CloudBase init failed:', err)
    showToast('Service initialization failed')
  }

  // 绑定事件
  setupEventListeners()
})

// ==================== 事件绑定 ====================
function setupEventListeners() {
  const phoneInput = document.getElementById('phone-input')
  const queryBtn = document.getElementById('query-btn')

  // 手机号输入监听
  phoneInput.addEventListener('input', (e) => {
    const value = e.target.value.trim()
    queryBtn.disabled = value.length < 6
  })

  // 查询按钮点击
  queryBtn.addEventListener('click', handleQuery)
}

// ==================== 云函数调用 ====================
async function callCloudFunction(type, data = {}) {
  try {
    const result = await app.callFunction({
      name: CONFIG.functionName,
      data: { type, ...data }
    })
    return result.result
  } catch (err) {
    console.error('Cloud function call failed:', err)
    throw err
  }
}

// ==================== 页面切换 ====================
function showPage(pageName) {
  // 隐藏所有页面
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))

  // 显示目标页面
  const targetPage = document.getElementById(`page-${pageName}`)
  if (targetPage) {
    targetPage.classList.add('active')
  }

  // 加载页面数据
  loadPageData(pageName)
}

function showSection(section) {
  showPage(section)
}

// ==================== 加载页面数据 ====================
async function loadPageData(pageName) {
  switch (pageName) {
    case 'main':
      await loadActivityInfo()
      break
    case 'intro':
      await loadIntro()
      break
    case 'schedule':
      await loadSchedule()
      break
    case 'badge':
      await loadBadge()
      break
    case 'route':
      await loadRoute()
      break
    case 'seating':
      await loadSeating()
      break
    case 'live':
      await loadLiveImages()
      break
  }
}

// ==================== 查询参会信息 ====================
async function handleQuery() {
  const phone = document.getElementById('phone-input').value.trim()
  if (!phone || phone.length < 6) {
    showToast('Please enter a valid phone number')
    return
  }

  const queryBtn = document.getElementById('query-btn')
  queryBtn.disabled = true
  queryBtn.textContent = 'Querying...'

  try {
    const result = await callCloudFunction('queryAttendee', { phone })

    if (result && result.code === 200 && result.data) {
      attendeeInfo = result.data
      localStorage.setItem('queryPhone', phone)
      localStorage.setItem('attendeeInfo', JSON.stringify(result.data))

      // 加载活动信息
      await loadActivityInfo()

      // 切换到主页
      showPage('main')
      showToast('Login successful')
    } else {
      showToast('No attendee information found')
    }
  } catch (err) {
    console.error('Query failed:', err)
    showToast('Query failed, please try again')
  } finally {
    queryBtn.disabled = false
    queryBtn.textContent = 'Query'
  }
}

// ==================== 加载活动信息 ====================
async function loadActivityInfo() {
  if (activityData) {
    updateActivityDisplay()
    return
  }

  try {
    const result = await callCloudFunction('getActivity')
    if (result && result.code === 200 && result.data) {
      activityData = result.data
      updateActivityDisplay()
    }
  } catch (err) {
    console.error('Load activity failed:', err)
  }
}

function updateActivityDisplay() {
  if (!activityData) return

  // 更新入口页标题
  document.getElementById('entry-title').textContent = activityData.title || 'Event Service'

  // 更新主页标题
  document.getElementById('main-title').textContent = activityData.title || 'Annual Conference'
}

// ==================== 加载会议介绍 ====================
async function loadIntro() {
  const content = document.getElementById('intro-content')
  content.innerHTML = '<div class="loading">Loading...</div>'

  if (!activityData) {
    await loadActivityInfo()
  }

  if (activityData) {
    content.innerHTML = `
      <p style="margin-bottom: 16px;">${activityData.description || 'No description available'}</p>
      <p><strong>Organizer:</strong> ${activityData.organizer || '-'}</p>
      <p><strong>Co-organizer:</strong> ${activityData.co_organizer || '-'}</p>
      <p><strong>Time:</strong> ${activityData.start_time || '-'} ~ ${activityData.end_time || '-'}</p>
      <p><strong>Location:</strong> ${activityData.location || '-'}</p>
      <p><strong>Contact:</strong> ${activityData.contact_phone || '-'}</p>
    `
  } else {
    content.innerHTML = '<div class="empty-tip">No activity information</div>'
  }
}

// ==================== 加载日程 ====================
async function loadSchedule() {
  const content = document.getElementById('schedule-content')
  content.innerHTML = '<div class="loading">Loading...</div>'

  try {
    const result = await callCloudFunction('getSchedules')
    if (result && result.code === 200 && result.data) {
      schedulesData = Array.isArray(result.data) ? result.data : (result.data.list || [])

      if (schedulesData.length === 0) {
        content.innerHTML = '<div class="empty-tip">No schedule available</div>'
        return
      }

      // 按日期分组
      const grouped = {}
      schedulesData.forEach(item => {
        const date = item.date || 'Unknown'
        if (!grouped[date]) grouped[date] = []
        grouped[date].push(item)
      })

      let html = ''
      Object.keys(grouped).sort().forEach(date => {
        html += `
          <div class="schedule-day">
            <div class="schedule-date">${formatDate(date)}</div>
            ${grouped[date].map(item => `
              <div class="schedule-item">
                <div class="schedule-time">${item.startTime || ''} - ${item.endTime || ''}</div>
                <div class="schedule-info">
                  <div class="schedule-title">${item.title || ''}</div>
                  <div class="schedule-location">${item.location || ''} ${item.speaker ? '| ' + item.speaker : ''}</div>
                </div>
              </div>
            `).join('')}
          </div>
        `
      })

      content.innerHTML = html
    }
  } catch (err) {
    console.error('Load schedule failed:', err)
    content.innerHTML = '<div class="empty-tip">Failed to load schedule</div>'
  }
}

// ==================== 加载参会证 ====================
async function loadBadge() {
  // 获取参会人信息
  if (!attendeeInfo) {
    const cached = localStorage.getItem('attendeeInfo')
    if (cached) {
      attendeeInfo = JSON.parse(cached)
    }
  }

  if (!attendeeInfo) {
    showToast('Please login first')
    showPage('entry')
    return
  }

  // 更新活动标题
  if (activityData) {
    document.getElementById('badge-title').textContent = activityData.title || 'Annual Conference'
  }

  // 更新参会人信息
  document.getElementById('badge-name').textContent = attendeeInfo.name || '--'
  document.getElementById('badge-org').textContent = attendeeInfo.organization || '--'
  document.getElementById('badge-type').textContent = attendeeInfo.identityType || '--'
  document.getElementById('badge-seat').textContent = attendeeInfo.seatNo || '--'
  document.getElementById('badge-table').textContent = attendeeInfo.tableNo || '--'
  document.getElementById('badge-hotel').textContent = attendeeInfo.hotel || '--'
  document.getElementById('badge-room').textContent = attendeeInfo.roomNo || '--'

  // 生成二维码
  generateQRCode()
}

// ==================== 生成二维码 ====================
function generateQRCode() {
  const canvas = document.getElementById('qr-canvas')
  if (!canvas || !attendeeInfo) return

  const qrContent = `CHECKIN:${attendeeInfo.attendeeCode || attendeeInfo.id}`

  try {
    QRCode.toCanvas(canvas, qrContent, {
      width: 180,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    }, (error) => {
      if (error) {
        console.error('QR code generation failed:', error)
      }
    })
  } catch (err) {
    console.error('QR code generation error:', err)
  }
}

// ==================== 加载路线 ====================
async function loadRoute() {
  const locationEl = document.getElementById('route-location')
  const trafficEl = document.getElementById('route-traffic')

  if (!activityData) {
    await loadActivityInfo()
  }

  if (activityData) {
    locationEl.textContent = activityData.location || 'No location information'
    trafficEl.textContent = activityData.traffic_info || 'No transportation information'
  } else {
    locationEl.textContent = 'No location information'
    trafficEl.textContent = 'No transportation information'
  }
}

// ==================== 加载座位信息 ====================
async function loadSeating() {
  if (!attendeeInfo) {
    const cached = localStorage.getItem('attendeeInfo')
    if (cached) {
      attendeeInfo = JSON.parse(cached)
    }
  }

  if (attendeeInfo) {
    document.getElementById('seat-no').textContent = attendeeInfo.seatNo || '--'
    document.getElementById('seat-table').textContent = attendeeInfo.tableNo || '--'
    document.getElementById('seat-dining').textContent = attendeeInfo.diningPlace || '--'
  } else {
    showToast('Please login first')
    showPage('entry')
  }
}

// ==================== 加载图文直播 ====================
async function loadLiveImages() {
  const content = document.getElementById('live-content')
  content.innerHTML = '<div class="loading">Loading...</div>'

  try {
    const result = await callCloudFunction('getLiveImages')
    if (result && result.code === 200 && result.data) {
      const images = Array.isArray(result.data) ? result.data : (result.data.list || [])

      if (images.length === 0) {
        content.innerHTML = '<div class="empty-tip">No photos yet</div>'
        return
      }

      let html = '<div class="live-grid">'
      images.forEach(img => {
        const url = img.url || img.imageUrl || ''
        if (url) {
          html += `
            <div class="live-item">
              <img src="${url}" alt="${img.title || ''}" loading="lazy">
              ${img.title ? `<div class="live-item-title">${img.title}</div>` : ''}
            </div>
          `
        }
      })
      html += '</div>'

      content.innerHTML = html
    }
  } catch (err) {
    console.error('Load live images failed:', err)
    content.innerHTML = '<div class="empty-tip">Failed to load photos</div>'
  }
}

// ==================== 工具函数 ====================
function formatDate(dateStr) {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length === 3) {
    return `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日`
  }
  return dateStr
}

function showToast(message, duration = 2000) {
  // 移除已有的 toast
  const existingToast = document.querySelector('.toast')
  if (existingToast) {
    existingToast.remove()
  }

  const toast = document.createElement('div')
  toast.className = 'toast'
  toast.textContent = message
  document.body.appendChild(toast)

  setTimeout(() => {
    toast.remove()
  }, duration)
}
