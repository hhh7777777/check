const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const XLSX = require('xlsx');
const crypto = require('crypto');
const fetch = require('node-fetch');
const multer = require('multer');
const path = require('path');
const cloudbase = require('@cloudbase/node-sdk');

const CONFIG = {
  appId: process.env.WX_APPID || '',
  appSecret: process.env.WX_APPSECRET || '',
  envId: process.env.WX_ENV_ID || '',
  jwtSecret: process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'dev-jwt-secret'),
  port: Number(process.env.PORT || 80),
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
  defaultAdminUsername: process.env.ADMIN_DEFAULT_USERNAME || 'admin',
  defaultAdminPassword: process.env.ADMIN_DEFAULT_PASSWORD || 'admin123',
};

if (!CONFIG.jwtSecret) {
  throw new Error('JWT_SECRET is required');
}

if (process.env.NODE_ENV !== 'production' && !process.env.JWT_SECRET) {
  console.warn('JWT_SECRET is not set, using a local development fallback secret.');
}

const COLLECTIONS = {
  activities: 'activities',
  schedules: 'schedules',
  attendees: 'attendees',
  liveImages: 'live_images',
  admins: 'admins',
};

const LEGACY_COLLECTIONS = {
  activities: ['activities', 'activity'],
  schedules: ['schedules', 'schedule'],
  attendees: ['attendees', 'attendee'],
  liveImages: ['live_images', 'live_image'],
  admins: ['admins', 'admin'],
};

const app = express();
const cloud = cloudbase.init({ env: CONFIG.envId || cloudbase.SYMBOL_CURRENT_ENV });
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)),
});
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

let accessTokenCache = { token: '', expiresAt: 0 };

function hasCloudCredentials() {
  return Boolean(CONFIG.envId && CONFIG.appId && CONFIG.appSecret);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizePhone(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}

function validatePhone(phone) {
  return /^[+\d][\d-]{3,20}$/.test(phone);
}

function toDateCode(dateText) {
  const date = new Date(dateText || nowIso());
  const source = Number.isNaN(date.getTime()) ? new Date() : date;
  return `${source.getFullYear()}${String(source.getMonth() + 1).padStart(2, '0')}${String(
    source.getDate()
  ).padStart(2, '0')}`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  if (storedHash.startsWith('scrypt$')) {
    const [, salt, hash] = storedHash.split('$');
    if (!salt || !hash) return false;
    const input = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(input, 'hex'), Buffer.from(hash, 'hex'));
  }
  return sha256(password) === storedHash;
}

async function getAccessToken() {
  const now = Date.now();
  if (accessTokenCache.token && accessTokenCache.expiresAt > now + 600000) {
    return accessTokenCache.token;
  }
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${CONFIG.appId}&secret=${CONFIG.appSecret}`;
  const response = await fetch(url);
  const data = await response.json();
  if (data.errcode) {
    throw new Error(`failed to fetch access token: ${data.errmsg}`);
  }
  accessTokenCache = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return accessTokenCache.token;
}

async function requestDb(endpoint, payload) {
  const token = await getAccessToken();
  const response = await fetch(`https://api.weixin.qq.com/tcb/${endpoint}?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ env: CONFIG.envId, ...payload }),
  });
  const result = await response.json();
  if (result.errcode && result.errcode !== 0) {
    throw new Error(`${endpoint} failed: ${result.errmsg} (${result.errcode})`);
  }
  return result;
}

function stringifyQueryValue(value) {
  if (value instanceof Date) {
    return `new Date("${value.toISOString()}")`;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stringifyQueryValue(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .map(([key, item]) => `${JSON.stringify(key)}:${stringifyQueryValue(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function dbQuery(query) {
  const result = await requestDb('databasequery', { query });
  return Array.isArray(result.data) ? result.data.map((item) => JSON.parse(item)) : [];
}

async function dbQueryAll(collection, where = null, orderBy = null) {
  const rows = [];
  const batchSize = 100;
  let offset = 0;
  while (true) {
    const whereClause = where ? `.where(${stringifyQueryValue(where)})` : '';
    const orderClause = orderBy ? `.orderBy("${orderBy.field}","${orderBy.order || 'asc'}")` : '';
    const query = `db.collection("${collection}")${whereClause}${orderClause}.skip(${offset}).limit(${batchSize}).get()`;
    const batch = await dbQuery(query);
    rows.push(...batch);
    if (batch.length < batchSize) break;
    offset += batchSize;
  }
  return rows;
}

async function dbAdd(collection, data) {
  return requestDb('databaseadd', {
    query: `db.collection("${collection}").add({data:${stringifyQueryValue(data)}})`,
  });
}

async function dbUpdateDoc(collection, id, data) {
  const payload = { ...data };
  delete payload._id;
  delete payload._legacyId;
  return requestDb('databaseupdate', {
    query: `db.collection("${collection}").doc("${id}").update({data:${stringifyQueryValue(payload)}})`,
  });
}

async function dbRemoveDoc(collection, id) {
  return requestDb('databasedelete', {
    query: `db.collection("${collection}").doc("${id}").remove()`,
  });
}

async function getCollectionRows(candidates) {
  for (const name of candidates) {
    try {
      return { collection: name, rows: await dbQueryAll(name) };
    } catch (_error) {
      // try next candidate
    }
  }
  return { collection: candidates[0], rows: [] };
}

function normalizeActivity(item) {
  return {
    _id: item._id,
    title: item.title || item.name || '',
    startTime: item.startTime || item.start_time || '',
    endTime: item.endTime || item.end_time || '',
    location: item.location || '',
    organizer: item.organizer || '',
    coOrganizer: item.coOrganizer || item.co_organizer || '',
    description: item.description || '',
    trafficInfo: item.trafficInfo || item.traffic_info || '',
    mapImageFileID: item.mapImageFileID || item.mapImageFileId || item.mapFileId || '',
    coverImageFileID: item.coverImageFileID || item.coverImageFileId || item.coverFileId || '',
    contactPhone: item.contactPhone || item.contact_phone || '',
    contactPerson: item.contactPerson || item.contact_person || '',
    createdAt: item.createdAt || item.created_at || '',
    updatedAt: item.updatedAt || item.updated_at || '',
    isCurrent: item.isCurrent === true || item.isCurrent === 1 || item.is_current === 1,
  };
}

function normalizeSchedule(item) {
  return {
    _id: item._id,
    activityId: item.activityId || item.activity_id || '',
    date: item.date || '',
    startTime: item.startTime || item.start_time || '',
    endTime: item.endTime || item.end_time || '',
    title: item.title || '',
    location: item.location || '',
    speaker: item.speaker || '',
    remark: item.remark || '',
    sortOrder: Number(item.sortOrder ?? item.sort_order ?? 0),
    createdAt: item.createdAt || item.created_at || '',
    updatedAt: item.updatedAt || item.updated_at || '',
  };
}

function normalizeAttendee(item) {
  const phone = normalizePhone(item.phone);
  return {
    _id: item._id,
    activityId: item.activityId || item.activity_id || '',
    attendeeCode: item.attendeeCode || item.attendee_code || '',
    name: item.name || '',
    phone,
    phoneLast4: item.phoneLast4 || item.phone_last4 || phone.slice(-4),
    organization: item.organization || '',
    identityType: item.identityType || item.identity_type || '',
    seatNo: item.seatNo || item.seat_no || '',
    tableNo: item.tableNo || item.table_no || '',
    diningPlace: item.diningPlace || item.dining_place || item.diningLocation || '',
    hotelName: item.hotelName || item.hotel || item.hotel_name || '',
    roomNo: item.roomNo || item.room_no || '',
    remark: item.remark || '',
    createdAt: item.createdAt || item.created_at || '',
    updatedAt: item.updatedAt || item.updated_at || '',
  };
}

function normalizeLiveImage(item) {
  return {
    _id: item._id,
    activityId: item.activityId || item.activity_id || '',
    title: item.title || '',
    fileID: item.fileID || item.fileId || '',
    sortOrder: Number(item.sortOrder ?? item.sort_order ?? 0),
    isVisible:
      item.isVisible === undefined && item.visible !== undefined
        ? Boolean(item.visible)
        : Boolean(item.isVisible),
    imageUrl: item.imageUrl || item.url || '',
    createdAt: item.createdAt || item.created_at || '',
    updatedAt: item.updatedAt || item.updated_at || '',
  };
}

function normalizeAdmin(item) {
  return {
    _id: item._id,
    username: item.username || '',
    passwordHash: item.passwordHash || item.password_hash || '',
    role: item.role || 'admin',
    createdAt: item.createdAt || item.created_at || '',
  };
}

function attendeePublicView(item) {
  return {
    attendeeCode: item.attendeeCode,
    name: item.name,
    organization: item.organization,
    identityType: item.identityType,
    seatNo: item.seatNo,
    tableNo: item.tableNo,
    diningPlace: item.diningPlace,
    hotelName: item.hotelName,
    roomNo: item.roomNo,
    remark: item.remark,
    qrContent: item.attendeeCode ? `PASS:${item.attendeeCode}` : '',
  };
}

async function getActivities() {
  return (await getCollectionRows(LEGACY_COLLECTIONS.activities)).rows.map(normalizeActivity);
}

async function getActivityById(id) {
  return (await getActivities()).find((item) => item._id === id) || null;
}

async function getCurrentActivity() {
  const activities = await getActivities();
  if (activities.length === 0) return null;
  return (
    activities.find((item) => item.isCurrent) ||
    activities.slice().sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))[0]
  );
}

async function getAdminActivity(req) {
  const requestedId = String(req.headers['x-activity-id'] || req.query.activityId || '').trim();
  if (requestedId) {
    const activity = await getActivityById(requestedId);
    if (!activity) {
      const error = new Error('活动不存在');
      error.statusCode = 404;
      throw error;
    }
    return activity;
  }
  const activity = await getCurrentActivity();
  if (!activity) {
    const error = new Error('请先创建活动');
    error.statusCode = 400;
    throw error;
  }
  return activity;
}

async function getTempUrl(fileId) {
  if (!fileId) return '';
  const result = await cloud.getTempFileURL({ fileList: [fileId] });
  return result.fileList && result.fileList[0] ? result.fileList[0].tempFileURL : '';
}

async function enrichActivity(activity) {
  const next = { ...activity };
  if (next.mapImageFileID) {
    next.mapImageUrl = await getTempUrl(next.mapImageFileID);
  }
  if (next.coverImageFileID) {
    next.coverImageUrl = await getTempUrl(next.coverImageFileID);
  }
  return next;
}

async function enrichImages(images) {
  const fileList = images.map((item) => item.fileID).filter(Boolean);
  if (fileList.length === 0) return images;
  const result = await cloud.getTempFileURL({ fileList });
  const urlMap = new Map((result.fileList || []).map((item) => [item.fileID, item.tempFileURL]));
  return images.map((item) => ({ ...item, imageUrl: item.imageUrl || urlMap.get(item.fileID) || '' }));
}

async function getSchedulesByActivity(activityId) {
  return (await getCollectionRows(LEGACY_COLLECTIONS.schedules)).rows
    .map(normalizeSchedule)
    .filter((item) => item.activityId === activityId)
    .sort((a, b) => a.sortOrder - b.sortOrder || `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
}

async function getAttendeesByActivity(activityId) {
  return (await getCollectionRows(LEGACY_COLLECTIONS.attendees)).rows
    .map(normalizeAttendee)
    .filter((item) => item.activityId === activityId);
}

async function getLiveImagesByActivity(activityId) {
  return (await getCollectionRows(LEGACY_COLLECTIONS.liveImages)).rows
    .map(normalizeLiveImage)
    .filter((item) => item.activityId === activityId)
    .sort((a, b) => a.sortOrder - b.sortOrder || new Date(b.createdAt) - new Date(a.createdAt));
}

async function nextAttendeeCode(activityId) {
  const activity = await getActivityById(activityId);
  const prefix = `A${toDateCode(activity ? activity.startTime || activity.createdAt : nowIso())}`;
  const attendees = await getAttendeesByActivity(activityId);
  const max = attendees.reduce((result, item) => {
    if (item.attendeeCode && item.attendeeCode.startsWith(prefix)) {
      return Math.max(result, Number(item.attendeeCode.slice(prefix.length)) || 0);
    }
    return result;
  }, 0);
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

async function ensureDefaultAdmin() {
  const { collection, rows } = await getCollectionRows(LEGACY_COLLECTIONS.admins);
  const admins = rows.map(normalizeAdmin);
  if (admins.some((item) => item.username === CONFIG.defaultAdminUsername)) return;
  await dbAdd(collection, {
    username: CONFIG.defaultAdminUsername,
    passwordHash: hashPassword(CONFIG.defaultAdminPassword),
    role: 'admin',
    createdAt: nowIso(),
  });
}

async function seedBaseData() {
  if (!hasCloudCredentials()) {
    console.warn('WX_ENV_ID / WX_APPID / WX_APPSECRET not set, skipping cloud seed during local startup.');
    return;
  }
  await ensureDefaultAdmin();
  const activities = await getActivities();
  if (activities.length === 0) {
    await dbAdd(COLLECTIONS.activities, {
      title: '内部活动',
      startTime: '',
      endTime: '',
      location: '',
      organizer: '',
      coOrganizer: '',
      description: '',
      trafficInfo: '',
      mapImageFileID: '',
      coverImageFileID: '',
      contactPhone: '',
      contactPerson: '',
      isCurrent: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }
}

async function migrateLegacyData() {
  const oldActivities = (await getCollectionRows(['activity'])).rows;
  const oldSchedules = (await getCollectionRows(['schedule'])).rows;
  const oldAttendees = (await getCollectionRows(['attendee'])).rows;
  const oldImages = (await getCollectionRows(['live_image'])).rows;
  const oldAdmins = (await getCollectionRows(['admin'])).rows;
  const currentActivities = await dbQueryAll(COLLECTIONS.activities).catch(() => []);
  const activityMap = new Map(currentActivities.map((item) => [item._legacyId, item._id]));

  for (const raw of oldActivities) {
    if (activityMap.has(raw._id)) continue;
    const normalized = normalizeActivity(raw);
    const result = await dbAdd(COLLECTIONS.activities, {
      ...normalized,
      _legacyId: raw._id,
      createdAt: normalized.createdAt || nowIso(),
      updatedAt: normalized.updatedAt || nowIso(),
    });
    const createdId = result.id_list && result.id_list[0];
    if (createdId) activityMap.set(raw._id, createdId);
  }

  const migratedSchedules = await dbQueryAll(COLLECTIONS.schedules).catch(() => []);
  for (const raw of oldSchedules) {
    if (migratedSchedules.some((item) => item._legacyId === raw._id)) continue;
    const normalized = normalizeSchedule(raw);
    await dbAdd(COLLECTIONS.schedules, {
      ...normalized,
      activityId: activityMap.get(normalized.activityId) || normalized.activityId || '',
      _legacyId: raw._id,
      createdAt: normalized.createdAt || nowIso(),
      updatedAt: normalized.updatedAt || nowIso(),
    });
  }

  const migratedAttendees = await dbQueryAll(COLLECTIONS.attendees).catch(() => []);
  for (const raw of oldAttendees) {
    if (migratedAttendees.some((item) => item._legacyId === raw._id)) continue;
    const normalized = normalizeAttendee(raw);
    const activityId = activityMap.get(normalized.activityId) || normalized.activityId || '';
    const attendeeCode = normalized.attendeeCode || (activityId ? await nextAttendeeCode(activityId) : '');
    await dbAdd(COLLECTIONS.attendees, {
      ...normalized,
      attendeeCode,
      activityId,
      _legacyId: raw._id,
      createdAt: normalized.createdAt || nowIso(),
      updatedAt: normalized.updatedAt || nowIso(),
    });
  }

  const migratedImages = await dbQueryAll(COLLECTIONS.liveImages).catch(() => []);
  for (const raw of oldImages) {
    if (migratedImages.some((item) => item._legacyId === raw._id)) continue;
    const normalized = normalizeLiveImage(raw);
    await dbAdd(COLLECTIONS.liveImages, {
      ...normalized,
      activityId: activityMap.get(normalized.activityId) || normalized.activityId || '',
      _legacyId: raw._id,
      createdAt: normalized.createdAt || nowIso(),
      updatedAt: normalized.updatedAt || nowIso(),
    });
  }

  const migratedAdmins = await dbQueryAll(COLLECTIONS.admins).catch(() => []);
  for (const raw of oldAdmins) {
    const normalized = normalizeAdmin(raw);
    if (migratedAdmins.some((item) => item.username === normalized.username)) continue;
    await dbAdd(COLLECTIONS.admins, {
      ...normalized,
      _legacyId: raw._id,
      createdAt: normalized.createdAt || nowIso(),
    });
  }

  await ensureDefaultAdmin();
}

async function parseImportRows(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rows.map((row) => ({
    name: normalizeText(row['姓名'] ?? row.name),
    phone: normalizePhone(row['手机号'] ?? row.phone),
    organization: normalizeText(row['单位'] ?? row.organization),
    identityType: normalizeText(row['身份类型'] ?? row.identityType),
    seatNo: normalizeText(row['座位号'] ?? row.seatNo),
    tableNo: normalizeText(row['餐桌号'] ?? row.tableNo),
    diningPlace: normalizeText(row['用餐地点'] ?? row.diningPlace),
    hotelName: normalizeText(row['酒店名称'] ?? row.hotelName),
    roomNo: normalizeText(row['房间号'] ?? row.roomNo),
    remark: normalizeText(row['备注'] ?? row.remark),
  }));
}

async function importAttendees(activityId, rows) {
  const current = await getAttendeesByActivity(activityId);
  const seen = new Set();
  const errors = [];
  let imported = 0;
  let nextCode = null;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNo = index + 2;
    if (!row.name || !row.phone) {
      errors.push({ row: rowNo, message: '姓名和手机号不能为空' });
      continue;
    }
    if (!validatePhone(row.phone)) {
      errors.push({ row: rowNo, message: '手机号格式不正确' });
      continue;
    }
    const uniqueKey = `${row.name}::${row.phone}`;
    if (seen.has(uniqueKey)) {
      errors.push({ row: rowNo, message: 'Excel 内存在重复人员' });
      continue;
    }
    seen.add(uniqueKey);
    if (current.some((item) => item.name === row.name && item.phone === row.phone)) {
      errors.push({ row: rowNo, message: '该人员已存在于当前活动' });
      continue;
    }
    if (!nextCode) {
      nextCode = await nextAttendeeCode(activityId);
    } else {
      nextCode = `${nextCode.slice(0, -4)}${String(Number(nextCode.slice(-4)) + 1).padStart(4, '0')}`;
    }
    await dbAdd(COLLECTIONS.attendees, {
      activityId,
      attendeeCode: nextCode,
      name: row.name,
      phone: row.phone,
      phoneLast4: row.phone.slice(-4),
      organization: row.organization,
      identityType: row.identityType,
      seatNo: row.seatNo,
      tableNo: row.tableNo,
      diningPlace: row.diningPlace,
      hotelName: row.hotelName,
      roomNo: row.roomNo,
      remark: row.remark,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    imported += 1;
  }

  return { imported, errors };
}

function requireFields(body, fields) {
  for (const field of fields) {
    if (!normalizeText(body[field])) {
      const error = new Error(`${field} is required`);
      error.statusCode = 400;
      throw error;
    }
  }
}

async function updateActivityRecord(activityId, body) {
  const current = await getActivityById(activityId);
  if (!current) {
    const error = new Error('活动不存在');
    error.statusCode = 404;
    throw error;
  }
  await dbUpdateDoc(COLLECTIONS.activities, activityId, {
    ...current,
    title: normalizeText(body.title ?? current.title),
    startTime: normalizeText(body.startTime ?? current.startTime),
    endTime: normalizeText(body.endTime ?? current.endTime),
    location: normalizeText(body.location ?? current.location),
    organizer: normalizeText(body.organizer ?? current.organizer),
    coOrganizer: normalizeText(body.coOrganizer ?? current.coOrganizer),
    description: normalizeText(body.description ?? current.description),
    trafficInfo: normalizeText(body.trafficInfo ?? current.trafficInfo),
    mapImageFileID: normalizeText(body.mapImageFileID ?? current.mapImageFileID),
    coverImageFileID: normalizeText(body.coverImageFileID ?? current.coverImageFileID),
    contactPhone: normalizeText(body.contactPhone ?? current.contactPhone),
    contactPerson: normalizeText(body.contactPerson ?? current.contactPerson),
    updatedAt: nowIso(),
  });
}

async function sendPublicActivity(_req, res) {
  const activity = await getCurrentActivity();
  res.json(activity ? await enrichActivity(activity) : {});
}

async function sendPublicSchedules(_req, res) {
  const activity = await getCurrentActivity();
  res.json(activity ? await getSchedulesByActivity(activity._id) : []);
}

async function sendPublicAttendee(req, res) {
  requireFields(req.body, ['name', 'phoneLast4']);
  const activity = await getCurrentActivity();
  if (!activity) {
    res.status(404).json({ error: '当前没有可用活动' });
    return;
  }
  const phoneLast4 = normalizeText(req.body.phoneLast4);
  if (phoneLast4.length !== 4) {
    res.status(400).json({ error: '手机号后四位格式不正确' });
    return;
  }
  const attendees = await getAttendeesByActivity(activity._id);
  const target = attendees.find(
    (item) => item.name === normalizeText(req.body.name) && item.phoneLast4 === phoneLast4
  );
  if (!target) {
    res.status(404).json({ error: '暂未查询到您的参会信息，请联系工作人员。' });
    return;
  }
  res.json(attendeePublicView(target));
}

async function sendPublicImages(_req, res) {
  const activity = await getCurrentActivity();
  if (!activity) {
    res.json([]);
    return;
  }
  const images = (await getLiveImagesByActivity(activity._id)).filter((item) => item.isVisible);
  res.json(await enrichImages(images));
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    res.status(401).json({ error: '未登录或登录已失效' });
    return;
  }
  try {
    req.admin = jwt.verify(header.slice(7), CONFIG.jwtSecret);
    next();
  } catch (_error) {
    res.status(401).json({ error: '未登录或登录已失效' });
  }
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || CONFIG.corsOrigins.length === 0 || CONFIG.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS blocked'));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', async (_req, res, next) => {
  try {
    const current = await getCurrentActivity();
    res.json({ status: 'ok', currentActivityId: current ? current._id : null, timestamp: nowIso() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/login', async (req, res, next) => {
  try {
    requireFields(req.body, ['username', 'password']);
    await ensureDefaultAdmin();
    const admins = (await getCollectionRows(LEGACY_COLLECTIONS.admins)).rows.map(normalizeAdmin);
    const admin = admins.find((item) => item.username === req.body.username);
    if (!admin || !verifyPassword(req.body.password, admin.passwordHash)) {
      res.status(401).json({ error: '用户名或密码错误' });
      return;
    }
    const token = jwt.sign(
      { adminId: admin._id, username: admin.username, role: admin.role },
      CONFIG.jwtSecret,
      { expiresIn: '24h' }
    );
    res.json({ token, admin: { username: admin.username, role: admin.role } });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/dashboard', authMiddleware, async (req, res, next) => {
  try {
    const activity = await getAdminActivity(req);
    const attendees = await getAttendeesByActivity(activity._id);
    const images = await getLiveImagesByActivity(activity._id);
    res.json({
      activity: await enrichActivity(activity),
      attendeeCount: attendees.length,
      liveImageCount: images.length,
      updatedAt: activity.updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/activities', authMiddleware, async (_req, res, next) => {
  try {
    const activities = await getActivities();
    const attendees = (await getCollectionRows(LEGACY_COLLECTIONS.attendees)).rows.map(normalizeAttendee);
    const images = (await getCollectionRows(LEGACY_COLLECTIONS.liveImages)).rows.map(normalizeLiveImage);
    res.json(
      activities
        .map((activity) => ({
          ...activity,
          attendeeCount: attendees.filter((item) => item.activityId === activity._id).length,
          liveImageCount: images.filter((item) => item.activityId === activity._id).length,
        }))
        .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || new Date(b.updatedAt) - new Date(a.updatedAt))
    );
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/activities', authMiddleware, async (req, res, next) => {
  try {
    requireFields(req.body, ['title']);
    const activities = await getActivities();
    await dbAdd(COLLECTIONS.activities, {
      title: normalizeText(req.body.title),
      startTime: normalizeText(req.body.startTime),
      endTime: normalizeText(req.body.endTime),
      location: normalizeText(req.body.location),
      organizer: normalizeText(req.body.organizer),
      coOrganizer: normalizeText(req.body.coOrganizer),
      description: normalizeText(req.body.description),
      trafficInfo: normalizeText(req.body.trafficInfo),
      mapImageFileID: normalizeText(req.body.mapImageFileID),
      coverImageFileID: normalizeText(req.body.coverImageFileID),
      contactPhone: normalizeText(req.body.contactPhone),
      contactPerson: normalizeText(req.body.contactPerson),
      isCurrent: activities.length === 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/activities/:id', authMiddleware, async (req, res, next) => {
  try {
    const activity = await getActivityById(req.params.id);
    if (!activity) {
      res.status(404).json({ error: '活动不存在' });
      return;
    }
    res.json(await enrichActivity(activity));
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/activities/:id', authMiddleware, async (req, res, next) => {
  try {
    await updateActivityRecord(req.params.id, req.body);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/activities/:id/activate', authMiddleware, async (req, res, next) => {
  try {
    const activities = await getActivities();
    if (!activities.some((item) => item._id === req.params.id)) {
      res.status(404).json({ error: '活动不存在' });
      return;
    }
    for (const item of activities) {
      await dbUpdateDoc(COLLECTIONS.activities, item._id, {
        ...item,
        isCurrent: item._id === req.params.id,
        updatedAt: nowIso(),
      });
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/activities/:id', authMiddleware, async (req, res, next) => {
  try {
    const activity = await getActivityById(req.params.id);
    if (!activity) {
      res.status(404).json({ error: '活动不存在' });
      return;
    }
    if (activity.isCurrent) {
      res.status(400).json({ error: '当前活动不能删除，请先切换到其他活动' });
      return;
    }
    const schedules = await getSchedulesByActivity(activity._id);
    const attendees = await getAttendeesByActivity(activity._id);
    const images = await getLiveImagesByActivity(activity._id);
    if (schedules.length || attendees.length || images.length) {
      res.status(400).json({ error: '该活动下仍有数据，请先清理日程、参会人和直播图片' });
      return;
    }
    await dbRemoveDoc(COLLECTIONS.activities, activity._id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/activity', authMiddleware, async (req, res, next) => {
  try {
    const activity = await getAdminActivity(req);
    res.json(await enrichActivity(activity));
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/activity', authMiddleware, async (req, res, next) => {
  try {
    const activity = await getAdminActivity(req);
    await updateActivityRecord(activity._id, req.body);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/schedules', authMiddleware, async (req, res, next) => {
  try {
    const activity = await getAdminActivity(req);
    res.json(await getSchedulesByActivity(activity._id));
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/schedules', authMiddleware, async (req, res, next) => {
  try {
    const activity = await getAdminActivity(req);
    requireFields(req.body, ['date', 'startTime', 'endTime', 'title']);
    await dbAdd(COLLECTIONS.schedules, {
      activityId: activity._id,
      date: normalizeText(req.body.date),
      startTime: normalizeText(req.body.startTime),
      endTime: normalizeText(req.body.endTime),
      title: normalizeText(req.body.title),
      location: normalizeText(req.body.location),
      speaker: normalizeText(req.body.speaker),
      remark: normalizeText(req.body.remark),
      sortOrder: Number(req.body.sortOrder || 0),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/schedules/:id', authMiddleware, async (req, res, next) => {
  try {
    const schedules = (await getCollectionRows(LEGACY_COLLECTIONS.schedules)).rows.map(normalizeSchedule);
    const target = schedules.find((item) => item._id === req.params.id);
    if (!target) {
      res.status(404).json({ error: '日程不存在' });
      return;
    }
    await dbUpdateDoc(COLLECTIONS.schedules, target._id, {
      ...target,
      date: normalizeText(req.body.date ?? target.date),
      startTime: normalizeText(req.body.startTime ?? target.startTime),
      endTime: normalizeText(req.body.endTime ?? target.endTime),
      title: normalizeText(req.body.title ?? target.title),
      location: normalizeText(req.body.location ?? target.location),
      speaker: normalizeText(req.body.speaker ?? target.speaker),
      remark: normalizeText(req.body.remark ?? target.remark),
      sortOrder: Number(req.body.sortOrder ?? target.sortOrder ?? 0),
      updatedAt: nowIso(),
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/schedules/:id', authMiddleware, async (req, res, next) => {
  try {
    await dbRemoveDoc(COLLECTIONS.schedules, req.params.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/attendees', authMiddleware, async (req, res, next) => {
  try {
    const activity = await getAdminActivity(req);
    const keyword = normalizeText(req.query.keyword || '');
    let attendees = await getAttendeesByActivity(activity._id);
    if (keyword) {
      attendees = attendees.filter((item) =>
        [item.name, item.phone, item.organization, item.attendeeCode].some((field) => field.includes(keyword))
      );
    }
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.pageSize || 10);
    res.json({
      list: attendees.slice((page - 1) * pageSize, page * pageSize),
      total: attendees.length,
      page,
      pageSize,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/attendees/import', authMiddleware, excelUpload.single('file'), async (req, res, next) => {
  try {
    const activity = await getAdminActivity(req);
    if (!req.file) {
      res.status(400).json({ error: '请上传 Excel 文件' });
      return;
    }
    const rows = await parseImportRows(req.file.buffer);
    res.json(await importAttendees(activity._id, rows));
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/attendees/:id', authMiddleware, async (req, res, next) => {
  try {
    const attendees = (await getCollectionRows(LEGACY_COLLECTIONS.attendees)).rows.map(normalizeAttendee);
    const target = attendees.find((item) => item._id === req.params.id);
    if (!target) {
      res.status(404).json({ error: '参会人员不存在' });
      return;
    }
    const phone = normalizePhone(req.body.phone ?? target.phone);
    if (!validatePhone(phone)) {
      res.status(400).json({ error: '手机号格式不正确' });
      return;
    }
    await dbUpdateDoc(COLLECTIONS.attendees, target._id, {
      ...target,
      name: normalizeText(req.body.name ?? target.name),
      phone,
      phoneLast4: phone.slice(-4),
      organization: normalizeText(req.body.organization ?? target.organization),
      identityType: normalizeText(req.body.identityType ?? target.identityType),
      seatNo: normalizeText(req.body.seatNo ?? target.seatNo),
      tableNo: normalizeText(req.body.tableNo ?? target.tableNo),
      diningPlace: normalizeText(req.body.diningPlace ?? target.diningPlace),
      hotelName: normalizeText(req.body.hotelName ?? target.hotelName),
      roomNo: normalizeText(req.body.roomNo ?? target.roomNo),
      remark: normalizeText(req.body.remark ?? target.remark),
      updatedAt: nowIso(),
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/attendees/:id', authMiddleware, async (req, res, next) => {
  try {
    await dbRemoveDoc(COLLECTIONS.attendees, req.params.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/attendees/export', authMiddleware, async (req, res, next) => {
  try {
    const activity = await getAdminActivity(req);
    const rows = (await getAttendeesByActivity(activity._id)).map((item) => ({
      姓名: item.name,
      手机号: item.phone,
      单位: item.organization,
      身份类型: item.identityType,
      座位号: item.seatNo,
      餐桌号: item.tableNo,
      用餐地点: item.diningPlace,
      酒店名称: item.hotelName,
      房间号: item.roomNo,
      备注: item.remark,
      参会码: item.attendeeCode,
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, '参会人员');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent('attendees.xlsx')}`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/live-images', authMiddleware, imageUpload.single('file'), async (req, res, next) => {
  try {
    const activity = await getAdminActivity(req);
    if (!req.file) {
      res.status(400).json({ error: '请上传图片' });
      return;
    }
    const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
    const cloudPath = `event/live/${activity._id}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    const uploaded = await cloud.uploadFile({ cloudPath, fileContent: req.file.buffer });
    await dbAdd(COLLECTIONS.liveImages, {
      activityId: activity._id,
      title: normalizeText(req.body.title),
      fileID: uploaded.fileID,
      sortOrder: Number(req.body.sortOrder || 0),
      isVisible: req.body.isVisible === undefined ? true : String(req.body.isVisible) === 'true',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/live-images', authMiddleware, async (req, res, next) => {
  try {
    const activity = await getAdminActivity(req);
    res.json(await enrichImages(await getLiveImagesByActivity(activity._id)));
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/live-images/:id', authMiddleware, async (req, res, next) => {
  try {
    const images = (await getCollectionRows(LEGACY_COLLECTIONS.liveImages)).rows.map(normalizeLiveImage);
    const target = images.find((item) => item._id === req.params.id);
    if (!target) {
      res.status(404).json({ error: '直播图片不存在' });
      return;
    }
    await dbUpdateDoc(COLLECTIONS.liveImages, target._id, {
      ...target,
      title: normalizeText(req.body.title ?? target.title),
      sortOrder: Number(req.body.sortOrder ?? target.sortOrder ?? 0),
      isVisible:
        req.body.isVisible === undefined
          ? target.isVisible
          : req.body.isVisible === true || req.body.isVisible === 'true',
      updatedAt: nowIso(),
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/live-images/:id', authMiddleware, async (req, res, next) => {
  try {
    const images = (await getCollectionRows(LEGACY_COLLECTIONS.liveImages)).rows.map(normalizeLiveImage);
    const target = images.find((item) => item._id === req.params.id);
    if (!target) {
      res.status(404).json({ error: '直播图片不存在' });
      return;
    }
    if (target.fileID) {
      await cloud.deleteFile({ fileList: [target.fileID] }).catch(() => null);
    }
    await dbRemoveDoc(COLLECTIONS.liveImages, target._id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/upload', authMiddleware, imageUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: '请上传图片' });
      return;
    }
    const folder = normalizeText(req.body.folder) || 'activity';
    const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
    const cloudPath = `event/${folder}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    const uploaded = await cloud.uploadFile({ cloudPath, fileContent: req.file.buffer });
    res.json({ fileID: uploaded.fileID, imageUrl: await getTempUrl(uploaded.fileID) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/activity', async (req, res, next) => {
  try {
    await sendPublicActivity(req, res);
  } catch (error) {
    next(error);
  }
});

app.get('/api/schedules', async (req, res, next) => {
  try {
    await sendPublicSchedules(req, res);
  } catch (error) {
    next(error);
  }
});

app.post('/api/attendee/query', async (req, res, next) => {
  try {
    await sendPublicAttendee(req, res);
  } catch (error) {
    next(error);
  }
});

app.get('/api/attendee/code/:attendeeCode', async (req, res, next) => {
  try {
    const activity = await getCurrentActivity();
    if (!activity) {
      res.status(404).json({ error: '当前没有可用活动' });
      return;
    }
    const attendees = await getAttendeesByActivity(activity._id);
    const target = attendees.find((item) => item.attendeeCode === req.params.attendeeCode);
    if (!target) {
      res.status(404).json({ error: '未找到参会信息' });
      return;
    }
    res.json(attendeePublicView(target));
  } catch (error) {
    next(error);
  }
});

app.get('/api/live-images', async (req, res, next) => {
  try {
    await sendPublicImages(req, res);
  } catch (error) {
    next(error);
  }
});

app.get('/api/miniapp/getActivity', async (req, res, next) => {
  try {
    await sendPublicActivity(req, res);
  } catch (error) {
    next(error);
  }
});
app.get('/api/miniapp/getSchedules', async (req, res, next) => {
  try {
    await sendPublicSchedules(req, res);
  } catch (error) {
    next(error);
  }
});
app.get('/api/miniapp/getLiveImages', async (req, res, next) => {
  try {
    await sendPublicImages(req, res);
  } catch (error) {
    next(error);
  }
});
app.post('/api/miniapp/queryAttendee', async (req, res, next) => {
  try {
    req.body = { name: req.body.name, phoneLast4: req.body.phoneLast4 || req.body.last4 };
    await sendPublicAttendee(req, res);
  } catch (error) {
    next(error);
  }
});

app.get('/api/h5/getActivity', async (req, res, next) => {
  try {
    await sendPublicActivity(req, res);
  } catch (error) {
    next(error);
  }
});
app.get('/api/h5/getSchedules', async (req, res, next) => {
  try {
    await sendPublicSchedules(req, res);
  } catch (error) {
    next(error);
  }
});
app.get('/api/h5/getLiveImages', async (req, res, next) => {
  try {
    await sendPublicImages(req, res);
  } catch (error) {
    next(error);
  }
});
app.post('/api/h5/queryAttendee', async (req, res, next) => {
  try {
    req.body = { name: req.body.name, phoneLast4: req.body.phoneLast4 || req.body.last4 };
    await sendPublicAttendee(req, res);
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;
  console.error(error);
  res.status(statusCode).json({ error: error.message || '服务异常' });
});

async function startServer() {
  await seedBaseData();
  app.listen(CONFIG.port, '0.0.0.0', () => {
    console.log(`cloudrun listening on ${CONFIG.port}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  app,
  seedBaseData,
  migrateLegacyData,
  ensureDefaultAdmin,
};
