/**
 * WeChat Cloud Run Backend Service
 * Connects to WeChat Cloud Development database via HTTP API
 * Serves admin-web and H5 web version
 */

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const XLSX = require('xlsx');
const crypto = require('crypto');
const fetch = require('node-fetch');
const path = require('path');
const multer = require('multer');
const cloudbase = require('@cloudbase/node-sdk');

// ============================================================
// Configuration
// ============================================================
const CONFIG = {
  appId: process.env.WX_APPID || '',
  appSecret: process.env.WX_APPSECRET || '',
  envId: process.env.WX_ENV_ID || '',
  jwtSecret: process.env.JWT_SECRET || '',
  port: parseInt(process.env.PORT || '80', 10),
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean),
};

if (!CONFIG.jwtSecret) {
  throw new Error('JWT_SECRET 环境变量未配置');
}

const cloud = cloudbase.init({ env: CONFIG.envId || cloudbase.SYMBOL_CURRENT_ENV });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => callback(null, /^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)),
});
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ============================================================
// Access Token Management
// ============================================================
let accessTokenCache = {
  token: '',
  expiresAt: 0,
};

async function getAccessToken() {
  const now = Date.now();
  // Refresh 10 minutes before expiry (1h50m = 6600000ms)
  if (accessTokenCache.token && accessTokenCache.expiresAt > now + 600000) {
    return accessTokenCache.token;
  }

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${CONFIG.appId}&secret=${CONFIG.appSecret}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.errcode) {
    throw new Error(`Failed to get access_token: ${data.errmsg} (${data.errcode})`);
  }

  accessTokenCache.token = data.access_token;
  accessTokenCache.expiresAt = now + data.expires_in * 1000;
  console.log('[AccessToken] Refreshed successfully');
  return accessTokenCache.token;
}

// ============================================================
// Cloud DB Helper Functions
// ============================================================

const COLLECTION_ALIASES = {
  admin: 'admins',
  schedule: 'schedules',
  attendee: 'attendees',
  live_image: 'live_images',
};

function collectionName(name) {
  return COLLECTION_ALIASES[name] || name;
}

function normalizeQuery(query) {
  return Object.entries(COLLECTION_ALIASES).reduce(
    (result, [from, to]) => result.replaceAll(`collection("${from}")`, `collection("${to}")`),
    query
  );
}

/**
 * Execute a cloud DB query
 * @param {string} query - Cloud DB query string
 * @returns {Array} Parsed results
 */
async function cloudQuery(query) {
  query = normalizeQuery(query);
  const token = await getAccessToken();
  const url = `https://api.weixin.qq.com/tcb/databasequery?access_token=${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ env: CONFIG.envId, query }),
  });
  const data = await res.json();
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`Cloud query failed: ${data.errmsg} (${data.errcode})`);
  }
  // Each item in data.data is a JSON string that needs parsing
  if (data.data && Array.isArray(data.data)) {
    return data.data.map((item) => JSON.parse(item));
  }
  return [];
}

/**
 * Execute a cloud DB count
 * @param {string} collection - Collection name
 * @param {object} where - Where conditions
 * @returns {number} Count
 */
async function cloudCount(collection, where = {}) {
  collection = collectionName(collection);
  const token = await getAccessToken();
  const whereStr = Object.keys(where).length > 0 ? `.where(${JSON.stringify(where)})` : '';
  const query = `db.collection("${collection}")${whereStr}.count()`;
  const url = `https://api.weixin.qq.com/tcb/databasecount?access_token=${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ env: CONFIG.envId, query }),
  });
  const data = await res.json();
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`Cloud count failed: ${data.errmsg} (${data.errcode})`);
  }
  return parseInt(data.count || '0', 10);
}

/**
 * Add a document to cloud DB
 * @param {string} collection - Collection name
 * @param {object} data - Document data
 * @returns {object} Created document with _id
 */
async function cloudAdd(collection, data) {
  collection = collectionName(collection);
  const token = await getAccessToken();
  const url = `https://api.weixin.qq.com/tcb/databaseadd?access_token=${token}`;
  const query = `db.collection("${collection}").add({data:${JSON.stringify(data)}})`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ env: CONFIG.envId, query }),
  });
  const result = await res.json();
  if (result.errcode && result.errcode !== 0) {
    throw new Error(`Cloud add failed: ${result.errmsg} (${result.errcode})`);
  }
  return result;
}

/**
 * Update documents in cloud DB
 * @param {string} query - Full update query string
 * @returns {object} Update result
 */
async function cloudUpdate(query) {
  query = normalizeQuery(query);
  const token = await getAccessToken();
  const url = `https://api.weixin.qq.com/tcb/databaseupdate?access_token=${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ env: CONFIG.envId, query }),
  });
  const result = await res.json();
  if (result.errcode && result.errcode !== 0) {
    throw new Error(`Cloud update failed: ${result.errmsg} (${result.errcode})`);
  }
  return result;
}

/**
 * Delete documents from cloud DB
 * @param {string} query - Full delete query string
 * @returns {object} Delete result
 */
async function cloudDelete(query) {
  query = normalizeQuery(query);
  const token = await getAccessToken();
  const url = `https://api.weixin.qq.com/tcb/databasedelete?access_token=${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ env: CONFIG.envId, query }),
  });
  const result = await res.json();
  if (result.errcode && result.errcode !== 0) {
    throw new Error(`Cloud delete failed: ${result.errmsg} (${result.errcode})`);
  }
  return result;
}

/**
 * Query all items from a collection (handles limit)
 * @param {string} collection - Collection name
 * @param {object} where - Optional where conditions
 * @returns {Array} All matching documents
 */
async function cloudQueryAll(collection, where = {}, orderBy = null) {
  collection = collectionName(collection);
  // Cloud DB limits 100 items per query, so we paginate
  let allResults = [];
  const batchSize = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let whereStr = Object.keys(where).length > 0 ? `.where(${JSON.stringify(where)})` : '';
    let orderStr = orderBy ? `.orderBy("${orderBy.field}", "${orderBy.order || 'asc'}")` : '';
    const query = `db.collection("${collection}")${whereStr}${orderStr}.skip(${offset}).limit(${batchSize}).get()`;
    const token = await getAccessToken();
    const url = `https://api.weixin.qq.com/tcb/databasequery?access_token=${token}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ env: CONFIG.envId, query }),
    });
    const data = await res.json();
    if (data.errcode && data.errcode !== 0) {
      throw new Error(`Cloud queryAll failed: ${data.errmsg} (${data.errcode})`);
    }
    if (data.data && Array.isArray(data.data)) {
      const parsed = data.data.map((item) => JSON.parse(item));
      allResults = allResults.concat(parsed);
      if (parsed.length < batchSize) {
        hasMore = false;
      } else {
        offset += batchSize;
      }
    } else {
      hasMore = false;
    }
  }
  return allResults;
}

// ============================================================
// Utility Functions
// ============================================================
function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function generateAttendeeCode() {
  return 'A' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
}

/**
 * Get the current activity ID (where is_current === 1)
 * @returns {string|null} Current activity _id
 */
async function getCurrentActivityId() {
  try {
    const activities = await cloudQueryAll('activity', { is_current: 1 });
    if (activities.length > 0) return activities[0]._id;
    // Fallback: get first activity
    const fallback = await cloudQueryAll('activity', {}, null);
    if (fallback.length > 0) return fallback[0]._id;
    return null;
  } catch (err) {
    console.error('[getCurrentActivityId] Error:', err.message);
    return null;
  }
}

/**
 * Filter items by activity_id, including fallback items without activity_id
 * @param {Array} items - All items
 * @param {string|null} activityId - Current activity ID
 * @returns {Array} Filtered items
 */
function filterByActivity(items, activityId) {
  if (!activityId) return items;
  return items.filter(item => item.activity_id === activityId || !item.activity_id);
}

async function refreshActivityMap(activity) {
  if (!activity || !activity.mapFileId) return activity;
  const result = await cloud.getTempFileURL({ fileList: [activity.mapFileId] });
  const file = result.fileList && result.fileList[0];
  return { ...activity, mapImage: (file && file.tempFileURL) || activity.mapImage };
}

async function refreshStorageUrls(items) {
  const fileIds = items.map((item) => item.fileId).filter(Boolean);
  if (fileIds.length === 0) return items;
  const result = await cloud.getTempFileURL({ fileList: fileIds });
  const urlMap = new Map((result.fileList || []).map((file) => [file.fileID, file.tempFileURL]));
  return items.map((item) => ({
    ...item,
    url: (item.fileId && urlMap.get(item.fileId)) || item.url,
  }));
}

// ============================================================
// JWT Middleware
// ============================================================
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未授权，请先登录' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, CONFIG.jwtSecret);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token无效或已过期' });
  }
}

// ============================================================
// Express App Setup
// ============================================================
const app = express();

app.use(cors({
  origin(origin, callback) {
    if (!origin || CONFIG.corsOrigins.length === 0 || CONFIG.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('该来源不在 CORS 白名单中'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files (H5 web version)
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================
// Admin APIs
// ============================================================

// POST /api/admin/login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    // Query admin collection
    const admins = await cloudQuery(
      `db.collection("admin").where({username:${JSON.stringify(username)}}).get()`
    );

    if (admins.length === 0) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const admin = admins[0];
    const passwordHash = sha256(password);
    if (admin.password_hash !== passwordHash) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = jwt.sign(
      { username: admin.username, role: admin.role },
      CONFIG.jwtSecret,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      username: admin.username,
      role: admin.role,
    });
  } catch (err) {
    console.error('[Login Error]', err);
    res.status(500).json({ error: '登录失败: ' + err.message });
  }
});

// GET /api/admin/dashboard
app.get('/api/admin/dashboard', authMiddleware, async (req, res) => {
  try {
    const activityId = await getCurrentActivityId();
    const whereClause = activityId ? { activity_id: activityId } : {};
    const totalCount = await cloudCount('attendee', whereClause);
    const checkedInCount = await cloudCount('attendee', { ...whereClause, checkin_status: true });
    const rate = totalCount > 0 ? Math.round((checkedInCount / totalCount) * 10000) / 100 : 0;

    res.json({
      totalAttendees: totalCount,
      checkedInCount,
      checkinRate: rate,
      currentActivityId: activityId,
    });
  } catch (err) {
    console.error('[Dashboard Error]', err);
    res.status(500).json({ error: '获取仪表盘数据失败: ' + err.message });
  }
});

// GET /api/admin/activity
app.get('/api/admin/activity', authMiddleware, async (req, res) => {
  try {
    const activities = await cloudQueryAll('activity', { is_current: 1 });
    if (activities.length > 0) {
      const activity = await refreshActivityMap(activities[0]);
      return res.json({ ...activity, currentActivityId: activity._id });
    }
    // Fallback: get first activity
    const fallback = await cloudQueryAll('activity');
    const activity = fallback.length > 0 ? await refreshActivityMap(fallback[0]) : null;
    res.json(activity ? { ...activity, currentActivityId: activity._id } : { currentActivityId: null });
  } catch (err) {
    console.error('[Activity Error]', err);
    res.status(500).json({ error: '获取活动信息失败: ' + err.message });
  }
});

// PUT /api/admin/activity
app.put('/api/admin/activity', authMiddleware, async (req, res) => {
  try {
    const activities = await cloudQueryAll('activity', { is_current: 1 });
    let activityList = activities;
    if (activityList.length === 0) {
      activityList = await cloudQueryAll('activity');
    }

    if (activityList.length > 0) {
      const activityId = activityList[0]._id;
      await cloudUpdate(
        `db.collection("activity").doc("${activityId}").update({data:${JSON.stringify(req.body)}})`
      );
    } else {
      await cloudAdd('activity', req.body);
    }
    res.json({ success: true, message: '活动信息已更新' });
  } catch (err) {
    console.error('[Update Activity Error]', err);
    res.status(500).json({ error: '更新活动信息失败: ' + err.message });
  }
});

// ==================== 多活动管理 ====================

// GET /api/admin/activities - 获取所有活动列表
app.get('/api/admin/activities', authMiddleware, async (req, res) => {
  try {
    const activities = await cloudQueryAll('activity');
    
    // Enrich with attendee counts
    const enriched = [];
    for (const activity of activities) {
      const whereClause = { activity_id: activity._id };
      const total = await cloudCount('attendee', whereClause);
      const checkedIn = await cloudCount('attendee', { ...whereClause, checkin_status: true });
      const checkinRate = total > 0 ? ((checkedIn / total) * 100).toFixed(1) : 0;
      
      enriched.push({
        ...activity,
        id: activity._id,
        totalAttendees: total,
        checkedIn,
        checkinRate: parseFloat(checkinRate),
      });
    }
    
    res.json(enriched);
  } catch (err) {
    console.error('[Activities List Error]', err);
    res.status(500).json({ error: '获取活动列表失败: ' + err.message });
  }
});

// POST /api/admin/activities - 创建新活动
app.post('/api/admin/activities', authMiddleware, async (req, res) => {
  try {
    const now = new Date().toISOString();
    const defaultTitle = req.body.title || `新活动 ${now.substring(0, 10)}`;
    
    const activityData = {
      title: defaultTitle,
      description: req.body.description || '',
      location: req.body.location || '',
      organizer: req.body.organizer || '',
      start_time: req.body.start_time || '',
      end_time: req.body.end_time || '',
      is_current: 0,
      created_at: now,
      updated_at: now,
    };
    
    const result = await cloudAdd('activity', activityData);
    res.json({ success: true, id: result._id, message: '活动创建成功' });
  } catch (err) {
    console.error('[Create Activity Error]', err);
    res.status(500).json({ error: '创建活动失败: ' + err.message });
  }
});

// PUT /api/admin/activities/:id - 更新指定活动
app.put('/api/admin/activities/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const activities = await cloudQueryAll('activity');
    const target = activities.find(a => a._id === id);
    if (!target) {
      return res.status(404).json({ error: '活动不存在' });
    }
    
    const updateData = { ...req.body };
    delete updateData.is_current;
    delete updateData._id;
    updateData.updated_at = new Date().toISOString();
    
    await cloudUpdate(
      `db.collection("activity").doc("${id}").update({data:${JSON.stringify(updateData)}})`
    );
    res.json({ success: true, message: '活动更新成功' });
  } catch (err) {
    console.error('[Update Activity Error]', err);
    res.status(500).json({ error: '更新活动失败: ' + err.message });
  }
});

// DELETE /api/admin/activities/:id - 删除活动
app.delete('/api/admin/activities/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const activities = await cloudQueryAll('activity');
    const target = activities.find(a => a._id === id);
    if (!target) {
      return res.status(404).json({ error: '活动不存在' });
    }
    if (target.is_current === 1) {
      return res.status(400).json({ error: '不能删除当前活动，请先切换到其他活动' });
    }
    
    await cloudDelete(`db.collection("activity").doc("${id}").remove()`);
    res.json({ success: true, message: '活动删除成功' });
  } catch (err) {
    console.error('[Delete Activity Error]', err);
    res.status(500).json({ error: '删除活动失败: ' + err.message });
  }
});

// POST /api/admin/activities/:id/activate - 设为当前活动
app.post('/api/admin/activities/:id/activate', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const activities = await cloudQueryAll('activity');
    
    // Set all activities to is_current: 0
    for (const act of activities) {
      if (act.is_current === 1) {
        await cloudUpdate(
          `db.collection("activity").doc("${act._id}").update({data:${JSON.stringify({ is_current: 0, updated_at: new Date().toISOString() })}})`
        );
      }
    }
    
    // Set target activity to is_current: 1
    await cloudUpdate(
      `db.collection("activity").doc("${id}").update({data:${JSON.stringify({ is_current: 1, updated_at: new Date().toISOString() })}})`
    );
    
    res.json({ success: true, message: '活动已切换为当前活动' });
  } catch (err) {
    console.error('[Activate Activity Error]', err);
    res.status(500).json({ error: '切换活动失败: ' + err.message });
  }
});

// GET /api/admin/schedules
app.get('/api/admin/schedules', authMiddleware, async (req, res) => {
  try {
    const activityId = await getCurrentActivityId();
    const whereClause = activityId ? { activity_id: activityId } : {};
    let schedules = await cloudQueryAll('schedule', whereClause, { field: 'sortOrder', order: 'asc' });
    
    // Fallback: include schedules without activity_id
    if (activityId) {
      const allSchedules = await cloudQueryAll('schedule');
      const fbSchedules = allSchedules.filter(s => !s.activity_id);
      schedules = schedules.concat(fbSchedules);
    }
    
    res.json(schedules);
  } catch (err) {
    console.error('[Schedules Error]', err);
    res.status(500).json({ error: '获取日程列表失败: ' + err.message });
  }
});

// POST /api/admin/schedules
app.post('/api/admin/schedules', authMiddleware, async (req, res) => {
  try {
    const activityId = await getCurrentActivityId();
    const scheduleData = {
      activity_id: activityId || '',
      date: req.body.date || '',
      startTime: req.body.startTime || '',
      endTime: req.body.endTime || '',
      title: req.body.title || '',
      location: req.body.location || '',
      speaker: req.body.speaker || '',
      remark: req.body.remark || '',
      sortOrder: req.body.sortOrder || 0,
      createdAt: new Date().toISOString(),
    };
    const result = await cloudAdd('schedule', scheduleData);
    res.json({ success: true, id: result._id, message: '日程已添加' });
  } catch (err) {
    console.error('[Add Schedule Error]', err);
    res.status(500).json({ error: '添加日程失败: ' + err.message });
  }
});

// PUT /api/admin/schedules/:id
app.put('/api/admin/schedules/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    // Find the schedule by custom id field
    const schedules = await cloudQueryAll('schedule');
    const target = schedules.find((s) => s._id === id || s.id === id);
    if (!target) {
      return res.status(404).json({ error: '日程不存在' });
    }
    const docId = target._id;
    await cloudUpdate(
      `db.collection("schedule").doc("${docId}").update({data:${JSON.stringify(req.body)}})`
    );
    res.json({ success: true, message: '日程已更新' });
  } catch (err) {
    console.error('[Update Schedule Error]', err);
    res.status(500).json({ error: '更新日程失败: ' + err.message });
  }
});

// DELETE /api/admin/schedules/:id
app.delete('/api/admin/schedules/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const schedules = await cloudQueryAll('schedule');
    const target = schedules.find((s) => s._id === id || s.id === id);
    if (!target) {
      return res.status(404).json({ error: '日程不存在' });
    }
    const docId = target._id;
    await cloudDelete(`db.collection("schedule").doc("${docId}").remove()`);
    res.json({ success: true, message: '日程已删除' });
  } catch (err) {
    console.error('[Delete Schedule Error]', err);
    res.status(500).json({ error: '删除日程失败: ' + err.message });
  }
});

// GET /api/admin/attendees
app.get('/api/admin/attendees', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const pageSize = parseInt(req.query.pageSize || '20', 10);
    const keyword = req.query.keyword || '';

    const activityId = await getCurrentActivityId();
    let allAttendees = await cloudQueryAll('attendee');
    
    // Filter by activity_id (current + fallback without activity_id)
    allAttendees = filterByActivity(allAttendees, activityId);

    // Keyword search - filter by name, phone, organization, attendeeCode
    if (keyword) {
      const kw = keyword.toLowerCase();
      allAttendees = allAttendees.filter((a) => {
        return (
          (a.name && a.name.toLowerCase().includes(kw)) ||
          (a.phone && a.phone.includes(kw)) ||
          (a.organization && a.organization.toLowerCase().includes(kw)) ||
          (a.attendeeCode && a.attendeeCode.toLowerCase().includes(kw))
        );
      });
    }

    const total = allAttendees.length;
    const start = (page - 1) * pageSize;
    const list = allAttendees.slice(start, start + pageSize);

    res.json({
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    console.error('[Attendees Error]', err);
    res.status(500).json({ error: '获取参会人员列表失败: ' + err.message });
  }
});

// POST /api/admin/attendees/import
app.post('/api/admin/attendees/import', authMiddleware, excelUpload.single('file'), async (req, res) => {
  try {
    let attendees = req.body.attendees;
    if (req.file) {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
      attendees = rows.map((row) => ({
        name: row.name || row['姓名'],
        phone: String(row.phone || row['手机号'] || ''),
        organization: row.organization || row['单位'],
        identityType: row.identityType || row['身份类型'],
        seatNo: row.seatNo || row['座位号'],
        tableNo: row.tableNo || row['餐桌号'],
        hotel: row.hotel || row['酒店'],
        roomNo: row.roomNo || row['房间号'],
        diningPlace: row.diningPlace || row['用餐地点'],
        remark: row.remark || row['备注'],
      }));
    }
    if (!Array.isArray(attendees) || attendees.length === 0) {
      return res.status(400).json({ error: '参会人员数据不能为空' });
    }

    const activityId = await getCurrentActivityId();
    let imported = 0;
    for (const item of attendees) {
      const attendeeData = {
        activity_id: activityId || '',
        name: item.name || '',
        phone: item.phone || '',
        organization: item.organization || '',
        identityType: item.identityType || '',
        seatNo: item.seatNo || '',
        tableNo: item.tableNo || '',
        hotel: item.hotel || '',
        roomNo: item.roomNo || '',
        attendeeCode: item.attendeeCode || generateAttendeeCode(),
        checkin_status: false,
        checkin_time: '',
        remark: item.remark || '',
        diningPlace: item.diningPlace || '',
        createdAt: new Date().toISOString(),
      };
      await cloudAdd('attendee', attendeeData);
      imported++;
    }

    res.json({ success: true, imported, message: `成功导入 ${imported} 条参会人员` });
  } catch (err) {
    console.error('[Import Attendees Error]', err);
    res.status(500).json({ error: '导入参会人员失败: ' + err.message });
  }
});

// PUT /api/admin/attendees/:id
app.put('/api/admin/attendees/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const attendees = await cloudQueryAll('attendee');
    const target = attendees.find((a) => a._id === id || a.id === id);
    if (!target) {
      return res.status(404).json({ error: '参会人员不存在' });
    }
    const docId = target._id;
    await cloudUpdate(
      `db.collection("attendee").doc("${docId}").update({data:${JSON.stringify(req.body)}})`
    );
    res.json({ success: true, message: '参会人员已更新' });
  } catch (err) {
    console.error('[Update Attendee Error]', err);
    res.status(500).json({ error: '更新参会人员失败: ' + err.message });
  }
});

// DELETE /api/admin/attendees/:id
app.delete('/api/admin/attendees/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const attendees = await cloudQueryAll('attendee');
    const target = attendees.find((a) => a._id === id || a.id === id);
    if (!target) {
      return res.status(404).json({ error: '参会人员不存在' });
    }
    const docId = target._id;
    await cloudDelete(`db.collection("attendee").doc("${docId}").remove()`);
    res.json({ success: true, message: '参会人员已删除' });
  } catch (err) {
    console.error('[Delete Attendee Error]', err);
    res.status(500).json({ error: '删除参会人员失败: ' + err.message });
  }
});

// GET /api/admin/attendees/export
app.get('/api/admin/attendees/export', authMiddleware, async (req, res) => {
  try {
    const activityId = await getCurrentActivityId();
    let attendees = await cloudQueryAll('attendee');
    
    // Filter by activity_id
    attendees = filterByActivity(attendees, activityId);

    const exportData = attendees.map((a, index) => ({
      '序号': index + 1,
      '姓名': a.name || '',
      '手机号': a.phone || '',
      '单位': a.organization || '',
      '身份类型': a.identityType || '',
      '座位号': a.seatNo || '',
      '桌号': a.tableNo || '',
      '酒店': a.hotel || '',
      '房间号': a.roomNo || '',
      '签到码': a.attendeeCode || '',
      '签到状态': a.checkin_status ? '已签到' : '未签到',
      '签到时间': a.checkin_time || '',
      '用餐地点': a.diningPlace || '',
      '备注': a.remark || '',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '参会人员');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=' + encodeURIComponent('参会人员名单.xlsx'));
    res.send(buffer);
  } catch (err) {
    console.error('[Export Attendees Error]', err);
    res.status(500).json({ error: '导出参会人员失败: ' + err.message });
  }
});

// GET /api/admin/checkin/list
app.get('/api/admin/checkin/list', authMiddleware, async (req, res) => {
  try {
    const { method, date } = req.query;
    const activityId = await getCurrentActivityId();
    let checkinLogs = await cloudQueryAll('checkin_log');
    
    // Filter by activity_id
    checkinLogs = filterByActivity(checkinLogs, activityId);

    // Filter by method
    if (method) {
      checkinLogs = checkinLogs.filter((c) => c.method === method);
    }

    // Filter by date
    if (date) {
      checkinLogs = checkinLogs.filter((c) => {
        if (c.checkinTime) {
          return c.checkinTime.startsWith(date);
        }
        return false;
      });
    }

    // Enrich with attendee info
    const enrichedLogs = [];
    for (const log of checkinLogs) {
      let attendee = null;
      if (log.attendeeCode) {
        const attendees = await cloudQueryAll('attendee', { attendeeCode: log.attendeeCode });
        attendee = attendees.length > 0 ? attendees[0] : null;
      }
      enrichedLogs.push({
        ...log,
        attendeeName: attendee ? attendee.name : '未知',
        attendeePhone: attendee ? attendee.phone : '',
        organization: attendee ? attendee.organization : '',
      });
    }

    res.json(enrichedLogs);
  } catch (err) {
    console.error('[Checkin List Error]', err);
    res.status(500).json({ error: '获取签到列表失败: ' + err.message });
  }
});

// POST /api/admin/live-images
app.post('/api/admin/live-images', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请选择要上传的图片' });
    }
    const extension = path.extname(req.file.originalname).toLowerCase() || '.jpg';
    const cloudPath = `event/live/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`;
    const uploaded = await cloud.uploadFile({ cloudPath, fileContent: req.file.buffer });
    const tempResult = await cloud.getTempFileURL({ fileList: [uploaded.fileID] });
    const tempFile = tempResult.fileList && tempResult.fileList[0];
    const activityId = await getCurrentActivityId();
    const imageData = {
      activity_id: activityId || '',
      fileId: uploaded.fileID,
      url: (tempFile && tempFile.tempFileURL) || uploaded.fileID,
      title: req.body.title || '',
      sortOrder: req.body.sortOrder || 0,
      visible: req.body.visible !== undefined ? req.body.visible : true,
      createdAt: new Date().toISOString(),
    };
    const result = await cloudAdd('live_image', imageData);
    res.json({ success: true, id: result._id, message: '直播图片已添加' });
  } catch (err) {
    console.error('[Add Live Image Error]', err);
    res.status(500).json({ error: '添加直播图片失败: ' + err.message });
  }
});

app.post('/api/admin/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请选择要上传的图片' });
    }
    const extension = path.extname(req.file.originalname).toLowerCase() || '.jpg';
    const cloudPath = `event/maps/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`;
    const uploaded = await cloud.uploadFile({ cloudPath, fileContent: req.file.buffer });
    const tempResult = await cloud.getTempFileURL({ fileList: [uploaded.fileID] });
    const tempFile = tempResult.fileList && tempResult.fileList[0];
    res.json({ fileId: uploaded.fileID, url: (tempFile && tempFile.tempFileURL) || uploaded.fileID });
  } catch (err) {
    console.error('[Map Upload Error]', err);
    res.status(500).json({ error: `地图图片上传失败: ${err.message}` });
  }
});

// GET /api/admin/live-images
app.get('/api/admin/live-images', authMiddleware, async (req, res) => {
  try {
    const activityId = await getCurrentActivityId();
    let images = await cloudQueryAll('live_image', {}, { field: 'sortOrder', order: 'asc' });
    
    // Filter by activity_id
    images = filterByActivity(images, activityId);
    
    res.json(await refreshStorageUrls(images));
  } catch (err) {
    console.error('[Live Images Error]', err);
    res.status(500).json({ error: '获取直播图片列表失败: ' + err.message });
  }
});

// PUT /api/admin/live-images/:id
app.put('/api/admin/live-images/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const images = await cloudQueryAll('live_image');
    const target = images.find((img) => img._id === id || img.id === id);
    if (!target) {
      return res.status(404).json({ error: '直播图片不存在' });
    }
    const docId = target._id;
    await cloudUpdate(
      `db.collection("live_image").doc("${docId}").update({data:${JSON.stringify(req.body)}})`
    );
    res.json({ success: true, message: '直播图片已更新' });
  } catch (err) {
    console.error('[Update Live Image Error]', err);
    res.status(500).json({ error: '更新直播图片失败: ' + err.message });
  }
});

// DELETE /api/admin/live-images/:id
app.delete('/api/admin/live-images/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const images = await cloudQueryAll('live_image');
    const target = images.find((img) => img._id === id || img.id === id);
    if (!target) {
      return res.status(404).json({ error: '直播图片不存在' });
    }
    const docId = target._id;
    await cloudDelete(`db.collection("live_image").doc("${docId}").remove()`);
    res.json({ success: true, message: '直播图片已删除' });
  } catch (err) {
    console.error('[Delete Live Image Error]', err);
    res.status(500).json({ error: '删除直播图片失败: ' + err.message });
  }
});

// ============================================================
// Mini-program APIs
// ============================================================

// POST /api/miniapp/queryAttendee
app.post('/api/miniapp/queryAttendee', async (req, res) => {
  try {
    const { phone, name, last4 } = req.body;
    const activityId = await getCurrentActivityId();

    let attendees = await cloudQueryAll('attendee');
    
    // Filter by activity_id
    attendees = filterByActivity(attendees, activityId);

    if (phone) {
      // Query by phone
      attendees = attendees.filter((a) => a.phone === phone);
    } else if (name && last4) {
      // Query by name + last 4 digits of phone
      attendees = attendees.filter((a) => {
        if (!a.phone || a.phone.length < 4) return false;
        return a.name === name && a.phone.slice(-4) === last4;
      });
    } else {
      return res.status(400).json({ error: '请提供手机号或姓名+手机后四位' });
    }

    if (attendees.length === 0) {
      return res.status(404).json({ error: '未找到参会人员信息' });
    }

    res.json(attendees);
  } catch (err) {
    console.error('[MiniApp Query Attendee Error]', err);
    res.status(500).json({ error: '查询参会人员失败: ' + err.message });
  }
});

// GET /api/miniapp/getActivity
app.get('/api/miniapp/getActivity', async (req, res) => {
  try {
    const activities = await cloudQueryAll('activity', { is_current: 1 });
    if (activities.length > 0) {
      return res.json(await refreshActivityMap(activities[0]));
    }
    const fallback = await cloudQueryAll('activity');
    res.json(fallback.length > 0 ? await refreshActivityMap(fallback[0]) : {});
  } catch (err) {
    console.error('[MiniApp Get Activity Error]', err);
    res.status(500).json({ error: '获取活动信息失败: ' + err.message });
  }
});

// GET /api/miniapp/getSchedules
app.get('/api/miniapp/getSchedules', async (req, res) => {
  try {
    const activityId = await getCurrentActivityId();
    const whereClause = activityId ? { activity_id: activityId } : {};
    let schedules = await cloudQueryAll('schedule', whereClause, { field: 'sortOrder', order: 'asc' });
    
    // Fallback: include schedules without activity_id
    if (activityId) {
      const allSchedules = await cloudQueryAll('schedule');
      const fbSchedules = allSchedules.filter(s => !s.activity_id);
      schedules = schedules.concat(fbSchedules);
    }
    
    res.json(schedules);
  } catch (err) {
    console.error('[MiniApp Get Schedules Error]', err);
    res.status(500).json({ error: '获取日程列表失败: ' + err.message });
  }
});

// GET /api/miniapp/getLiveImages
app.get('/api/miniapp/getLiveImages', async (req, res) => {
  try {
    const activityId = await getCurrentActivityId();
    let images = await cloudQueryAll('live_image', { visible: true }, { field: 'sortOrder', order: 'asc' });
    
    // Filter by activity_id
    images = filterByActivity(images, activityId);
    
    res.json(await refreshStorageUrls(images));
  } catch (err) {
    console.error('[MiniApp Get Live Images Error]', err);
    res.status(500).json({ error: '获取直播图片失败: ' + err.message });
  }
});

// POST /api/miniapp/checkin
app.post('/api/miniapp/checkin', async (req, res) => {
  try {
    const { attendeeCode } = req.body;
    if (!attendeeCode) {
      return res.status(400).json({ error: '签到码不能为空' });
    }

    const activityId = await getCurrentActivityId();
    let attendees = await cloudQueryAll('attendee', { attendeeCode });
    
    // Filter by activity_id
    attendees = filterByActivity(attendees, activityId);
    if (attendees.length === 0) {
      return res.status(404).json({ error: '未找到参会人员' });
    }

    const attendee = attendees[0];
    if (attendee.checkin_status) {
      return res.status(400).json({ error: '该参会人员已签到', attendee });
    }

    const now = new Date().toISOString();
    const docId = attendee._id;

    // Update attendee checkin status
    await cloudUpdate(
      `db.collection("attendee").doc("${docId}").update({data:${JSON.stringify({
        checkin_status: true,
        checkin_time: now,
      })}})`
    );

    // Record checkin log
    await cloudAdd('checkin_log', {
      attendeeId: docId,
      attendeeCode,
      checkinTime: now,
      method: 'miniprogram',
      activity_id: activityId || '',
    });

    res.json({ success: true, message: '签到成功', attendee: { ...attendee, checkin_status: true, checkin_time: now } });
  } catch (err) {
    console.error('[MiniApp Checkin Error]', err);
    res.status(500).json({ error: '签到失败: ' + err.message });
  }
});

// ============================================================
// H5 Web APIs
// ============================================================

// POST /api/h5/queryAttendee
app.post('/api/h5/queryAttendee', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: '手机号不能为空' });
    }

    const activityId = await getCurrentActivityId();
    let attendees = await cloudQueryAll('attendee', { phone });
    
    // Filter by activity_id
    attendees = filterByActivity(attendees, activityId);

    if (attendees.length === 0) {
      return res.status(404).json({ error: '未找到参会人员信息' });
    }

    res.json(attendees);
  } catch (err) {
    console.error('[H5 Query Attendee Error]', err);
    res.status(500).json({ error: '查询参会人员失败: ' + err.message });
  }
});

// GET /api/h5/getActivity
app.get('/api/h5/getActivity', async (req, res) => {
  try {
    const activities = await cloudQueryAll('activity', { is_current: 1 });
    if (activities.length > 0) {
      return res.json(activities[0]);
    }
    const fallback = await cloudQueryAll('activity');
    res.json(fallback.length > 0 ? fallback[0] : {});
  } catch (err) {
    console.error('[H5 Get Activity Error]', err);
    res.status(500).json({ error: '获取活动信息失败: ' + err.message });
  }
});

// GET /api/h5/getSchedules
app.get('/api/h5/getSchedules', async (req, res) => {
  try {
    const activityId = await getCurrentActivityId();
    const whereClause = activityId ? { activity_id: activityId } : {};
    let schedules = await cloudQueryAll('schedule', whereClause, { field: 'sortOrder', order: 'asc' });
    
    // Fallback: include schedules without activity_id
    if (activityId) {
      const allSchedules = await cloudQueryAll('schedule');
      const fbSchedules = allSchedules.filter(s => !s.activity_id);
      schedules = schedules.concat(fbSchedules);
    }
    
    res.json(schedules);
  } catch (err) {
    console.error('[H5 Get Schedules Error]', err);
    res.status(500).json({ error: '获取日程列表失败: ' + err.message });
  }
});

// GET /api/h5/getLiveImages
app.get('/api/h5/getLiveImages', async (req, res) => {
  try {
    const activityId = await getCurrentActivityId();
    let images = await cloudQueryAll('live_image', { visible: true }, { field: 'sortOrder', order: 'asc' });
    
    // Filter by activity_id
    images = filterByActivity(images, activityId);
    
    res.json(images);
  } catch (err) {
    console.error('[H5 Get Live Images Error]', err);
    res.status(500).json({ error: '获取直播图片失败: ' + err.message });
  }
});

// ============================================================
// Start Server
// ============================================================
app.listen(CONFIG.port, '0.0.0.0', () => {
  console.log(`[Server] WeChat Cloud Run server started on port ${CONFIG.port}`);
  console.log(`[Server] Health check: http://localhost:${CONFIG.port}/health`);
  console.log(`[Server] Environment: appId=${CONFIG.appId}, envId=${CONFIG.envId}`);
});

module.exports = app;
