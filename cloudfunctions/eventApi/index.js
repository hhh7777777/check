// ============================================================
// 内部活动参会服务 - 微信云函数
// 功能：处理小程序端和管理后台的所有API请求
// ============================================================

const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

// ===================== 数据库集合名常量 =====================
const COLLECTIONS = {
  ACTIVITY: 'activity',        // 活动信息
  SCHEDULE: 'schedule',        // 会议日程
  ATTENDEE: 'attendee',        // 参会人员
  LIVE_IMAGE: 'live_image',    // 图文直播
  CHECKIN_LOG: 'checkin_log',  // 签到日志
  ADMIN: 'admin'               // 管理员
}

// ===================== JWT 配置 =====================
const JWT_SECRET = 'event_miniapp_cloud_2026'
const TOKEN_EXPIRE = 86400000 // 24小时（毫秒）

// ===================== CORS 响应头 =====================
const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization'
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 获取当前活动的 activity_id
 * 查找 is_current === 1 的活动记录
 * @returns {string|null} 当前活动的 _id，没有则返回 null
 */
async function getCurrentActivityId() {
  try {
    const res = await db.collection(COLLECTIONS.ACTIVITY)
      .where({ is_current: 1 })
      .limit(1)
      .get()
    if (res.data && res.data.length > 0) {
      return res.data[0]._id
    }
    // 向后兼容：如果没有 is_current 字段的活动，取第一条
    const fallback = await db.collection(COLLECTIONS.ACTIVITY).limit(1).get()
    if (fallback.data && fallback.data.length > 0) {
      return fallback.data[0]._id
    }
    return null
  } catch (err) {
    console.error('获取当前活动失败:', err)
    return null
  }
}

/**
 * 将 snake_case 字段转为 camelCase（适配小程序页面）
 */
function toCamelCase(obj) {
  if (!obj || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(toCamelCase)

  const result = {}
  const mapping = {
    seat_no: 'seatNo',
    table_no: 'tableNo',
    hotel_name: 'hotelName',
    room_no: 'roomNo',
    identity_type: 'identityType',
    attendee_code: 'attendeeCode',
    checkin_status: 'checkinStatus',
    checkin_time: 'checkinTime',
    dining_place: 'diningPlace',
    created_at: 'createdAt',
    updated_at: 'updatedAt',
    activity_id: 'activityId',
    is_current: 'isCurrent'
  }

  for (const [key, value] of Object.entries(obj)) {
    const camelKey = mapping[key] || key
    result[camelKey] = value
  }

  // 额外添加 checkedIn 便捷字段
  if (result.checkinStatus === 1 || result.checkin_status === 1) {
    result.checkedIn = true
  }

  return result
}

/**
 * 统一成功响应
 * @param {*} data - 返回数据
 * @param {string} message - 提示信息
 * @returns {{ code: number, message: string, data: * }}
 */
function success(data = null, message = 'success') {
  return { code: 200, message, data }
}

/**
 * 统一失败响应
 * @param {number} code - 错误码
 * @param {string} message - 错误信息
 * @param {*} data - 附加数据
 * @returns {{ code: number, message: string, data: * }}
 */
function fail(code, message, data = null) {
  return { code, message, data }
}

/**
 * 构建 HTTP 响应体
 * @param {number} statusCode - HTTP 状态码
 * @param {object} body - 响应体对象
 * @returns {object} 标准 HTTP 响应
 */
function httpResponse(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body)
  }
}

/**
 * 使用 SHA256 对密码进行哈希
 * @param {string} password - 明文密码
 * @returns {string} 哈希后的十六进制字符串
 */
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex')
}

/**
 * 生成 JWT Token（使用 HMAC-SHA256 签名）
 * @param {object} payload - 载荷数据
 * @returns {string} JWT token
 */
function generateToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_EXPIRE })).toString('base64url')
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

/**
 * 验证并解析 JWT Token
 * @param {string} token - JWT token 字符串
 * @returns {object|null} 解析后的载荷，验证失败返回 null
 */
function verifyToken(token) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [header, body, signature] = parts
    const expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url')

    // 验证签名
    if (signature !== expectedSignature) return null

    // 解析载荷
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())

    // 验证过期时间
    if (payload.exp < Date.now()) return null

    return payload
  } catch (err) {
    return null
  }
}

/**
 * 生成参会码：A + YYYYMMDD + 四位序号
 * @param {number} sequence - 序号
 * @returns {string} 参会码
 */
function generateAttendeeCode(sequence) {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const dateStr = `${year}${month}${day}`
  const seq = String(sequence).padStart(4, '0')
  return `A${dateStr}${seq}`
}

/**
 * 从 HTTP Authorization 头提取并验证 token
 * @param {object} event - 云函数 event 对象
 * @returns {object|null} 解析后的用户信息，无效返回 null
 */
function authenticateRequest(event) {
  const headers = event.headers || {}
  const authHeader = headers.authorization || headers.Authorization || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return null
  return verifyToken(token)
}

/**
 * 隐藏手机号，只显示后四位
 * @param {string} phone - 手机号
 * @returns {string} 处理后的手机号
 */
function maskPhone(phone) {
  if (!phone || phone.length < 4) return phone || ''
  return phone.slice(-4)
}

// ============================================================
// 小程序端接口处理函数
// ============================================================

/**
 * 1. 获取当前活动信息
 * 返回 is_current === 1 的活动记录
 */
async function handleGetActivity() {
  try {
    // 优先查询 is_current === 1 的活动
    const res = await db.collection(COLLECTIONS.ACTIVITY)
      .where({ is_current: 1 })
      .limit(1)
      .get()
    if (res.data && res.data.length > 0) {
      return success(toCamelCase(res.data[0]))
    }
    // 向后兼容：如果没有 is_current 字段，返回第一条
    const fallback = await db.collection(COLLECTIONS.ACTIVITY).limit(1).get()
    if (fallback.data && fallback.data.length > 0) {
      return success(toCamelCase(fallback.data[0]))
    }
    return success(null, '暂无活动信息')
  } catch (err) {
    console.error('获取活动信息失败:', err)
    return fail(500, '获取活动信息失败')
  }
}

/**
 * 2. 获取会议日程列表（当前活动）
 * 按 schedule_date 升序, sort_order 升序排序
 */
async function handleGetSchedules() {
  try {
    const activityId = await getCurrentActivityId()

    // 构建查询条件
    const whereCondition = activityId ? { activity_id: activityId } : {}

    // 云数据库单次查询限制100条，需要分批获取
    const countRes = await db.collection(COLLECTIONS.SCHEDULE)
      .where(whereCondition)
      .count()
    const total = countRes.total
    const batchSize = 100
    const batchTimes = Math.ceil(total / batchSize)
    const tasks = []

    for (let i = 0; i < batchTimes; i++) {
      const promise = db.collection(COLLECTIONS.SCHEDULE)
        .where(whereCondition)
        .orderBy('schedule_date', 'asc')
        .orderBy('sort_order', 'asc')
        .skip(i * batchSize)
        .limit(batchSize)
        .get()
      tasks.push(promise)
    }

    const results = await Promise.all(tasks)
    let list = []
    results.forEach(res => {
      list = list.concat(res.data)
    })

    // 向后兼容：如果没有 activity_id 字段，也包含在结果中
    if (activityId) {
      const fallbackList = []
      const fbCountRes = await db.collection(COLLECTIONS.SCHEDULE)
        .where({ activity_id: _.exists(false) })
        .count()
      if (fbCountRes.total > 0) {
        const fbBatchTimes = Math.ceil(fbCountRes.total / batchSize)
        const fbTasks = []
        for (let i = 0; i < fbBatchTimes; i++) {
          const promise = db.collection(COLLECTIONS.SCHEDULE)
            .where({ activity_id: _.exists(false) })
            .orderBy('schedule_date', 'asc')
            .orderBy('sort_order', 'asc')
            .skip(i * batchSize)
            .limit(batchSize)
            .get()
          fbTasks.push(promise)
        }
        const fbResults = await Promise.all(fbTasks)
        fbResults.forEach(res => {
          fallbackList.concat(res.data)
        })
        list = list.concat(fallbackList)
      }
    }

    return success(list)
  } catch (err) {
    console.error('获取日程列表失败:', err)
    return fail(500, '获取日程列表失败')
  }
}

/**
 * 3. 查询参会人（当前活动）
 * 支持两种查询方式：
 *   a) 通过手机号查询（入口页调用）
 *   b) 通过姓名和手机号后四位查询（参会证页调用）
 * @param {object} event - 查询参数
 *   - phone: 手机号（方式a）
 *   - name: 姓名 + phoneLast4: 手机号后四位（方式b）
 */
async function handleQueryAttendee(event) {
  try {
    const { phone, name, phoneLast4 } = event
    const activityId = await getCurrentActivityId()

    // 方式a: 通过手机号查询
    if (phone) {
      if (phone.length < 6) {
        return fail(400, '手机号格式不正确')
      }

      // 标准化手机号：去除空格、横线等
      const normalizedPhone = phone.replace(/[\s\-]/g, '')

      // 构建查询条件：activity_id + phone
      const buildWhere = (phoneCondition) => {
        const where = { ...phoneCondition }
        if (activityId) {
          where.activity_id = activityId
        }
        return where
      }

      // 先精确匹配
      let res = await db.collection(COLLECTIONS.ATTENDEE)
        .where(buildWhere({ phone: normalizedPhone }))
        .get()

      // 如果精确匹配失败，尝试模糊匹配（处理带/不带国家区号的情况）
      if (!res.data || res.data.length === 0) {
        // 使用正则进行模糊匹配
        res = await db.collection(COLLECTIONS.ATTENDEE)
          .where(buildWhere({
            phone: db.RegExp({
              regexp: normalizedPhone,
              options: 'i'
            })
          }))
          .get()
      }

      if (res.data && res.data.length > 0) {
        const attendee = res.data[0]
        
        // 自动签到：首次查询即签到
        if (attendee.checkin_status !== 1) {
          const checkinTime = new Date()
          await db.collection(COLLECTIONS.ATTENDEE).doc(attendee._id).update({
            data: { checkin_status: 1, checkin_time: checkinTime }
          })
          // 写入签到日志
          await db.collection(COLLECTIONS.CHECKIN_LOG).add({
            data: {
              attendee_id: attendee._id,
              attendee_code: attendee.attendee_code,
              name: attendee.name,
              organization: attendee.organization,
              identity_type: attendee.identity_type,
              operator_name: '自助签到',
              checkin_time: checkinTime,
              method: 'auto',
              activity_id: activityId || '',
              created_at: new Date()
            }
          })
          attendee.checkin_status = 1
          attendee.checkin_time = checkinTime
        }

        return success({
          ...toCamelCase(attendee),
          phone: maskPhone(attendee.phone)
        })
      }

      return success(null, '未找到参会人')
    }

    // 方式b: 通过姓名和手机号后四位查询
    if (name && phoneLast4) {
      // 构建查询条件
      const whereCondition = { name }
      if (activityId) {
        whereCondition.activity_id = activityId
      }

      // 先按姓名查询，再在结果中过滤手机号后四位
      const res = await db.collection(COLLECTIONS.ATTENDEE)
        .where(whereCondition)
        .get()

      if (res.data && res.data.length > 0) {
        // 在返回结果中匹配手机号后四位
        const matched = res.data.find(item => {
          return item.phone && item.phone.endsWith(phoneLast4)
        })

        if (matched) {
          // 手机号只返回后四位
          return success({
            ...toCamelCase(matched),
            phone: maskPhone(matched.phone)
          })
        }
      }

      return success(null, '未找到参会人')
    }

    return fail(400, '请提供手机号或姓名和手机号后四位')
  } catch (err) {
    console.error('查询参会人失败:', err)
    return fail(500, '查询参会人失败')
  }
}

/**
 * 4. 通过参会码查询参会人（当前活动）
 * @param {string} attendeeCode - 参会码
 */
async function handleGetAttendeeByCode(attendeeCode) {
  try {
    if (!attendeeCode) {
      return fail(400, '参会码不能为空')
    }

    const activityId = await getCurrentActivityId()
    const whereCondition = { attendee_code: attendeeCode }
    if (activityId) {
      whereCondition.activity_id = activityId
    }

    const res = await db.collection(COLLECTIONS.ATTENDEE)
      .where(whereCondition)
      .get()

    if (res.data && res.data.length > 0) {
      return success(toCamelCase(res.data[0]))
    }

    return success(null, '未找到参会人')
  } catch (err) {
    console.error('通过参会码查询失败:', err)
    return fail(500, '查询参会人失败')
  }
}

/**
 * 5. 扫码签到（当前活动）
 * @param {string} attendeeCode - 参会码
 * @param {string} operatorName - 操作人姓名
 */
async function handleCheckin(attendeeCode, operatorName) {
  try {
    if (!attendeeCode) {
      return fail(400, '参会码不能为空')
    }

    const activityId = await getCurrentActivityId()

    // 构建查询条件
    const whereCondition = { attendee_code: attendeeCode }
    if (activityId) {
      whereCondition.activity_id = activityId
    }

    // 查询参会人
    const attendeeRes = await db.collection(COLLECTIONS.ATTENDEE)
      .where(whereCondition)
      .get()

    if (!attendeeRes.data || attendeeRes.data.length === 0) {
      return fail(404, '参会码不存在')
    }

    const attendee = attendeeRes.data[0]

    // 检查是否已签到
    if (attendee.checkin_status === 1) {
      return {
        success: false,
        code: 409,
        message: '该参会人已签到',
        data: {
          name: attendee.name,
          organization: attendee.organization,
          identityType: attendee.identity_type,
          checkinTime: attendee.checkin_time,
          alreadyCheckedIn: true
        }
      }
    }

    // 执行签到：更新参会人状态
    const checkinTime = new Date()
    await db.collection(COLLECTIONS.ATTENDEE).doc(attendee._id).update({
      data: {
        checkin_status: 1,
        checkin_time: checkinTime
      }
    })

    // 写入签到日志
    await db.collection(COLLECTIONS.CHECKIN_LOG).add({
      data: {
        attendee_id: attendee._id,
        attendee_code: attendeeCode,
        name: attendee.name,
        organization: attendee.organization,
        identity_type: attendee.identity_type,
        operator_name: operatorName || '系统',
        checkin_time: checkinTime,
        method: 'scan',
        activity_id: activityId || '',
        created_at: new Date()
      }
    })

    return {
      success: true,
      code: 200,
      message: '签到成功',
      data: {
        name: attendee.name,
        organization: attendee.organization,
        identityType: attendee.identity_type,
        checkinTime: checkinTime,
        alreadyCheckedIn: false
      }
    }
  } catch (err) {
    console.error('签到失败:', err)
    return fail(500, '签到失败')
  }
}

/**
 * 6. 获取图文直播图片
 * 查询 live_image 集合中 is_visible == 1 的记录，按 sort_order 升序排序
 */
async function handleLoginWithPhone(event) {
  try {
    const { code } = event
    if (!code) {
      return fail(400, '缺少手机号授权code')
    }
    
    // 使用 code 换取手机号
    const cloud = require('wx-server-sdk')
    const result = await cloud.getPhoneNumber({
      code: code
    })
    
    if (result && result.phoneInfo && result.phoneInfo.phoneNumber) {
      return success({ phone: result.phoneInfo.phoneNumber })
    }
    
    return fail(400, '获取手机号失败')
  } catch (err) {
    console.error('手机号授权失败:', err)
    return fail(500, '手机号授权失败: ' + err.message)
  }
}

/**
 * 7. 获取图文直播图片（当前活动）
 * 查询 live_image 集合中 is_visible == 1 的记录，按 sort_order 升序排序
 */
async function handleGetLiveImages() {
  try {
    const activityId = await getCurrentActivityId()

    const whereCondition = { is_visible: 1 }
    if (activityId) {
      whereCondition.activity_id = activityId
    }

    const countRes = await db.collection(COLLECTIONS.LIVE_IMAGE)
      .where(whereCondition)
      .count()
    const total = countRes.total
    const batchSize = 100
    const batchTimes = Math.ceil(total / batchSize)
    const tasks = []

    for (let i = 0; i < batchTimes; i++) {
      const promise = db.collection(COLLECTIONS.LIVE_IMAGE)
        .where(whereCondition)
        .orderBy('sort_order', 'asc')
        .skip(i * batchSize)
        .limit(batchSize)
        .get()
      tasks.push(promise)
    }

    const results = await Promise.all(tasks)
    let list = []
    results.forEach(res => {
      list = list.concat(res.data)
    })

    return success(list)
  } catch (err) {
    console.error('获取图文直播图片失败:', err)
    return fail(500, '获取图文直播图片失败')
  }
}

// ============================================================
// 管理后台接口处理函数
// ============================================================

/**
 * 7. 管理员登录
 * 验证用户名密码，返回 JWT token
 */
async function handleAdminLogin(event) {
  try {
    const body = parseBody(event)
    const { username, password } = body

    if (!username || !password) {
      return httpResponse(400, fail(400, '用户名和密码不能为空'))
    }

    // 查询管理员
    const res = await db.collection(COLLECTIONS.ADMIN)
      .where({ username })
      .get()

    if (!res.data || res.data.length === 0) {
      return httpResponse(401, fail(401, '用户名或密码错误'))
    }

    const admin = res.data[0]
    const inputHash = hashPassword(password)

    // 比较密码哈希
    if (admin.password !== inputHash) {
      return httpResponse(401, fail(401, '用户名或密码错误'))
    }

    // 生成 JWT token
    const token = generateToken({
      adminId: admin._id,
      username: admin.username,
      role: admin.role || 'admin'
    })

    return httpResponse(200, success({
      token,
      username: admin.username,
      role: admin.role || 'admin'
    }, '登录成功'))
  } catch (err) {
    console.error('管理员登录失败:', err)
    return httpResponse(500, fail(500, '登录失败'))
  }
}

/**
 * 8. 数据概览（当前活动）
 * 返回参会人数、签到数、未签到数、签到率
 */
async function handleDashboard() {
  try {
    const activityId = await getCurrentActivityId()

    // 构建查询条件
    const whereCondition = activityId ? { activity_id: activityId } : {}

    // 查询参会人总数
    const totalRes = await db.collection(COLLECTIONS.ATTENDEE)
      .where(whereCondition)
      .count()
    const totalAttendees = totalRes.total

    // 查询已签到人数
    const checkedInWhere = { ...whereCondition, checkin_status: 1 }
    const checkedInRes = await db.collection(COLLECTIONS.ATTENDEE)
      .where(checkedInWhere)
      .count()
    const checkedIn = checkedInRes.total

    // 未签到人数
    const notCheckedIn = totalAttendees - checkedIn

    // 签到率（百分比，保留两位小数）
    const checkinRate = totalAttendees > 0
      ? Math.round((checkedIn / totalAttendees) * 10000) / 100
      : 0

    return httpResponse(200, success({
      totalAttendees,
      checkedIn,
      notCheckedIn,
      checkinRate,
      currentActivityId: activityId
    }))
  } catch (err) {
    console.error('获取数据概览失败:', err)
    return httpResponse(500, fail(500, '获取数据概览失败'))
  }
}

/**
 * 9a. 获取活动信息（管理后台）- 返回当前活动及 currentActivityId
 */
async function handleAdminGetActivity() {
  try {
    // 查询当前活动
    const currentRes = await db.collection(COLLECTIONS.ACTIVITY)
      .where({ is_current: 1 })
      .limit(1)
      .get()

    let currentActivity = null
    if (currentRes.data && currentRes.data.length > 0) {
      currentActivity = currentRes.data[0]
    } else {
      // 向后兼容：取第一条
      const fallback = await db.collection(COLLECTIONS.ACTIVITY).limit(1).get()
      if (fallback.data && fallback.data.length > 0) {
        currentActivity = fallback.data[0]
      }
    }

    if (currentActivity) {
      return httpResponse(200, success({
        ...currentActivity,
        currentActivityId: currentActivity._id
      }))
    }
    return httpResponse(200, success(null, '暂无活动信息'))
  } catch (err) {
    console.error('获取活动信息失败:', err)
    return httpResponse(500, fail(500, '获取活动信息失败'))
  }
}

/**
 * 9b. 更新活动信息（管理后台）
 */
async function handleAdminUpdateActivity(event) {
  try {
    const body = parseBody(event)

    // 查询第一条记录
    const res = await db.collection(COLLECTIONS.ACTIVITY).limit(1).get()

    if (res.data && res.data.length > 0) {
      // 更新已有记录
      await db.collection(COLLECTIONS.ACTIVITY).doc(res.data[0]._id).update({
        data: {
          ...body,
          updated_at: new Date()
        }
      })
      return httpResponse(200, success(null, '活动信息更新成功'))
    } else {
      // 创建新记录
      await db.collection(COLLECTIONS.ACTIVITY).add({
        data: {
          ...body,
          is_current: body.is_current !== undefined ? body.is_current : 1,
          created_at: new Date(),
          updated_at: new Date()
        }
      })
      return httpResponse(200, success(null, '活动信息创建成功'))
    }
  } catch (err) {
    console.error('更新活动信息失败:', err)
    return httpResponse(500, fail(500, '更新活动信息失败'))
  }
}

/**
 * 9c. 获取所有活动列表（管理后台 - 活动选择器用）
 */
async function handleAdminListActivities() {
  try {
    const countRes = await db.collection(COLLECTIONS.ACTIVITY).count()
    const total = countRes.total
    const batchSize = 100
    const batchTimes = Math.ceil(total / batchSize)
    const tasks = []

    for (let i = 0; i < batchTimes; i++) {
      const promise = db.collection(COLLECTIONS.ACTIVITY)
        .orderBy('created_at', 'desc')
        .skip(i * batchSize)
        .limit(batchSize)
        .get()
      tasks.push(promise)
    }

    const results = await Promise.all(tasks)
    let list = []
    results.forEach(res => {
      list = list.concat(res.data)
    })

    // 为每个活动统计参会人数和签到率
    const enrichedList = []
    for (const activity of list) {
      const totalAttendees = await db.collection(COLLECTIONS.ATTENDEE)
        .where({ activity_id: activity._id })
        .count()
      const checkedIn = await db.collection(COLLECTIONS.ATTENDEE)
        .where({ activity_id: activity._id, checkin_status: 1 })
        .count()

      // 向后兼容：也统计没有 activity_id 的记录（仅对当前活动）
      let fallbackTotal = 0
      let fallbackCheckedIn = 0
      if (activity.is_current === 1) {
        fallbackTotal = await db.collection(COLLECTIONS.ATTENDEE)
          .where({ activity_id: _.exists(false) })
          .count()
        fallbackCheckedIn = await db.collection(COLLECTIONS.ATTENDEE)
          .where({ activity_id: _.exists(false), checkin_status: 1 })
          .count()
      }

      const finalTotal = totalAttendees.total + fallbackTotal
      const finalCheckedIn = checkedIn.total + fallbackCheckedIn
      const checkinRate = finalTotal > 0
        ? Math.round((finalCheckedIn / finalTotal) * 10000) / 100
        : 0

      enrichedList.push({
        ...activity,
        totalAttendees: finalTotal,
        checkedIn: finalCheckedIn,
        checkinRate
      })
    }

    return httpResponse(200, success(enrichedList))
  } catch (err) {
    console.error('获取活动列表失败:', err)
    return httpResponse(500, fail(500, '获取活动列表失败'))
  }
}

/**
 * 9d. 创建新活动（管理后台）
 */
async function handleAdminCreateActivity(event) {
  try {
    const body = parseBody(event)
    const now = new Date()

    // 生成默认标题
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const defaultTitle = body.title || `新活动 ${year}-${month}-${day}`

    const activityData = {
      title: defaultTitle,
      description: body.description || '',
      location: body.location || '',
      organizer: body.organizer || '',
      start_time: body.start_time || '',
      end_time: body.end_time || '',
      is_current: 0,
      created_at: now,
      updated_at: now
    }

    const result = await db.collection(COLLECTIONS.ACTIVITY).add({
      data: activityData
    })

    return httpResponse(200, success({ _id: result._id }, '活动创建成功'))
  } catch (err) {
    console.error('创建活动失败:', err)
    return httpResponse(500, fail(500, '创建活动失败'))
  }
}

/**
 * 9e. 更新指定活动（管理后台）
 */
async function handleAdminUpdateActivityById(event, activityId) {
  try {
    if (!activityId) {
      return httpResponse(400, fail(400, '活动ID不能为空'))
    }

    const body = parseBody(event)
    delete body._id
    delete body.is_current // 不允许通过此接口修改 is_current

    await db.collection(COLLECTIONS.ACTIVITY).doc(activityId).update({
      data: {
        ...body,
        updated_at: new Date()
      }
    })

    return httpResponse(200, success(null, '活动更新成功'))
  } catch (err) {
    console.error('更新活动失败:', err)
    return httpResponse(500, fail(500, '更新活动失败'))
  }
}

/**
 * 9f. 删除指定活动（管理后台）
 */
async function handleAdminDeleteActivity(activityId) {
  try {
    if (!activityId) {
      return httpResponse(400, fail(400, '活动ID不能为空'))
    }

    // 不允许删除当前活动
    const activity = await db.collection(COLLECTIONS.ACTIVITY).doc(activityId).get()
    if (activity.data && activity.data.is_current === 1) {
      return httpResponse(400, fail(400, '不能删除当前活动，请先切换到其他活动'))
    }

    await db.collection(COLLECTIONS.ACTIVITY).doc(activityId).remove()

    return httpResponse(200, success(null, '活动删除成功'))
  } catch (err) {
    console.error('删除活动失败:', err)
    return httpResponse(500, fail(500, '删除活动失败'))
  }
}

/**
 * 9g. 设为当前活动（管理后台）
 * 原子性设置一个活动为当前活动，其他全部置为非当前
 */
async function handleAdminActivateActivity(activityId) {
  try {
    if (!activityId) {
      return httpResponse(400, fail(400, '活动ID不能为空'))
    }

    // 查询所有活动
    const countRes = await db.collection(COLLECTIONS.ACTIVITY).count()
    const total = countRes.total
    const batchSize = 100
    const batchTimes = Math.ceil(total / batchSize)
    const tasks = []

    for (let i = 0; i < batchTimes; i++) {
      const promise = db.collection(COLLECTIONS.ACTIVITY)
        .skip(i * batchSize)
        .limit(batchSize)
        .get()
      tasks.push(promise)
    }

    const results = await Promise.all(tasks)
    let allActivities = []
    results.forEach(res => {
      allActivities = allActivities.concat(res.data)
    })

    // 将所有活动的 is_current 设为 0
    for (const act of allActivities) {
      if (act.is_current === 1) {
        await db.collection(COLLECTIONS.ACTIVITY).doc(act._id).update({
          data: { is_current: 0, updated_at: new Date() }
        })
      }
    }

    // 将目标活动的 is_current 设为 1
    await db.collection(COLLECTIONS.ACTIVITY).doc(activityId).update({
      data: { is_current: 1, updated_at: new Date() }
    })

    return httpResponse(200, success(null, '活动已切换为当前活动'))
  } catch (err) {
    console.error('切换活动失败:', err)
    return httpResponse(500, fail(500, '切换活动失败'))
  }
}

/**
 * 10a. 获取日程列表（管理后台，当前活动）
 */
async function handleAdminGetSchedules() {
  try {
    const activityId = await getCurrentActivityId()
    const whereCondition = activityId ? { activity_id: activityId } : {}

    const countRes = await db.collection(COLLECTIONS.SCHEDULE)
      .where(whereCondition)
      .count()
    const total = countRes.total
    const batchSize = 100
    const batchTimes = Math.ceil(total / batchSize)
    const tasks = []

    for (let i = 0; i < batchTimes; i++) {
      const promise = db.collection(COLLECTIONS.SCHEDULE)
        .where(whereCondition)
        .orderBy('schedule_date', 'asc')
        .orderBy('sort_order', 'asc')
        .skip(i * batchSize)
        .limit(batchSize)
        .get()
      tasks.push(promise)
    }

    const results = await Promise.all(tasks)
    let list = []
    results.forEach(res => {
      list = list.concat(res.data)
    })

    // 向后兼容：包含没有 activity_id 的日程
    if (activityId) {
      const fbCountRes = await db.collection(COLLECTIONS.SCHEDULE)
        .where({ activity_id: _.exists(false) })
        .count()
      if (fbCountRes.total > 0) {
        const fbBatchTimes = Math.ceil(fbCountRes.total / batchSize)
        const fbTasks = []
        for (let i = 0; i < fbBatchTimes; i++) {
          const promise = db.collection(COLLECTIONS.SCHEDULE)
            .where({ activity_id: _.exists(false) })
            .orderBy('schedule_date', 'asc')
            .orderBy('sort_order', 'asc')
            .skip(i * batchSize)
            .limit(batchSize)
            .get()
          fbTasks.push(promise)
        }
        const fbResults = await Promise.all(fbTasks)
        fbResults.forEach(res => {
          list = list.concat(res.data)
        })
      }
    }

    return httpResponse(200, success(list))
  } catch (err) {
    console.error('获取日程列表失败:', err)
    return httpResponse(500, fail(500, '获取日程列表失败'))
  }
}

/**
 * 10b. 新增日程（管理后台，当前活动）
 */
async function handleAdminCreateSchedule(event) {
  try {
    const body = parseBody(event)

    if (!body.title || !body.schedule_date) {
      return httpResponse(400, fail(400, '日程标题和日期不能为空'))
    }

    const activityId = await getCurrentActivityId()

    const result = await db.collection(COLLECTIONS.SCHEDULE).add({
      data: {
        activity_id: activityId || '',
        title: body.title,
        description: body.description || '',
        schedule_date: body.schedule_date,
        start_time: body.start_time || '',
        end_time: body.end_time || '',
        location: body.location || '',
        speaker: body.speaker || '',
        sort_order: body.sort_order || 0,
        created_at: new Date(),
        updated_at: new Date()
      }
    })

    return httpResponse(200, success({ _id: result._id }, '日程创建成功'))
  } catch (err) {
    console.error('新增日程失败:', err)
    return httpResponse(500, fail(500, '新增日程失败'))
  }
}

/**
 * 11a. 更新日程（管理后台）
 */
async function handleAdminUpdateSchedule(event, scheduleId) {
  try {
    if (!scheduleId) {
      return httpResponse(400, fail(400, '日程ID不能为空'))
    }

    const body = parseBody(event)

    await db.collection(COLLECTIONS.SCHEDULE).doc(scheduleId).update({
      data: {
        ...body,
        updated_at: new Date()
      }
    })

    return httpResponse(200, success(null, '日程更新成功'))
  } catch (err) {
    console.error('更新日程失败:', err)
    return httpResponse(500, fail(500, '更新日程失败'))
  }
}

/**
 * 11b. 删除日程（管理后台）
 */
async function handleAdminDeleteSchedule(scheduleId) {
  try {
    if (!scheduleId) {
      return httpResponse(400, fail(400, '日程ID不能为空'))
    }

    await db.collection(COLLECTIONS.SCHEDULE).doc(scheduleId).remove()

    return httpResponse(200, success(null, '日程删除成功'))
  } catch (err) {
    console.error('删除日程失败:', err)
    return httpResponse(500, fail(500, '删除日程失败'))
  }
}

/**
 * 12. Excel导入参会人员（管理后台，当前活动）
 * 接收 JSON 数组数据（前端解析Excel后传JSON）
 * 自动生成参会码
 */
async function handleAdminImportAttendees(event) {
  try {
    const body = parseBody(event)
    const attendees = body.attendees || body

    if (!Array.isArray(attendees) || attendees.length === 0) {
      return httpResponse(400, fail(400, '导入数据不能为空'))
    }

    const activityId = await getCurrentActivityId()

    // 获取今天已有的参会码数量，用于生成序号
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const dateStr = `${year}${month}${day}`
    const codePrefix = `A${dateStr}`

    // 查询今天已有的参会码数量
    const existCountRes = await db.collection(COLLECTIONS.ATTENDEE)
      .where({
        attendee_code: db.RegExp({
          regexp: `^${codePrefix}`,
          options: 'i'
        })
      })
      .count()
    let sequence = existCountRes.total + 1

    const results = {
      success: 0,      // 导入成功数
      failed: 0,       // 导入失败数
      errors: []       // 错误详情
    }

    // 逐条导入
    for (let i = 0; i < attendees.length; i++) {
      const item = attendees[i]

      // 校验必填字段
      if (!item.name || !item.phone) {
        results.failed++
        results.errors.push({
          row: i + 1,
          message: '姓名或手机号为空',
          data: item
        })
        continue
      }

      try {
        // 生成参会码
        const attendeeCode = generateAttendeeCode(sequence)
        sequence++

        // 写入数据库
        await db.collection(COLLECTIONS.ATTENDEE).add({
          data: {
            activity_id: activityId || '',
            name: item.name,
            phone: item.phone,
            organization: item.organization || '',
            position: item.position || '',
            identity_type: item.identity_type || '普通参会',
            seat_no: item.seat_no || '',
            table_no: item.table_no || '',
            hotel_name: item.hotel_name || '',
            room_no: item.room_no || '',
            dining_place: item.dining_place || '',
            attendee_code: attendeeCode,
            checkin_status: 0,
            checkin_time: null,
            remark: item.remark || '',
            created_at: new Date(),
            updated_at: new Date()
          }
        })

        results.success++
      } catch (itemErr) {
        results.failed++
        results.errors.push({
          row: i + 1,
          message: itemErr.message || '写入失败',
          data: item
        })
      }
    }

    return httpResponse(200, success(results, `导入完成：成功${results.success}条，失败${results.failed}条`))
  } catch (err) {
    console.error('导入参会人员失败:', err)
    return httpResponse(500, fail(500, '导入参会人员失败'))
  }
}

/**
 * 13. 分页查询参会人员（管理后台，当前活动）
 * 支持关键词搜索和签到状态筛选
 */
async function handleAdminGetAttendees(event) {
  try {
    const query = event.queryStringParameters || {}
    const page = parseInt(query.page) || 1
    const pageSize = parseInt(query.pageSize) || 20
    const keyword = query.keyword || ''
    const checkinStatus = query.checkinStatus

    const activityId = await getCurrentActivityId()

    // 构建查询条件
    const whereCondition = activityId ? { activity_id: activityId } : {}

    // 签到状态筛选
    if (checkinStatus !== undefined && checkinStatus !== '' && checkinStatus !== null) {
      whereCondition.checkin_status = parseInt(checkinStatus)
    }

    // 关键词搜索（姓名或手机号）
    if (keyword) {
      whereCondition.or = [
        {
          name: db.RegExp({
            regexp: keyword,
            options: 'i'
          })
        },
        {
          phone: db.RegExp({
            regexp: keyword,
            options: 'i'
          })
        }
      ]
    }

    // 查询总数（当前活动 + 向后兼容无 activity_id 的记录）
    const countRes = await db.collection(COLLECTIONS.ATTENDEE)
      .where(whereCondition)
      .count()
    let total = countRes.total

    // 向后兼容
    if (activityId) {
      const fbCondition = { ...whereCondition, activity_id: _.exists(false) }
      const fbCountRes = await db.collection(COLLECTIONS.ATTENDEE)
        .where(fbCondition)
        .count()
      total += fbCountRes.total
    }

    // 查询列表数据（当前活动）
    const listRes = await db.collection(COLLECTIONS.ATTENDEE)
      .where(whereCondition)
      .orderBy('created_at', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()

    let list = listRes.data

    // 向后兼容：如果当前活动数据不足，补充无 activity_id 的记录
    if (activityId && list.length < pageSize) {
      const remaining = pageSize - list.length
      const fbCondition = { activity_id: _.exists(false) }
      if (checkinStatus !== undefined && checkinStatus !== '' && checkinStatus !== null) {
        fbCondition.checkin_status = parseInt(checkinStatus)
      }
      if (keyword) {
        fbCondition.or = [
          {
            name: db.RegExp({
              regexp: keyword,
              options: 'i'
            })
          },
          {
            phone: db.RegExp({
              regexp: keyword,
              options: 'i'
            })
          }
        ]
      }
      const fbListRes = await db.collection(COLLECTIONS.ATTENDEE)
        .where(fbCondition)
        .orderBy('created_at', 'desc')
        .skip((page - 1) * pageSize)
        .limit(remaining)
        .get()
      list = list.concat(fbListRes.data)
    }

    return httpResponse(200, success({
      list,
      total,
      page,
      pageSize
    }))
  } catch (err) {
    console.error('查询参会人员失败:', err)
    return httpResponse(500, fail(500, '查询参会人员失败'))
  }
}

/**
 * 14a. 编辑参会人员（管理后台）
 */
async function handleAdminUpdateAttendee(event, attendeeId) {
  try {
    if (!attendeeId) {
      return httpResponse(400, fail(400, '参会人ID不能为空'))
    }

    const body = parseBody(event)

    // 不允许直接修改签到状态和参会码
    delete body._id
    delete body.attendee_code
    delete body.checkin_status
    delete body.checkin_time

    await db.collection(COLLECTIONS.ATTENDEE).doc(attendeeId).update({
      data: {
        ...body,
        updated_at: new Date()
      }
    })

    return httpResponse(200, success(null, '参会人信息更新成功'))
  } catch (err) {
    console.error('编辑参会人员失败:', err)
    return httpResponse(500, fail(500, '编辑参会人员失败'))
  }
}

/**
 * 14b. 删除参会人员（管理后台）
 */
async function handleAdminDeleteAttendee(attendeeId) {
  try {
    if (!attendeeId) {
      return httpResponse(400, fail(400, '参会人ID不能为空'))
    }

    await db.collection(COLLECTIONS.ATTENDEE).doc(attendeeId).remove()

    return httpResponse(200, success(null, '参会人删除成功'))
  } catch (err) {
    console.error('删除参会人员失败:', err)
    return httpResponse(500, fail(500, '删除参会人员失败'))
  }
}

/**
 * 15. 导出参会人员（管理后台，当前活动）
 * 返回参会人员列表数据，前端生成Excel
 */
async function handleAdminExportAttendees(event) {
  try {
    const query = event.queryStringParameters || {}
    const checkinStatus = query.checkinStatus

    const activityId = await getCurrentActivityId()
    const whereCondition = activityId ? { activity_id: activityId } : {}

    if (checkinStatus !== undefined && checkinStatus !== '' && checkinStatus !== null) {
      whereCondition.checkin_status = parseInt(checkinStatus)
    }

    // 分批查询所有数据（当前活动）
    const countRes = await db.collection(COLLECTIONS.ATTENDEE)
      .where(whereCondition)
      .count()
    const total = countRes.total
    const batchSize = 100
    const batchTimes = Math.ceil(total / batchSize)
    const tasks = []

    for (let i = 0; i < batchTimes; i++) {
      const promise = db.collection(COLLECTIONS.ATTENDEE)
        .where(whereCondition)
        .orderBy('created_at', 'desc')
        .skip(i * batchSize)
        .limit(batchSize)
        .get()
      tasks.push(promise)
    }

    const results = await Promise.all(tasks)
    let list = []
    results.forEach(res => {
      list = list.concat(res.data)
    })

    // 向后兼容：包含没有 activity_id 的记录
    if (activityId) {
      const fbCondition = { activity_id: _.exists(false) }
      if (checkinStatus !== undefined && checkinStatus !== '' && checkinStatus !== null) {
        fbCondition.checkin_status = parseInt(checkinStatus)
      }
      const fbCountRes = await db.collection(COLLECTIONS.ATTENDEE)
        .where(fbCondition)
        .count()
      if (fbCountRes.total > 0) {
        const fbBatchTimes = Math.ceil(fbCountRes.total / batchSize)
        const fbTasks = []
        for (let i = 0; i < fbBatchTimes; i++) {
          const promise = db.collection(COLLECTIONS.ATTENDEE)
            .where(fbCondition)
            .orderBy('created_at', 'desc')
            .skip(i * batchSize)
            .limit(batchSize)
            .get()
          fbTasks.push(promise)
        }
        const fbResults = await Promise.all(fbTasks)
        fbResults.forEach(res => {
          list = list.concat(res.data)
        })
      }
    }

    return httpResponse(200, success(list))
  } catch (err) {
    console.error('导出参会人员失败:', err)
    return httpResponse(500, fail(500, '导出参会人员失败'))
  }
}

/**
 * 16. 签到列表（管理后台，当前活动）
 * 返回参会人员列表及签到状态，支持分页和筛选
 */
async function handleAdminCheckinList(event) {
  try {
    const query = event.queryStringParameters || {}
    const page = parseInt(query.page) || 1
    const pageSize = parseInt(query.pageSize) || 20
    const checkinStatus = query.checkinStatus

    const activityId = await getCurrentActivityId()
    const whereCondition = activityId ? { activity_id: activityId } : {}

    if (checkinStatus !== undefined && checkinStatus !== '' && checkinStatus !== null) {
      whereCondition.checkin_status = parseInt(checkinStatus)
    }

    // 查询总数
    const countRes = await db.collection(COLLECTIONS.ATTENDEE)
      .where(whereCondition)
      .count()
    let total = countRes.total

    // 向后兼容
    if (activityId) {
      const fbCondition = { ...whereCondition, activity_id: _.exists(false) }
      const fbCountRes = await db.collection(COLLECTIONS.ATTENDEE)
        .where(fbCondition)
        .count()
      total += fbCountRes.total
    }

    // 查询列表
    const listRes = await db.collection(COLLECTIONS.ATTENDEE)
      .where(whereCondition)
      .orderBy('checkin_status', 'desc')
      .orderBy('checkin_time', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()

    let list = listRes.data

    // 向后兼容
    if (activityId && list.length < pageSize) {
      const remaining = pageSize - list.length
      const fbCondition = { activity_id: _.exists(false) }
      if (checkinStatus !== undefined && checkinStatus !== '' && checkinStatus !== null) {
        fbCondition.checkin_status = parseInt(checkinStatus)
      }
      const fbListRes = await db.collection(COLLECTIONS.ATTENDEE)
        .where(fbCondition)
        .orderBy('checkin_status', 'desc')
        .orderBy('checkin_time', 'desc')
        .skip((page - 1) * pageSize)
        .limit(remaining)
        .get()
      list = list.concat(fbListRes.data)
    }

    return httpResponse(200, success({
      list,
      total,
      page,
      pageSize
    }))
  } catch (err) {
    console.error('获取签到列表失败:', err)
    return httpResponse(500, fail(500, '获取签到列表失败'))
  }
}

/**
 * 17. 新增图文直播图片（管理后台，当前活动）
 */
async function handleAdminCreateLiveImage(event) {
  try {
    const body = parseBody(event)

    if (!body.image_url) {
      return httpResponse(400, fail(400, '图片地址不能为空'))
    }

    const activityId = await getCurrentActivityId()

    const result = await db.collection(COLLECTIONS.LIVE_IMAGE).add({
      data: {
        activity_id: activityId || '',
        title: body.title || '',
        image_url: body.image_url,
        sort_order: body.sort_order || 0,
        is_visible: body.is_visible !== undefined ? body.is_visible : 1,
        created_at: new Date(),
        updated_at: new Date()
      }
    })

    return httpResponse(200, success({ _id: result._id }, '图文直播图片添加成功'))
  } catch (err) {
    console.error('新增图文直播图片失败:', err)
    return httpResponse(500, fail(500, '新增图文直播图片失败'))
  }
}

/**
 * 18. 获取图文直播图片列表（管理后台，当前活动）
 * 返回所有图片（包括不可见的）
 */
async function handleAdminGetLiveImages() {
  try {
    const activityId = await getCurrentActivityId()
    const whereCondition = activityId ? { activity_id: activityId } : {}

    const countRes = await db.collection(COLLECTIONS.LIVE_IMAGE)
      .where(whereCondition)
      .count()
    const total = countRes.total
    const batchSize = 100
    const batchTimes = Math.ceil(total / batchSize)
    const tasks = []

    for (let i = 0; i < batchTimes; i++) {
      const promise = db.collection(COLLECTIONS.LIVE_IMAGE)
        .where(whereCondition)
        .orderBy('sort_order', 'asc')
        .skip(i * batchSize)
        .limit(batchSize)
        .get()
      tasks.push(promise)
    }

    const results = await Promise.all(tasks)
    let list = []
    results.forEach(res => {
      list = list.concat(res.data)
    })

    // 向后兼容：包含没有 activity_id 的图片
    if (activityId) {
      const fbCountRes = await db.collection(COLLECTIONS.LIVE_IMAGE)
        .where({ activity_id: _.exists(false) })
        .count()
      if (fbCountRes.total > 0) {
        const fbBatchTimes = Math.ceil(fbCountRes.total / batchSize)
        const fbTasks = []
        for (let i = 0; i < fbBatchTimes; i++) {
          const promise = db.collection(COLLECTIONS.LIVE_IMAGE)
            .where({ activity_id: _.exists(false) })
            .orderBy('sort_order', 'asc')
            .skip(i * batchSize)
            .limit(batchSize)
            .get()
          fbTasks.push(promise)
        }
        const fbResults = await Promise.all(fbTasks)
        fbResults.forEach(res => {
          list = list.concat(res.data)
        })
      }
    }

    return httpResponse(200, success(list))
  } catch (err) {
    console.error('获取图文直播图片列表失败:', err)
    return httpResponse(500, fail(500, '获取图文直播图片列表失败'))
  }
}

/**
 * 19a. 更新图文直播图片（管理后台）
 */
async function handleAdminUpdateLiveImage(event, imageId) {
  try {
    if (!imageId) {
      return httpResponse(400, fail(400, '图片ID不能为空'))
    }

    const body = parseBody(event)

    await db.collection(COLLECTIONS.LIVE_IMAGE).doc(imageId).update({
      data: {
        ...body,
        updated_at: new Date()
      }
    })

    return httpResponse(200, success(null, '图文直播图片更新成功'))
  } catch (err) {
    console.error('更新图文直播图片失败:', err)
    return httpResponse(500, fail(500, '更新图文直播图片失败'))
  }
}

/**
 * 19b. 删除图文直播图片（管理后台）
 */
async function handleAdminDeleteLiveImage(imageId) {
  try {
    if (!imageId) {
      return httpResponse(400, fail(400, '图片ID不能为空'))
    }

    await db.collection(COLLECTIONS.LIVE_IMAGE).doc(imageId).remove()

    return httpResponse(200, success(null, '图文直播图片删除成功'))
  } catch (err) {
    console.error('删除图文直播图片失败:', err)
    return httpResponse(500, fail(500, '删除图文直播图片删除失败'))
  }
}

// ============================================================
// 辅助工具函数
// ============================================================

/**
 * 解析请求体（兼容不同调用方式）
 * @param {object} event - 云函数 event 对象
 * @returns {object} 解析后的请求体
 */
function parseBody(event) {
  // 如果 body 已经是对象，直接返回
  if (event.body && typeof event.body === 'object') {
    return event.body
  }

  // 如果 body 是 JSON 字符串，解析后返回
  if (event.body && typeof event.body === 'string') {
    try {
      return JSON.parse(event.body)
    } catch (e) {
      return {}
    }
  }

  // 小程序端直接传参的情况
  if (event.data) {
    return event.data
  }

  return event
}

/**
 * 解析 URL 中的路径参数
 * 例如：/api/admin/schedules/abc123 -> { resource: 'schedules', id: 'abc123' }
 * @param {string} path - URL 路径
 * @returns {object} 解析结果
 */
function parsePathParams(path) {
  const segments = path.split('/').filter(Boolean)
  // 预期格式：api/admin/resource/action 或 api/admin/resource/id
  if (segments.length >= 3) {
    return {
      segments,
      resource: segments[2] || '',
      id: segments[3] || '',
      action: segments[4] || ''
    }
  }
  return { segments, resource: '', id: '', action: '' }
}

// ============================================================
// 主入口函数
// ============================================================

/**
 * 云函数主入口
 * 支持两种调用方式：
 * 1. 小程序端通过 wx.cloud.callFunction 调用（event.type 路由）
 * 2. 管理后台通过 HTTP 触发器调用（event.httpMethod + event.path 路由）
 */
exports.main = async (event, context) => {
  console.log('云函数被调用:', JSON.stringify(event).substring(0, 500))

  // ==================== 小程序端调用路由 ====================
  // 通过 event.type 判断接口类型
  if (event.type) {
    return await handleMiniAppRequest(event)
  }

  // ==================== HTTP 触发器调用路由 ====================
  // 通过 event.httpMethod + event.path 判断接口类型
  if (event.httpMethod !== undefined) {
    return await handleHttpRequest(event)
  }

  // 无法识别的调用方式
  return fail(400, '无法识别的调用方式')
}

// ============================================================
// 小程序端请求路由
// ============================================================

/**
 * 处理小程序端通过 wx.cloud.callFunction 发起的请求
 * @param {object} event - 云函数 event 对象
 * @returns {object} 响应结果
 */
async function handleMiniAppRequest(event) {
  const { type } = event

  switch (type) {
    // 1. 获取活动信息
    case 'getActivity':
      return await handleGetActivity()

    // 2. 获取会议日程列表
    case 'getSchedules':
      return await handleGetSchedules()

    // 3. 查询参会人（支持手机号或姓名+手机号后四位）
    case 'queryAttendee':
      return await handleQueryAttendee(event)

    // 4. 通过参会码查询参会人
    case 'getAttendeeByCode':
      return await handleGetAttendeeByCode(event.attendeeCode)

    // 5. 扫码签到
    case 'checkin':
      return await handleCheckin(event.attendeeCode, event.operatorName)

    // 6. 获取图文直播图片
    case 'getLiveImages':
      return await handleGetLiveImages()

    // 7. 手机号授权登录
    case 'loginWithPhone':
      return await handleLoginWithPhone(event)

    // 未知接口类型
    default:
      return fail(400, `未知的接口类型: ${type}`)
  }
}

// ============================================================
// HTTP 请求路由（管理后台）
// ============================================================

/**
 * 处理管理后台通过 HTTP 触发器发起的请求
 * @param {object} event - 云函数 event 对象（含 httpMethod, path, body 等）
 * @returns {object} HTTP 响应（含 statusCode, headers, body）
 */
async function handleHttpRequest(event) {
  const method = (event.httpMethod || 'GET').toUpperCase()
  const path = event.path || ''

  // OPTIONS 预检请求直接返回
  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    }
  }

  try {
    // ==================== 登录接口（不需要鉴权） ====================
    if (path === '/api/admin/login' && method === 'POST') {
      return await handleAdminLogin(event)
    }

    // ==================== 以下接口均需要 JWT 鉴权 ====================
    const authResult = authenticateRequest(event)
    if (!authResult) {
      return httpResponse(401, fail(401, '未授权，请先登录'))
    }

    // 解析路径参数
    const pathInfo = parsePathParams(path)
    const { resource, id, action } = pathInfo

    // ==================== 数据概览 ====================
    if (path === '/api/admin/dashboard' && method === 'GET') {
      return await handleDashboard()
    }

    // ==================== 活动信息管理 ====================
    if (path === '/api/admin/activity') {
      if (method === 'GET') {
        return await handleAdminGetActivity()
      }
      if (method === 'PUT') {
        return await handleAdminUpdateActivity(event)
      }
    }

    // ==================== 活动列表管理（多活动） ====================
    if (path === '/api/admin/activities') {
      if (method === 'GET') {
        return await handleAdminListActivities()
      }
      if (method === 'POST') {
        return await handleAdminCreateActivity(event)
      }
    }

    // 活动编辑/删除（带ID的路径）
    if (resource === 'activities' && id && !action) {
      if (method === 'PUT') {
        return await handleAdminUpdateActivityById(event, id)
      }
      if (method === 'DELETE') {
        return await handleAdminDeleteActivity(id)
      }
    }

    // 活动激活（带ID + activate action）
    if (resource === 'activities' && id && action === 'activate') {
      if (method === 'POST') {
        return await handleAdminActivateActivity(id)
      }
    }

    // ==================== 日程管理 ====================
    if (path === '/api/admin/schedules') {
      if (method === 'GET') {
        return await handleAdminGetSchedules()
      }
      if (method === 'POST') {
        return await handleAdminCreateSchedule(event)
      }
    }

    // 日程编辑/删除（带ID的路径）
    if (resource === 'schedules' && id) {
      if (method === 'PUT') {
        return await handleAdminUpdateSchedule(event, id)
      }
      if (method === 'DELETE') {
        return await handleAdminDeleteSchedule(id)
      }
    }

    // ==================== 参会人员管理 ====================

    // 导入参会人员
    if (path === '/api/admin/attendees/import' && method === 'POST') {
      return await handleAdminImportAttendees(event)
    }

    // 导出参会人员
    if (path === '/api/admin/attendees/export' && method === 'GET') {
      return await handleAdminExportAttendees(event)
    }

    // 分页查询参会人员
    if (path === '/api/admin/attendees' && method === 'GET') {
      return await handleAdminGetAttendees(event)
    }

    // 参会人员编辑/删除（带ID的路径）
    if (resource === 'attendees' && id && !action) {
      if (method === 'PUT') {
        return await handleAdminUpdateAttendee(event, id)
      }
      if (method === 'DELETE') {
        return await handleAdminDeleteAttendee(id)
      }
    }

    // ==================== 签到管理 ====================
    if (path === '/api/admin/checkin/list' && method === 'GET') {
      return await handleAdminCheckinList(event)
    }

    // ==================== 图文直播管理 ====================

    // 图文直播图片列表
    if (path === '/api/admin/live-images' && method === 'GET') {
      return await handleAdminGetLiveImages()
    }

    // 新增图文直播图片
    if (path === '/api/admin/live-images' && method === 'POST') {
      return await handleAdminCreateLiveImage(event)
    }

    // 图文直播图片编辑/删除（带ID的路径）
    if (resource === 'live-images' && id) {
      if (method === 'PUT') {
        return await handleAdminUpdateLiveImage(event, id)
      }
      if (method === 'DELETE') {
        return await handleAdminDeleteLiveImage(id)
      }
    }

    // ==================== 未匹配到路由 ====================
    return httpResponse(404, fail(404, `未找到接口: ${method} ${path}`))

  } catch (err) {
    console.error('HTTP请求处理异常:', err)
    return httpResponse(500, fail(500, '服务器内部错误'))
  }
}
