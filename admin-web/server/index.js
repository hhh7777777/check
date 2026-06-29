const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const XLSX = require('xlsx')
const https = require('https')

const app = express()
const PORT = 3000
const JWT_SECRET = 'event_miniapp_cloud_2026'

// ==================== 运行模式配置 ====================
// mode: 'local'  - 使用本地内存数据（仅用于开发测试）
// mode: 'cloud'  - 通过微信云开发HTTP API操作云数据库（生产环境）
const CONFIG = {
  mode: 'cloud',
  // 微信小程序配置
  appId: 'wx7a279c30b5f74712',
  appSecret: '771d224985923f87c6a1859ec76d206e',
  // 云开发环境 ID
  envId: 'cloud1-d3grv9iycce5a2003',
  // 云数据库集合名称
  collections: {
    ACTIVITY: 'activity',
    SCHEDULE: 'schedule',
    ATTENDEE: 'attendee',
    LIVE_IMAGE: 'live_image',
    CHECKIN_LOG: 'checkin_log',
    ADMIN: 'admin'
  }
}

// ==================== 微信云开发 HTTP API ====================
let accessToken = null
let tokenExpireTime = 0

// 获取 access_token
async function getAccessToken() {
  // 如果 token 还有效，直接返回
  if (accessToken && Date.now() < tokenExpireTime) {
    return accessToken
  }

  return new Promise((resolve, reject) => {
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${CONFIG.appId}&secret=${CONFIG.appSecret}`
    
    https.get(url, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          if (result.access_token) {
            accessToken = result.access_token
            tokenExpireTime = Date.now() + (result.expires_in - 300) * 1000 // 提前5分钟刷新
            console.log('[微信API] access_token 获取成功')
            resolve(accessToken)
          } else {
            console.error('[微信API] 获取 access_token 失败:', result)
            reject(new Error(result.errmsg || '获取 access_token 失败'))
          }
        } catch (e) {
          reject(e)
        }
      })
    }).on('error', reject)
  })
}

// 调用微信云开发 HTTP API
async function callCloudAPI(action, data = {}) {
  const token = await getAccessToken()
  
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      env: CONFIG.envId,
      ...data
    })
    
    const options = {
      hostname: 'api.weixin.qq.com',
      path: `/tcb/${action}?access_token=${token}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }
    
    const req = https.request(options, (res) => {
      let result = ''
      res.on('data', chunk => result += chunk)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(result)
          if (parsed.errcode && parsed.errcode !== 0) {
            console.error('[微信API] 请求失败:', parsed)
            reject(new Error(parsed.errmsg || '请求失败'))
          } else {
            resolve(parsed)
          }
        } catch (e) {
          reject(e)
        }
      })
    })
    
    req.on('error', reject)
    req.write(postData)
    req.end()
  })
}

// ==================== 云数据库操作封装 ====================
const cloudDB = {
  // 查询集合
  async getCollection(collectionName, query = {}, sort = null, limit = 100) {
    let queryStr = `db.collection("${collectionName}")`
    
    if (query && Object.keys(query).length > 0) {
      const whereClause = Object.entries(query)
        .map(([k, v]) => `"${k}":"${v}"`)
        .join(',')
      queryStr += `.where({${whereClause}})`
    }
    
    if (sort) {
      queryStr += `.orderBy("${sort.field}", "${sort.order || 'asc'}")`
    }
    
    queryStr += `.limit(${limit}).get()`
    
    const result = await callCloudAPI('databasequery', { query: queryStr })
    return result.data || []
  },
  
  // 添加文档
  async addDocument(collectionName, data) {
    const dataStr = JSON.stringify(data)
    const query = `db.collection("${collectionName}").add({data:${dataStr}})`
    const result = await callCloudAPI('databaseadd', { query })
    return result
  },
  
  // 更新文档
  async updateDocument(collectionName, docId, data) {
    const dataStr = JSON.stringify(data)
    const query = `db.collection("${collectionName}").doc("${docId}").update({data:${dataStr}})`
    const result = await callCloudAPI('databaseupdate', { query })
    return result
  },
  
  // 删除文档
  async deleteDocument(collectionName, docId) {
    const query = `db.collection("${collectionName}").doc("${docId}").remove()`
    const result = await callCloudAPI('databasedelete', { query })
    return result
  },
  
  // 查询单个文档
  async getDocument(collectionName, docId) {
    const query = `db.collection("${collectionName}").doc("${docId}").get()`
    const result = await callCloudAPI('databasequery', { query })
    return result.data && result.data[0] ? result.data[0] : null
  },
  
  // 统计数量
  async countDocuments(collectionName, query = {}) {
    let queryStr = `db.collection("${collectionName}")`
    
    if (query && Object.keys(query).length > 0) {
      const whereClause = Object.entries(query)
        .map(([k, v]) => `"${k}":${typeof v === 'number' ? v : `"${v}"`}`)
        .join(',')
      queryStr += `.where({${whereClause}})`
    }
    
    queryStr += `.count()`
    
    const result = await callCloudAPI('databasecount', { query: queryStr })
    return result.count || 0
  }
}

// 中间件
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// 静态文件服务（用于上传的图片）
const uploadsDir = path.join(__dirname, 'uploads')
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}
app.use('/uploads', express.static(uploadsDir))

// multer 配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir)
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${ext}`)
  }
})
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } })

// ==================== 工具函数 ====================

function hashPassword(pwd) {
  return crypto.createHash('sha256').update(pwd).digest('hex')
}

function success(res, data, message = 'success') {
  res.json({ code: 200, message, data })
}

function error(res, code, message) {
  res.json({ code, message, data: null })
}

// JWT 认证中间件
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.json({ code: 401, message: '未登录' })
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.admin = decoded
    next()
  } catch (e) {
    res.json({ code: 401, message: 'token无效' })
  }
}

// ==================== 内存数据存储 ====================

let adminList = [
  { id: 1, username: 'admin', password_hash: hashPassword('admin123'), role: 'admin' }
]

let activityData = {
  id: 1,
  title: '2026年度内部培训大会',
  start_time: '2026-07-01 09:00:00',
  end_time: '2026-07-02 18:00:00',
  location: '北京国际会议中心',
  organizer: '人力资源部',
  co_organizer: '行政管理部',
  description: '本次大会旨在加强团队建设，提升专业技能，促进部门间交流合作。',
  traffic_info: '1. 地铁：乘坐1号线至天安门东站\n2. 公交：乘坐1路至天安门东站',
  map_image: '',
  contact_phone: '010-12345678'
}

let scheduleList = [
  { id: 1, date: '2026-07-01', startTime: '09:00', endTime: '09:30', title: '开幕致辞', location: '主会场A', speaker: '张总经理', remark: '请提前10分钟入场', sortOrder: 1 },
  { id: 2, date: '2026-07-01', startTime: '09:30', endTime: '10:30', title: '2026年度工作总结与展望', location: '主会场A', speaker: '李副总经理', remark: '', sortOrder: 2 },
  { id: 3, date: '2026-07-01', startTime: '10:45', endTime: '11:45', title: '技术架构升级分享', location: '主会场A', speaker: '王技术总监', remark: '含Q&A环节', sortOrder: 3 },
  { id: 4, date: '2026-07-01', startTime: '14:00', endTime: '15:00', title: '团队协作工作坊', location: '分会场B', speaker: '陈培训师', remark: '请携带笔记本电脑', sortOrder: 4 },
  { id: 5, date: '2026-07-01', startTime: '15:15', endTime: '16:15', title: '产品创新思维', location: '分会场B', speaker: '刘产品经理', remark: '', sortOrder: 5 },
  { id: 6, date: '2026-07-02', startTime: '09:00', endTime: '10:00', title: '领导力提升', location: '主会场A', speaker: '外聘讲师赵老师', remark: '', sortOrder: 6 },
  { id: 7, date: '2026-07-02', startTime: '10:15', endTime: '11:15', title: '沟通与表达技巧', location: '主会场A', speaker: '外聘讲师孙老师', remark: '', sortOrder: 7 },
  { id: 8, date: '2026-07-02', startTime: '14:00', endTime: '15:30', title: '分组讨论与汇报', location: '各分会场', speaker: '各组组长', remark: '按部门分组', sortOrder: 8 },
  { id: 9, date: '2026-07-02', startTime: '15:45', endTime: '17:00', title: '闭幕总结与颁奖', location: '主会场A', speaker: '张总经理', remark: '', sortOrder: 9 }
]

let attendeeList = [
  { id: 1, attendeeCode: 'A202606240001', name: '张三', phone: '13800001111', organization: '技术研发部', identityType: '参会嘉宾', seatNo: 'A-01', tableNo: '1号桌', diningPlace: '一楼宴会厅', hotel: '北京国际饭店', roomNo: '301', remark: '', checkinStatus: 'not_checked_in', checkinTime: null },
  { id: 2, attendeeCode: 'A202606240002', name: '李四', phone: '13800002222', organization: '产品设计部', identityType: '参会嘉宾', seatNo: 'A-02', tableNo: '1号桌', diningPlace: '一楼宴会厅', hotel: '北京国际饭店', roomNo: '302', remark: '', checkinStatus: 'not_checked_in', checkinTime: null },
  { id: 3, attendeeCode: 'A202606240003', name: '王五', phone: '13800003333', organization: '市场营销部', identityType: '参会嘉宾', seatNo: 'A-03', tableNo: '2号桌', diningPlace: '一楼宴会厅', hotel: '北京国际饭店', roomNo: '303', remark: '', checkinStatus: 'not_checked_in', checkinTime: null },
  { id: 4, attendeeCode: 'A202606240004', name: '赵六', phone: '13800004444', organization: '人力资源部', identityType: '工作人员', seatNo: 'B-01', tableNo: '3号桌', diningPlace: '一楼宴会厅', hotel: '北京国际饭店', roomNo: '305', remark: '负责签到', checkinStatus: 'not_checked_in', checkinTime: null },
  { id: 5, attendeeCode: 'A202606240005', name: '钱七', phone: '13800005555', organization: '财务管理部', identityType: '参会嘉宾', seatNo: 'B-02', tableNo: '3号桌', diningPlace: '一楼宴会厅', hotel: '北京国际饭店', roomNo: '306', remark: '', checkinStatus: 'not_checked_in', checkinTime: null },
  { id: 6, attendeeCode: 'A202606240006', name: '孙八', phone: '13800006666', organization: '技术研发部', identityType: '参会嘉宾', seatNo: 'B-03', tableNo: '4号桌', diningPlace: '一楼宴会厅', hotel: '北京国际饭店', roomNo: '307', remark: '', checkinStatus: 'not_checked_in', checkinTime: null },
  { id: 7, attendeeCode: 'A202606240007', name: '周九', phone: '13800007777', organization: '行政管理部', identityType: '工作人员', seatNo: 'C-01', tableNo: '4号桌', diningPlace: '一楼宴会厅', hotel: '北京国际饭店', roomNo: '308', remark: '负责会务', checkinStatus: 'not_checked_in', checkinTime: null },
  { id: 8, attendeeCode: 'A202606240008', name: '吴十', phone: '13800008888', organization: '技术研发部', identityType: '参会嘉宾', seatNo: 'C-02', tableNo: '5号桌', diningPlace: '一楼宴会厅', hotel: '北京国际饭店', roomNo: '309', remark: '', checkinStatus: 'not_checked_in', checkinTime: null },
  { id: 9, attendeeCode: 'A202606240009', name: '郑十一', phone: '13800009999', organization: '产品设计部', identityType: '特邀嘉宾', seatNo: 'C-03', tableNo: '5号桌', diningPlace: '一楼宴会厅', hotel: '北京国际饭店', roomNo: '501', remark: 'VIP嘉宾', checkinStatus: 'not_checked_in', checkinTime: null },
  { id: 10, attendeeCode: 'A202606240010', name: '冯十二', phone: '13800000000', organization: '市场营销部', identityType: '参会嘉宾', seatNo: 'D-01', tableNo: '6号桌', diningPlace: '一楼宴会厅', hotel: '北京国际饭店', roomNo: '502', remark: '', checkinStatus: 'not_checked_in', checkinTime: null }
]

let liveImageList = []
let checkinLogList = []

// ID 自增计数器
let nextScheduleId = 10
let nextAttendeeId = 11
let nextLiveImageId = 1

// ==================== 辅助函数：解析云数据库返回的JSON字符串 ====================
function parseCloudData(dataArray) {
  if (!Array.isArray(dataArray)) return []
  return dataArray.map(item => {
    try {
      return typeof item === 'string' ? JSON.parse(item) : item
    } catch (e) {
      console.error('[云数据库] JSON解析失败:', e.message)
      return item
    }
  })
}

// ==================== 获取当前活动ID ====================
async function getCurrentActivityId() {
  if (CONFIG.mode === 'cloud') {
    try {
      const docs = await cloudDB.getCollection(CONFIG.collections.ACTIVITY, { is_current: 1 }, null, 1)
      const items = parseCloudData(docs)
      if (items.length > 0) return items[0]._id
      // 向后兼容：取第一条
      const fallback = await cloudDB.getCollection(CONFIG.collections.ACTIVITY, {}, null, 1)
      const fbItems = parseCloudData(fallback)
      if (fbItems.length > 0) return fbItems[0]._id
      return null
    } catch (err) {
      console.error('[获取当前活动] 失败:', err.message)
      return null
    }
  }
  return 'local_current'
}

// ==================== 路由定义 ====================

// 1. POST /api/admin/login - 登录验证
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return error(res, 400, '用户名和密码不能为空')
  }

  // 云模式：查询admin集合
  if (CONFIG.mode === 'cloud') {
    try {
      const docs = await cloudDB.getCollection(CONFIG.collections.ADMIN, { username })
      const items = parseCloudData(docs)
      
      if (items.length === 0) {
        // 如果没有管理员，自动创建默认管理员
        const defaultAdmin = {
          username: 'admin',
          password_hash: hashPassword('admin123'),
          role: 'admin',
          createTime: new Date().toISOString()
        }
        await cloudDB.addDocument(CONFIG.collections.ADMIN, defaultAdmin)
        
        // 重新查询
        const newDocs = await cloudDB.getCollection(CONFIG.collections.ADMIN, { username })
        const newItems = parseCloudData(newDocs)
        
        if (newItems.length === 0 || newItems[0].password_hash !== hashPassword(password)) {
          return error(res, 401, '用户名或密码错误')
        }
        
        const admin = newItems[0]
        const token = jwt.sign(
          { id: admin._id, username: admin.username, role: admin.role },
          JWT_SECRET,
          { expiresIn: '24h' }
        )
        return success(res, { token, admin: { id: admin._id, username: admin.username, role: admin.role } }, '登录成功')
      }
      
      const admin = items[0]
      const hashedPwd = hashPassword(password)
      
      if (admin.password_hash !== hashedPwd) {
        return error(res, 401, '用户名或密码错误')
      }
      
      const token = jwt.sign(
        { id: admin._id, username: admin.username, role: admin.role },
        JWT_SECRET,
        { expiresIn: '24h' }
      )
      
      return success(res, { token, admin: { id: admin._id, username: admin.username, role: admin.role } }, '登录成功')
    } catch (err) {
      console.error('[登录] 云模式查询失败:', err.message)
      return error(res, 500, '登录失败: ' + err.message)
    }
  }

  // 本地模式：使用内存数据
  const hashedPwd = hashPassword(password)
  const admin = adminList.find(a => a.username === username && a.password_hash === hashedPwd)

  if (!admin) {
    return error(res, 401, '用户名或密码错误')
  }

  const token = jwt.sign(
    { id: admin.id, username: admin.username, role: admin.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  )

  success(res, { token, admin: { id: admin.id, username: admin.username, role: admin.role } }, '登录成功')
})

// 2. GET /api/admin/dashboard - 数据概览（当前活动）
app.get('/api/admin/dashboard', authMiddleware, async (req, res) => {
  // 云模式
  if (CONFIG.mode === 'cloud') {
    try {
      const activityId = await getCurrentActivityId()
      const whereClause = activityId ? { activity_id: activityId } : {}
      const total = await cloudDB.countDocuments(CONFIG.collections.ATTENDEE, whereClause)
      const checkedIn = await cloudDB.countDocuments(CONFIG.collections.ATTENDEE, { ...whereClause, checkin_status: 1 })
      const rate = total > 0 ? ((checkedIn / total) * 100).toFixed(1) : 0
      return success(res, { total, checkedIn, notCheckedIn: total - checkedIn, rate: parseFloat(rate), currentActivityId: activityId })
    } catch (err) {
      console.error('[仪表板] 云模式查询失败:', err.message)
      return error(res, 500, '获取数据失败: ' + err.message)
    }
  }

  // 本地模式
  const total = attendeeList.length
  const checkedIn = attendeeList.filter(a => a.checkin_status === 1 || a.checkinStatus === 'checked_in' || a.checkedIn === true).length
  const rate = total > 0 ? ((checkedIn / total) * 100).toFixed(1) : 0

  success(res, { total, checkedIn, notCheckedIn: total - checkedIn, rate: parseFloat(rate), currentActivityId: 'local_current' })
})

// 3. GET /api/admin/activity - 获取当前活动信息
app.get('/api/admin/activity', authMiddleware, async (req, res) => {
  // 云模式
  if (CONFIG.mode === 'cloud') {
    try {
      const docs = await cloudDB.getCollection(CONFIG.collections.ACTIVITY, { is_current: 1 }, null, 1)
      const items = parseCloudData(docs)
      
      if (items.length === 0) {
        // 向后兼容：取第一条
        const fallback = await cloudDB.getCollection(CONFIG.collections.ACTIVITY, {}, null, 1)
        const fbItems = parseCloudData(fallback)
        if (fbItems.length === 0) {
          return success(res, activityData)
        }
        const activity = { ...fbItems[0], id: fbItems[0]._id, currentActivityId: fbItems[0]._id }
        return success(res, activity)
      }
      
      // 云数据库文档使用_id，前端可能需要id字段
      const activity = { ...items[0], id: items[0]._id, currentActivityId: items[0]._id }
      return success(res, activity)
    } catch (err) {
      console.error('[活动] 云模式查询失败:', err.message)
      return error(res, 500, '获取活动信息失败: ' + err.message)
    }
  }

  // 本地模式
  success(res, { ...activityData, currentActivityId: 'local_current' })
})

// 4. PUT /api/admin/activity - 更新活动信息
app.put('/api/admin/activity', authMiddleware, async (req, res) => {
  const { title, start_time, end_time, location, organizer, co_organizer, description, traffic_info, map_image, contact_phone } = req.body

  // 云模式
  if (CONFIG.mode === 'cloud') {
    try {
      const docs = await cloudDB.getCollection(CONFIG.collections.ACTIVITY, {}, null, 1)
      const items = parseCloudData(docs)
      
      const updateData = {
        title: title !== undefined ? title : undefined,
        start_time: start_time !== undefined ? start_time : undefined,
        end_time: end_time !== undefined ? end_time : undefined,
        location: location !== undefined ? location : undefined,
        organizer: organizer !== undefined ? organizer : undefined,
        co_organizer: co_organizer !== undefined ? co_organizer : undefined,
        description: description !== undefined ? description : undefined,
        traffic_info: traffic_info !== undefined ? traffic_info : undefined,
        map_image: map_image !== undefined ? map_image : undefined,
        contact_phone: contact_phone !== undefined ? contact_phone : undefined
      }
      
      // 移除undefined的字段
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) delete updateData[key]
      })
      
      if (items.length === 0) {
        // 没有文档则创建
        updateData.createTime = new Date().toISOString()
        await cloudDB.addDocument(CONFIG.collections.ACTIVITY, updateData)
      } else {
        // 有文档则更新
        await cloudDB.updateDocument(CONFIG.collections.ACTIVITY, items[0]._id, updateData)
      }
      
      // 返回更新后的数据
      const updatedDocs = await cloudDB.getCollection(CONFIG.collections.ACTIVITY, {}, null, 1)
      const updatedItems = parseCloudData(updatedDocs)
      const result = updatedItems.length > 0 ? { ...updatedItems[0], id: updatedItems[0]._id } : { ...activityData, ...updateData }
      
      return success(res, result, '活动信息更新成功')
    } catch (err) {
      console.error('[活动] 云模式更新失败:', err.message)
      return error(res, 500, '更新活动信息失败: ' + err.message)
    }
  }

  // 本地模式
  if (title !== undefined) activityData.title = title
  if (start_time !== undefined) activityData.start_time = start_time
  if (end_time !== undefined) activityData.end_time = end_time
  if (location !== undefined) activityData.location = location
  if (organizer !== undefined) activityData.organizer = organizer
  if (co_organizer !== undefined) activityData.co_organizer = co_organizer
  if (description !== undefined) activityData.description = description
  if (traffic_info !== undefined) activityData.traffic_info = traffic_info
  if (map_image !== undefined) activityData.map_image = map_image
  if (contact_phone !== undefined) activityData.contact_phone = contact_phone

  success(res, activityData, '活动信息更新成功')
})

// ==================== 多活动管理 ====================

// GET /api/admin/activities - 获取所有活动列表
app.get('/api/admin/activities', authMiddleware, async (req, res) => {
  if (CONFIG.mode === 'cloud') {
    try {
      const docs = await cloudDB.getCollection(CONFIG.collections.ACTIVITY, {}, { field: 'created_at', order: 'desc' }, 100)
      const items = parseCloudData(docs)
      
      // 为每个活动统计参会人数和签到率
      const enrichedList = []
      for (const activity of items) {
        const whereClause = { activity_id: activity._id }
        const total = await cloudDB.countDocuments(CONFIG.collections.ATTENDEE, whereClause)
        const checkedIn = await cloudDB.countDocuments(CONFIG.collections.ATTENDEE, { ...whereClause, checkin_status: 1 })
        const checkinRate = total > 0 ? ((checkedIn / total) * 100).toFixed(1) : 0
        
        enrichedList.push({
          ...activity,
          id: activity._id,
          totalAttendees: total,
          checkedIn,
          checkinRate: parseFloat(checkinRate)
        })
      }
      
      return success(res, enrichedList)
    } catch (err) {
      console.error('[活动列表] 云模式查询失败:', err.message)
      return error(res, 500, '获取活动列表失败: ' + err.message)
    }
  }
  
  // 本地模式
  success(res, [{ ...activityData, id: 'local_current', is_current: 1, totalAttendees: attendeeList.length, checkedIn: attendeeList.filter(a => a.checkinStatus === 'checked_in').length, checkinRate: 0 }])
})

// POST /api/admin/activities - 创建新活动
app.post('/api/admin/activities', authMiddleware, async (req, res) => {
  const { title, description, location, organizer, start_time, end_time } = req.body
  const now = new Date().toISOString()
  const defaultTitle = title || `新活动 ${now.substring(0, 10)}`
  
  if (CONFIG.mode === 'cloud') {
    try {
      const activityDoc = {
        title: defaultTitle,
        description: description || '',
        location: location || '',
        organizer: organizer || '',
        start_time: start_time || '',
        end_time: end_time || '',
        is_current: 0,
        created_at: now,
        updated_at: now
      }
      const result = await cloudDB.addDocument(CONFIG.collections.ACTIVITY, activityDoc)
      return success(res, { id: result._id, ...activityDoc }, '活动创建成功')
    } catch (err) {
      console.error('[创建活动] 云模式失败:', err.message)
      return error(res, 500, '创建活动失败: ' + err.message)
    }
  }
  
  // 本地模式
  success(res, { id: 'local_new', title: defaultTitle, is_current: 0 }, '活动创建成功')
})

// PUT /api/admin/activities/:id - 更新指定活动
app.put('/api/admin/activities/:id', authMiddleware, async (req, res) => {
  const paramId = req.params.id
  const { title, description, location, organizer, start_time, end_time } = req.body
  
  if (CONFIG.mode === 'cloud') {
    try {
      const docs = await cloudDB.getCollection(CONFIG.collections.ACTIVITY, {}, null, 100)
      const items = parseCloudData(docs)
      const target = items.find(item => item._id === paramId)
      
      if (!target) {
        return error(res, 404, '活动不存在')
      }
      
      const updateData = {}
      if (title !== undefined) updateData.title = title
      if (description !== undefined) updateData.description = description
      if (location !== undefined) updateData.location = location
      if (organizer !== undefined) updateData.organizer = organizer
      if (start_time !== undefined) updateData.start_time = start_time
      if (end_time !== undefined) updateData.end_time = end_time
      updateData.updated_at = new Date().toISOString()
      
      await cloudDB.updateDocument(CONFIG.collections.ACTIVITY, target._id, updateData)
      return success(res, null, '活动更新成功')
    } catch (err) {
      console.error('[更新活动] 云模式失败:', err.message)
      return error(res, 500, '更新活动失败: ' + err.message)
    }
  }
  
  success(res, null, '活动更新成功')
})

// DELETE /api/admin/activities/:id - 删除活动
app.delete('/api/admin/activities/:id', authMiddleware, async (req, res) => {
  const paramId = req.params.id
  
  if (CONFIG.mode === 'cloud') {
    try {
      const docs = await cloudDB.getCollection(CONFIG.collections.ACTIVITY, {}, null, 100)
      const items = parseCloudData(docs)
      const target = items.find(item => item._id === paramId)
      
      if (!target) {
        return error(res, 404, '活动不存在')
      }
      
      if (target.is_current === 1) {
        return error(res, 400, '不能删除当前活动，请先切换到其他活动')
      }
      
      await cloudDB.deleteDocument(CONFIG.collections.ACTIVITY, target._id)
      return success(res, null, '活动删除成功')
    } catch (err) {
      console.error('[删除活动] 云模式失败:', err.message)
      return error(res, 500, '删除活动失败: ' + err.message)
    }
  }
  
  success(res, null, '活动删除成功')
})

// POST /api/admin/activities/:id/activate - 设为当前活动
app.post('/api/admin/activities/:id/activate', authMiddleware, async (req, res) => {
  const paramId = req.params.id
  
  if (CONFIG.mode === 'cloud') {
    try {
      // 查询所有活动
      const docs = await cloudDB.getCollection(CONFIG.collections.ACTIVITY, {}, null, 100)
      const items = parseCloudData(docs)
      
      // 将所有活动的 is_current 设为 0
      for (const act of items) {
        if (act.is_current === 1) {
          await cloudDB.updateDocument(CONFIG.collections.ACTIVITY, act._id, { is_current: 0, updated_at: new Date().toISOString() })
        }
      }
      
      // 将目标活动的 is_current 设为 1
      await cloudDB.updateDocument(CONFIG.collections.ACTIVITY, paramId, { is_current: 1, updated_at: new Date().toISOString() })
      
      return success(res, null, '活动已切换为当前活动')
    } catch (err) {
      console.error('[切换活动] 云模式失败:', err.message)
      return error(res, 500, '切换活动失败: ' + err.message)
    }
  }
  
  success(res, null, '活动已切换为当前活动')
})

// 5. GET /api/admin/schedules - 获取日程列表（当前活动）
app.get('/api/admin/schedules', authMiddleware, async (req, res) => {
  // 云模式
  if (CONFIG.mode === 'cloud') {
    try {
      const activityId = await getCurrentActivityId()
      const whereClause = activityId ? { activity_id: activityId } : {}
      const docs = await cloudDB.getCollection(CONFIG.collections.SCHEDULE, whereClause, { field: 'date', order: 'asc' }, 100)
      let items = parseCloudData(docs)
      
      // 向后兼容：包含没有 activity_id 的日程
      if (activityId) {
        const fbDocs = await cloudDB.getCollection(CONFIG.collections.SCHEDULE, {}, null, 100)
        const fbItems = parseCloudData(fbDocs).filter(item => !item.activity_id)
        items = items.concat(fbItems)
      }
      
      // 按日期+sortOrder排序
      items.sort((a, b) => {
        if (a.date !== b.date) return (a.date || '').localeCompare(b.date || '')
        return (a.sortOrder || 0) - (b.sortOrder || 0)
      })
      
      // 将_id映射为id
      const result = items.map(item => ({ ...item, id: item._id }))
      return success(res, result)
    } catch (err) {
      console.error('[日程] 云模式查询失败:', err.message)
      return error(res, 500, '获取日程列表失败: ' + err.message)
    }
  }

  // 本地模式
  const list = [...scheduleList].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.sortOrder - b.sortOrder
  })
  success(res, list)
})

// 6. POST /api/admin/schedules - 新增日程（当前活动）
app.post('/api/admin/schedules', authMiddleware, async (req, res) => {
  const { date, startTime, endTime, title, location, speaker, remark, sortOrder } = req.body

  if (!date || !startTime || !endTime || !title) {
    return error(res, 400, '日期、开始时间、结束时间和主题不能为空')
  }

  // 云模式
  if (CONFIG.mode === 'cloud') {
    try {
      const activityId = await getCurrentActivityId()
      const newSchedule = {
        activity_id: activityId || '',
        date,
        startTime,
        endTime,
        title,
        location: location || '',
        speaker: speaker || '',
        remark: remark || '',
        sortOrder: sortOrder || 0,
        createTime: new Date().toISOString()
      }
      
      const result = await cloudDB.addDocument(CONFIG.collections.SCHEDULE, newSchedule)
      // addDocument返回插入的_id
      const docId = result._id || result.id
      
      return success(res, { id: docId, ...newSchedule }, '日程新增成功')
    } catch (err) {
      console.error('[日程] 云模式新增失败:', err.message)
      return error(res, 500, '新增日程失败: ' + err.message)
    }
  }

  // 本地模式
  const newSchedule = {
    id: nextScheduleId++,
    date,
    startTime,
    endTime,
    title,
    location: location || '',
    speaker: speaker || '',
    remark: remark || '',
    sortOrder: sortOrder || 0
  }

  scheduleList.push(newSchedule)
  success(res, newSchedule, '日程新增成功')
})

// 7. PUT /api/admin/schedules/:id - 编辑日程
app.put('/api/admin/schedules/:id', authMiddleware, async (req, res) => {
  const paramId = req.params.id
  const { date, startTime, endTime, title, location, speaker, remark, sortOrder } = req.body

  // 云模式
  if (CONFIG.mode === 'cloud') {
    try {
      // 查询所有日程，通过date+title查找对应文档
      const docs = await cloudDB.getCollection(CONFIG.collections.SCHEDULE, {}, null, 200)
      const items = parseCloudData(docs)
      
      // 先尝试通过_id匹配
      let target = items.find(item => item._id === paramId)
      
      // 如果没有通过_id找到，尝试通过自定义字段匹配（前端可能传的是序号）
      if (!target) {
        const seqNum = parseInt(paramId)
        if (!isNaN(seqNum)) {
          target = items.find(item => item.sortOrder === seqNum || items.indexOf(item) === seqNum - 1)
        }
      }
      
      if (!target) {
        return error(res, 404, '日程不存在')
      }
      
      const updateData = {}
      if (date !== undefined) updateData.date = date
      if (startTime !== undefined) updateData.startTime = startTime
      if (endTime !== undefined) updateData.endTime = endTime
      if (title !== undefined) updateData.title = title
      if (location !== undefined) updateData.location = location
      if (speaker !== undefined) updateData.speaker = speaker
      if (remark !== undefined) updateData.remark = remark
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder
      
      await cloudDB.updateDocument(CONFIG.collections.SCHEDULE, target._id, updateData)
      
      return success(res, { id: target._id, ...target, ...updateData }, '日程更新成功')
    } catch (err) {
      console.error('[日程] 云模式更新失败:', err.message)
      return error(res, 500, '更新日程失败: ' + err.message)
    }
  }

  // 本地模式
  const id = parseInt(paramId)
  const index = scheduleList.findIndex(s => s.id === id)

  if (index === -1) {
    return error(res, 404, '日程不存在')
  }

  if (date !== undefined) scheduleList[index].date = date
  if (startTime !== undefined) scheduleList[index].startTime = startTime
  if (endTime !== undefined) scheduleList[index].endTime = endTime
  if (title !== undefined) scheduleList[index].title = title
  if (location !== undefined) scheduleList[index].location = location
  if (speaker !== undefined) scheduleList[index].speaker = speaker
  if (remark !== undefined) scheduleList[index].remark = remark
  if (sortOrder !== undefined) scheduleList[index].sortOrder = sortOrder

  success(res, scheduleList[index], '日程更新成功')
})

// 8. DELETE /api/admin/schedules/:id - 删除日程
app.delete('/api/admin/schedules/:id', authMiddleware, async (req, res) => {
  const paramId = req.params.id

  // 云模式
  if (CONFIG.mode === 'cloud') {
    try {
      const docs = await cloudDB.getCollection(CONFIG.collections.SCHEDULE, {}, null, 200)
      const items = parseCloudData(docs)
      
      let target = items.find(item => item._id === paramId)
      
      if (!target) {
        const seqNum = parseInt(paramId)
        if (!isNaN(seqNum)) {
          target = items.find(item => item.sortOrder === seqNum || items.indexOf(item) === seqNum - 1)
        }
      }
      
      if (!target) {
        return error(res, 404, '日程不存在')
      }
      
      await cloudDB.deleteDocument(CONFIG.collections.SCHEDULE, target._id)
      return success(res, null, '日程删除成功')
    } catch (err) {
      console.error('[日程] 云模式删除失败:', err.message)
      return error(res, 500, '删除日程失败: ' + err.message)
    }
  }

  // 本地模式
  const id = parseInt(paramId)
  const index = scheduleList.findIndex(s => s.id === id)

  if (index === -1) {
    return error(res, 404, '日程不存在')
  }

  scheduleList.splice(index, 1)
  success(res, null, '日程删除成功')
})

// 9. GET /api/admin/attendees - 分页查询参会人员（当前活动）
app.get('/api/admin/attendees', authMiddleware, async (req, res) => {
  const { keyword, checkinStatus, page = 1, pageSize = 10 } = req.query

  // 云模式
  if (CONFIG.mode === 'cloud') {
    try {
      const activityId = await getCurrentActivityId()
      // 云数据库查询语法有限，获取所有数据后在JS中过滤
      const docs = await cloudDB.getCollection(CONFIG.collections.ATTENDEE, {}, null, 1000)
      let items = parseCloudData(docs)
      
      // 按 activity_id 过滤（当前活动 + 向后兼容无 activity_id 的记录）
      if (activityId) {
        items = items.filter(a => a.activity_id === activityId || !a.activity_id)
      }
      
      let filtered = items
      
      // 关键词搜索（姓名、手机号、单位）
      if (keyword) {
        const kw = keyword.toLowerCase()
        filtered = filtered.filter(a =>
          (a.name && a.name.toLowerCase().includes(kw)) ||
          (a.phone && a.phone.includes(kw)) ||
          (a.organization && a.organization.toLowerCase().includes(kw)) ||
          (a.attendeeCode && a.attendeeCode.toLowerCase().includes(kw))
        )
      }
      
      // 签到状态筛选
      if (checkinStatus) {
        filtered = filtered.filter(a => {
          // 兼容两种字段名
          const status = a.checkin_status !== undefined ? (a.checkin_status === 1 ? 'checked_in' : 'not_checked_in') : a.checkinStatus
          return status === checkinStatus
        })
      }
      
      const total = filtered.length
      const pageNum = parseInt(page)
      const size = parseInt(pageSize)
      const start = (pageNum - 1) * size
      const list = filtered.slice(start, start + size).map(a => ({
        ...a,
        id: a._id,
        // 统一签到状态字段
        checkinStatus: a.checkin_status !== undefined ? (a.checkin_status === 1 ? 'checked_in' : 'not_checked_in') : a.checkinStatus,
        checkinTime: a.checkin_time || a.checkinTime
      }))
      
      return success(res, { list, total, page: pageNum, pageSize: size })
    } catch (err) {
      console.error('[参会人员] 云模式查询失败:', err.message)
      return error(res, 500, '查询参会人员失败: ' + err.message)
    }
  }

  // 本地模式
  let filtered = [...attendeeList]

  // 关键词搜索（姓名、手机号、单位）
  if (keyword) {
    const kw = keyword.toLowerCase()
    filtered = filtered.filter(a =>
      a.name.toLowerCase().includes(kw) ||
      a.phone.includes(kw) ||
      a.organization.toLowerCase().includes(kw) ||
      (a.attendeeCode && a.attendeeCode.toLowerCase().includes(kw))
    )
  }

  // 签到状态筛选
  if (checkinStatus) {
    filtered = filtered.filter(a => a.checkinStatus === checkinStatus)
  }

  const total = filtered.length
  const pageNum = parseInt(page)
  const size = parseInt(pageSize)
  const start = (pageNum - 1) * size
  const list = filtered.slice(start, start + size)

  success(res, { list, total, page: pageNum, pageSize: size })
})

// 10. POST /api/admin/attendees/import - 导入参会人员（当前活动）
app.post('/api/admin/attendees/import', authMiddleware, async (req, res) => {
  // 如果是 multipart/form-data (Excel 文件上传)
  if (req.headers['content-type']?.includes('multipart/form-data')) {
    // multer 单文件处理 - 通过中间件处理
    upload.single('file')(req, res, async (err) => {
      if (err) {
        return error(res, 400, '文件上传失败: ' + err.message)
      }
      if (!req.file) {
        return error(res, 400, '请选择要导入的文件')
      }

      try {
        const activityId = await getCurrentActivityId()
        const workbook = XLSX.readFile(req.file.path)
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(sheet)

        // 将 Excel 数据转换为参会人员格式
        const fieldMap = {
          '参会码': 'attendeeCode',
          '姓名': 'name',
          '手机号': 'phone',
          '单位': 'organization',
          '身份类型': 'identityType',
          '座位号': 'seatNo',
          '餐桌号': 'tableNo',
          '用餐地点': 'diningPlace',
          '酒店': 'hotel',
          '房间号': 'roomNo',
          '备注': 'remark'
        }

        let imported = 0
        const attendees = []
        
        for (const row of jsonData) {
          const attendee = { checkinStatus: 'not_checked_in', checkinTime: null }
          for (const [cn, en] of Object.entries(fieldMap)) {
            if (row[cn] !== undefined) {
              attendee[en] = String(row[cn])
            }
          }
          if (attendee.name) {
            attendee.createTime = new Date().toISOString()
            attendees.push(attendee)
            imported++
          }
        }

        // 删除临时文件
        fs.unlinkSync(req.file.path)

        // 云模式：批量添加到云数据库
        if (CONFIG.mode === 'cloud') {
          try {
            for (const attendee of attendees) {
              attendee.activity_id = activityId || ''
              await cloudDB.addDocument(CONFIG.collections.ATTENDEE, attendee)
            }
          } catch (cloudErr) {
            console.error('[参会人员导入] 云模式添加失败:', cloudErr.message)
            return error(res, 500, '云数据库导入失败: ' + cloudErr.message)
          }
        } else {
          // 本地模式：添加到内存列表
          for (const attendee of attendees) {
            attendee.id = nextAttendeeId++
            attendeeList.push(attendee)
          }
        }

        success(res, { imported }, `成功导入 ${imported} 条参会人员数据`)
      } catch (e) {
        return error(res, 500, '文件解析失败: ' + e.message)
      }
    })
    return
  }

  // JSON 数组导入
  const data = req.body
  if (!Array.isArray(data)) {
    return error(res, 400, '请提供参会人员数组数据')
  }

  let imported = 0
  const attendees = []
  
  for (const item of data) {
    const attendee = {
      attendeeCode: item.attendeeCode || '',
      name: item.name || '',
      phone: item.phone || '',
      organization: item.organization || '',
      identityType: item.identityType || '参会嘉宾',
      seatNo: item.seatNo || '',
      tableNo: item.tableNo || '',
      diningPlace: item.diningPlace || '',
      hotel: item.hotel || '',
      roomNo: item.roomNo || '',
      remark: item.remark || '',
      checkinStatus: item.checkinStatus || 'not_checked_in',
      checkinTime: item.checkinTime || null,
      createTime: new Date().toISOString()
    }
    attendees.push(attendee)
    imported++
  }

  // 云模式：批量添加到云数据库
  if (CONFIG.mode === 'cloud') {
    try {
      const activityId = await getCurrentActivityId()
      for (const attendee of attendees) {
        attendee.activity_id = activityId || ''
        await cloudDB.addDocument(CONFIG.collections.ATTENDEE, attendee)
      }
    } catch (cloudErr) {
      console.error('[参会人员导入] 云模式添加失败:', cloudErr.message)
      return error(res, 500, '云数据库导入失败: ' + cloudErr.message)
    }
  } else {
    // 本地模式：添加到内存列表
    for (const attendee of attendees) {
      attendee.id = nextAttendeeId++
      attendeeList.push(attendee)
    }
  }

  success(res, { imported }, `成功导入 ${imported} 条参会人员数据`)
})

// 11. PUT /api/admin/attendees/:id - 编辑参会人员
app.put('/api/admin/attendees/:id', authMiddleware, async (req, res) => {
  const paramId = req.params.id
  const { name, phone, organization, identityType, seatNo, tableNo, hotel, roomNo, remark, diningPlace, attendeeCode } = req.body

  // 云模式
  if (CONFIG.mode === 'cloud') {
    try {
      // 查询所有参会人员
      const docs = await cloudDB.getCollection(CONFIG.collections.ATTENDEE, {}, null, 1000)
      const items = parseCloudData(docs)
      
      // 通过_id或attendeeCode查找
      let target = items.find(item => item._id === paramId)
      
      if (!target) {
        // 尝试通过attendeeCode匹配
        target = items.find(item => item.attendeeCode === paramId)
      }
      
      if (!target) {
        // 尝试通过序号匹配
        const seqNum = parseInt(paramId)
        if (!isNaN(seqNum)) {
          target = items[seqNum - 1]
        }
      }
      
      if (!target) {
        return error(res, 404, '参会人员不存在')
      }
      
      const updateData = {}
      if (name !== undefined) updateData.name = name
      if (phone !== undefined) updateData.phone = phone
      if (organization !== undefined) updateData.organization = organization
      if (identityType !== undefined) updateData.identityType = identityType
      if (seatNo !== undefined) updateData.seatNo = seatNo
      if (tableNo !== undefined) updateData.tableNo = tableNo
      if (hotel !== undefined) updateData.hotel = hotel
      if (roomNo !== undefined) updateData.roomNo = roomNo
      if (remark !== undefined) updateData.remark = remark
      if (diningPlace !== undefined) updateData.diningPlace = diningPlace
      if (attendeeCode !== undefined) updateData.attendeeCode = attendeeCode
      
      await cloudDB.updateDocument(CONFIG.collections.ATTENDEE, target._id, updateData)
      
      return success(res, { id: target._id, ...target, ...updateData }, '参会人员更新成功')
    } catch (err) {
      console.error('[参会人员] 云模式更新失败:', err.message)
      return error(res, 500, '更新参会人员失败: ' + err.message)
    }
  }

  // 本地模式
  const id = parseInt(paramId)
  const index = attendeeList.findIndex(a => a.id === id)

  if (index === -1) {
    return error(res, 404, '参会人员不存在')
  }

  if (name !== undefined) attendeeList[index].name = name
  if (phone !== undefined) attendeeList[index].phone = phone
  if (organization !== undefined) attendeeList[index].organization = organization
  if (identityType !== undefined) attendeeList[index].identityType = identityType
  if (seatNo !== undefined) attendeeList[index].seatNo = seatNo
  if (tableNo !== undefined) attendeeList[index].tableNo = tableNo
  if (hotel !== undefined) attendeeList[index].hotel = hotel
  if (roomNo !== undefined) attendeeList[index].roomNo = roomNo
  if (remark !== undefined) attendeeList[index].remark = remark
  if (diningPlace !== undefined) attendeeList[index].diningPlace = diningPlace
  if (attendeeCode !== undefined) attendeeList[index].attendeeCode = attendeeCode

  success(res, attendeeList[index], '参会人员更新成功')
})

// 12. DELETE /api/admin/attendees/:id - 删除参会人员
app.delete('/api/admin/attendees/:id', authMiddleware, async (req, res) => {
  const paramId = req.params.id

  // 云模式
  if (CONFIG.mode === 'cloud') {
    try {
      const docs = await cloudDB.getCollection(CONFIG.collections.ATTENDEE, {}, null, 1000)
      const items = parseCloudData(docs)
      
      let target = items.find(item => item._id === paramId)
      
      if (!target) {
        target = items.find(item => item.attendeeCode === paramId)
      }
      
      if (!target) {
        const seqNum = parseInt(paramId)
        if (!isNaN(seqNum)) {
          target = items[seqNum - 1]
        }
      }
      
      if (!target) {
        return error(res, 404, '参会人员不存在')
      }
      
      await cloudDB.deleteDocument(CONFIG.collections.ATTENDEE, target._id)
      return success(res, null, '参会人员删除成功')
    } catch (err) {
      console.error('[参会人员] 云模式删除失败:', err.message)
      return error(res, 500, '删除参会人员失败: ' + err.message)
    }
  }

  // 本地模式
  const id = parseInt(paramId)
  const index = attendeeList.findIndex(a => a.id === id)

  if (index === -1) {
    return error(res, 404, '参会人员不存在')
  }

  attendeeList.splice(index, 1)
  success(res, null, '参会人员删除成功')
})

// 13. GET /api/admin/attendees/export - 导出参会人员（当前活动）
app.get('/api/admin/attendees/export', authMiddleware, async (req, res) => {
  const { keyword, checkinStatus, status } = req.query
  let filtered = []

  // 云模式
  if (CONFIG.mode === 'cloud') {
    try {
      const activityId = await getCurrentActivityId()
      const docs = await cloudDB.getCollection(CONFIG.collections.ATTENDEE, {}, null, 1000)
      let items = parseCloudData(docs)
      
      // 按 activity_id 过滤（当前活动 + 向后兼容无 activity_id 的记录）
      if (activityId) {
        items = items.filter(a => a.activity_id === activityId || !a.activity_id)
      }
      
      filtered = items.map(a => ({
        ...a,
        id: a._id,
        checkinStatus: a.checkin_status !== undefined ? (a.checkin_status === 1 ? 'checked_in' : 'not_checked_in') : a.checkinStatus,
        checkinTime: a.checkin_time || a.checkinTime
      }))
      
      // 关键词搜索
      if (keyword) {
        const kw = keyword.toLowerCase()
        filtered = filtered.filter(a =>
          (a.name && a.name.toLowerCase().includes(kw)) ||
          (a.phone && a.phone.includes(kw)) ||
          (a.organization && a.organization.toLowerCase().includes(kw)) ||
          (a.attendeeCode && a.attendeeCode.toLowerCase().includes(kw))
        )
      }
      
      // 签到状态筛选
      const filterStatus = status || checkinStatus
      if (filterStatus) {
        filtered = filtered.filter(a => a.checkinStatus === filterStatus)
      }
    } catch (err) {
      console.error('[参会人员导出] 云模式查询失败:', err.message)
      return error(res, 500, '导出参会人员失败: ' + err.message)
    }
  } else {
    // 本地模式
    filtered = [...attendeeList]
    
    if (keyword) {
      const kw = keyword.toLowerCase()
      filtered = filtered.filter(a =>
        a.name.toLowerCase().includes(kw) ||
        a.phone.includes(kw) ||
        a.organization.toLowerCase().includes(kw) ||
        (a.attendeeCode && a.attendeeCode.toLowerCase().includes(kw))
      )
    }
    
    const filterStatus = status || checkinStatus
    if (filterStatus) {
      filtered = filtered.filter(a => a.checkinStatus === filterStatus)
    }
  }

  // 转换为 Excel 格式数据
  const exportData = filtered.map(a => ({
    '参会码': a.attendeeCode,
    '姓名': a.name,
    '手机号': a.phone,
    '单位': a.organization,
    '身份类型': a.identityType,
    '座位号': a.seatNo,
    '餐桌号': a.tableNo,
    '用餐地点': a.diningPlace,
    '酒店': a.hotel,
    '房间号': a.roomNo,
    '签到状态': a.checkinStatus === 'checked_in' ? '已签到' : '未签到',
    '签到时间': a.checkinTime || '',
    '备注': a.remark
  }))

  // 生成 Excel 文件并返回
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(exportData)

  // 设置列宽
  ws['!cols'] = [
    { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 16 },
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 14 },
    { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 20 }
  ]

  XLSX.utils.book_append_sheet(wb, ws, '参会人员')
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename=attendees.xlsx')
  res.send(buffer)
})

// 14. GET /api/admin/checkin/list - 签到列表（当前活动）
app.get('/api/admin/checkin/list', authMiddleware, async (req, res) => {
  const { keyword, status, page = 1, pageSize = 10 } = req.query

  // 云模式
  if (CONFIG.mode === 'cloud') {
    try {
      const activityId = await getCurrentActivityId()
      const docs = await cloudDB.getCollection(CONFIG.collections.ATTENDEE, {}, null, 1000)
      let items = parseCloudData(docs)
      
      // 按 activity_id 过滤（当前活动 + 向后兼容无 activity_id 的记录）
      if (activityId) {
        items = items.filter(a => a.activity_id === activityId || !a.activity_id)
      }
      
      let filtered = items.map(a => ({
        id: a._id,
        attendeeCode: a.attendeeCode,
        name: a.name,
        phone: a.phone,
        organization: a.organization,
        identityType: a.identityType,
        checkinStatus: a.checkin_status !== undefined ? (a.checkin_status === 1 ? 'checked_in' : 'not_checked_in') : (a.checkinStatus || 'not_checked_in'),
        checkedIn: a.checkin_status === 1 || a.checkinStatus === 'checked_in',
        checkinTime: a.checkin_time || a.checkinTime,
        checkin_time: a.checkin_time || a.checkinTime
      }))
      
      // 关键词搜索
      if (keyword) {
        const kw = keyword.toLowerCase()
        filtered = filtered.filter(a =>
          (a.name && a.name.toLowerCase().includes(kw)) ||
          (a.phone && a.phone.includes(kw)) ||
          (a.organization && a.organization.toLowerCase().includes(kw)) ||
          (a.attendeeCode && a.attendeeCode.toLowerCase().includes(kw))
        )
      }
      
      // 签到状态筛选
      if (status) {
        filtered = filtered.filter(a => a.checkinStatus === status)
      }
      
      const total = filtered.length
      const pageNum = parseInt(page)
      const size = parseInt(pageSize)
      const start = (pageNum - 1) * size
      const list = filtered.slice(start, start + size)
      
      return success(res, { list, total, page: pageNum, pageSize: size })
    } catch (err) {
      console.error('[签到列表] 云模式查询失败:', err.message)
      return error(res, 500, '获取签到列表失败: ' + err.message)
    }
  }

  // 本地模式
  let filtered = [...attendeeList]

  // 关键词搜索
  if (keyword) {
    const kw = keyword.toLowerCase()
    filtered = filtered.filter(a =>
      a.name.toLowerCase().includes(kw) ||
      a.phone.includes(kw) ||
      a.organization.toLowerCase().includes(kw) ||
      (a.attendeeCode && a.attendeeCode.toLowerCase().includes(kw))
    )
  }

  // 签到状态筛选
  if (status) {
    filtered = filtered.filter(a => a.checkinStatus === status)
  }

  const total = filtered.length
  const pageNum = parseInt(page)
  const size = parseInt(pageSize)
  const start = (pageNum - 1) * size
  const list = filtered.slice(start, start + size).map(a => ({
    id: a.id,
    attendeeCode: a.attendeeCode,
    name: a.name,
    phone: a.phone,
    organization: a.organization,
    identityType: a.identityType,
    checkinStatus: a.checkinStatus,
    checkedIn: a.checkinStatus === 'checked_in',
    checkinTime: a.checkinTime,
    checkin_time: a.checkinTime
  }))

  success(res, { list, total, page: pageNum, pageSize: size })
})

// 15. POST /api/admin/live-images - 上传图文直播图片（当前活动）
app.post('/api/admin/live-images', authMiddleware, (req, res) => {
  // 如果是 multipart/form-data 文件上传
  upload.single('file')(req, res, async (err) => {
    if (err) {
      return error(res, 400, '文件上传失败: ' + err.message)
    }
    
    const activityId = await getCurrentActivityId()
    let imageData = {}
    
    if (req.file) {
      const imageUrl = `/uploads/${req.file.filename}`
      imageData = {
        activity_id: activityId || '',
        url: imageUrl,
        imageUrl: imageUrl,
        title: req.body.title || '',
        sortOrder: parseInt(req.body.sortOrder) || 0,
        visible: req.body.visible !== 'false',
        createTime: new Date().toISOString()
      }
    } else {
      // JSON 方式上传（包含 url 等信息）
      const { url, imageUrl, title, sortOrder, visible } = req.body
      imageData = {
        activity_id: activityId || '',
        url: url || imageUrl || '',
        imageUrl: imageUrl || url || '',
        title: title || '',
        sortOrder: sortOrder || 0,
        visible: visible !== undefined ? visible : true,
        createTime: new Date().toISOString()
      }
    }
    
    // 云模式
    if (CONFIG.mode === 'cloud') {
      try {
        const result = await cloudDB.addDocument(CONFIG.collections.LIVE_IMAGE, imageData)
        const docId = result._id || result.id
        return success(res, { id: docId, ...imageData }, '图片上传成功')
      } catch (cloudErr) {
        console.error('[图文直播] 云模式添加失败:', cloudErr.message)
        return error(res, 500, '图片上传失败: ' + cloudErr.message)
      }
    }
    
    // 本地模式
    imageData.id = nextLiveImageId++
    liveImageList.push(imageData)
    success(res, imageData, '图片上传成功')
  })
})

// 16. GET /api/admin/live-images - 获取图文直播列表（当前活动）
app.get('/api/admin/live-images', authMiddleware, async (req, res) => {
  // 云模式
  if (CONFIG.mode === 'cloud') {
    try {
      const activityId = await getCurrentActivityId()
      const whereClause = activityId ? { activity_id: activityId } : {}
      const docs = await cloudDB.getCollection(CONFIG.collections.LIVE_IMAGE, whereClause, null, 100)
      let items = parseCloudData(docs)
      
      // 向后兼容：包含没有 activity_id 的图片
      if (activityId) {
        const fbDocs = await cloudDB.getCollection(CONFIG.collections.LIVE_IMAGE, {}, null, 100)
        const fbItems = parseCloudData(fbDocs).filter(item => !item.activity_id)
        items = items.concat(fbItems)
      }
      
      // 按sortOrder排序
      items.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      
      // 将_id映射为id
      const result = items.map(item => ({ ...item, id: item._id }))
      return success(res, result)
    } catch (err) {
      console.error('[图文直播] 云模式查询失败:', err.message)
      return error(res, 500, '获取图文直播列表失败: ' + err.message)
    }
  }

  // 本地模式
  const list = [...liveImageList].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
  success(res, list)
})

// 17. PUT /api/admin/live-images/:id - 编辑图文直播
app.put('/api/admin/live-images/:id', authMiddleware, async (req, res) => {
  const paramId = req.params.id
  const { title, sortOrder, visible } = req.body

  // 云模式
  if (CONFIG.mode === 'cloud') {
    try {
      const docs = await cloudDB.getCollection(CONFIG.collections.LIVE_IMAGE, {}, null, 100)
      const items = parseCloudData(docs)
      
      let target = items.find(item => item._id === paramId)
      
      if (!target) {
        const seqNum = parseInt(paramId)
        if (!isNaN(seqNum)) {
          target = items.find(item => item.sortOrder === seqNum || items.indexOf(item) === seqNum - 1)
        }
      }
      
      if (!target) {
        return error(res, 404, '图片不存在')
      }
      
      const updateData = {}
      if (title !== undefined) updateData.title = title
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder
      if (visible !== undefined) updateData.visible = visible
      
      await cloudDB.updateDocument(CONFIG.collections.LIVE_IMAGE, target._id, updateData)
      
      return success(res, { id: target._id, ...target, ...updateData }, '图片信息更新成功')
    } catch (err) {
      console.error('[图文直播] 云模式更新失败:', err.message)
      return error(res, 500, '更新图片信息失败: ' + err.message)
    }
  }

  // 本地模式
  const id = parseInt(paramId)
  const index = liveImageList.findIndex(img => img.id === id)

  if (index === -1) {
    return error(res, 404, '图片不存在')
  }

  if (title !== undefined) liveImageList[index].title = title
  if (sortOrder !== undefined) liveImageList[index].sortOrder = sortOrder
  if (visible !== undefined) liveImageList[index].visible = visible

  success(res, liveImageList[index], '图片信息更新成功')
})

// 18. DELETE /api/admin/live-images/:id - 删除图文直播
app.delete('/api/admin/live-images/:id', authMiddleware, async (req, res) => {
  const paramId = req.params.id

  // 云模式
  if (CONFIG.mode === 'cloud') {
    try {
      const docs = await cloudDB.getCollection(CONFIG.collections.LIVE_IMAGE, {}, null, 100)
      const items = parseCloudData(docs)
      
      let target = items.find(item => item._id === paramId)
      
      if (!target) {
        const seqNum = parseInt(paramId)
        if (!isNaN(seqNum)) {
          target = items.find(item => item.sortOrder === seqNum || items.indexOf(item) === seqNum - 1)
        }
      }
      
      if (!target) {
        return error(res, 404, '图片不存在')
      }
      
      // 删除关联的物理文件
      const imageUrl = target.url || target.imageUrl
      if (imageUrl && imageUrl.startsWith('/uploads/')) {
        const filePath = path.join(__dirname, imageUrl)
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
      }
      
      await cloudDB.deleteDocument(CONFIG.collections.LIVE_IMAGE, target._id)
      return success(res, null, '图片删除成功')
    } catch (err) {
      console.error('[图文直播] 云模式删除失败:', err.message)
      return error(res, 500, '删除图片失败: ' + err.message)
    }
  }

  // 本地模式
  const id = parseInt(paramId)
  const index = liveImageList.findIndex(img => img.id === id)

  if (index === -1) {
    return error(res, 404, '图片不存在')
  }

  // 删除关联的物理文件
  const imageUrl = liveImageList[index].url || liveImageList[index].imageUrl
  if (imageUrl && imageUrl.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, imageUrl)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  }

  liveImageList.splice(index, 1)
  success(res, null, '图片删除成功')
})

// ==================== 启动服务器 ====================

// 测试微信API连接
if (CONFIG.mode === 'cloud') {
  getAccessToken()
    .then(() => console.log('[微信API] 连接测试成功'))
    .catch(err => console.error('[微信API] 连接测试失败:', err.message))
}

app.listen(PORT, () => {
  console.log('='.repeat(50))
  console.log('  管理后台本地开发服务器已启动')
  console.log(`  地址: http://localhost:${PORT}`)
  console.log(`  API 前缀: /api/admin/`)
  console.log(`  默认账号: admin / admin123`)
  console.log(`  运行模式: ${CONFIG.mode}`)
  if (CONFIG.mode === 'cloud') {
    console.log(`  云开发环境: ${CONFIG.envId}`)
    console.log(`  小程序AppID: ${CONFIG.appId}`)
  }
  console.log('='.repeat(50))
})