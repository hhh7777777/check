try { require('dotenv').config() } catch (_) {}
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const XLSX = require('xlsx');
const crypto = require('crypto');
const fetch = require('node-fetch');
const multer = require('multer');
const path = require('path');
const FormData = require('form-data');
const cloudbase = require('@cloudbase/node-sdk');

const CONFIG = {
  appId: process.env.WX_APPID || '',
  appSecret: process.env.WX_APPSECRET || '',
  envId: process.env.WX_ENV_ID || '',
  jwtSecret: process.env.JWT_SECRET || '',
  port: Number(process.env.PORT || 80),
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean)
    : ['*'],
  defaultAdminUsername: process.env.ADMIN_DEFAULT_USERNAME || 'admin',
  defaultAdminPassword: process.env.ADMIN_DEFAULT_PASSWORD || 'admin123',
};

if (!CONFIG.jwtSecret) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }
  CONFIG.jwtSecret = 'dev-jwt-secret';
  console.warn('⚠ JWT_SECRET is not set. Using development fallback. Do NOT deploy to production without setting JWT_SECRET.');
}

const COLLECTIONS = {
  activities: 'activity',
  schedules: 'schedule',
  attendees: 'attendee',
  liveImages: 'live_image',
  admins: 'admin',
};

const LEGACY_COLLECTIONS = {
  activities: ['activity', 'activities'],
  schedules: ['schedule', 'schedules'],
  attendees: ['attendee', 'attendees'],
  liveImages: ['live_image', 'live_images'],
  admins: ['admin', 'admins'],
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
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf')),
});

let accessTokenCache = { token: '', expiresAt: 0 };
let accessTokenPromise = null;

function hasCloudCredentials() {
  return Boolean(CONFIG.envId && CONFIG.appId && CONFIG.appSecret);
}

function getMissingCloudCredentials() {
  const missing = [];
  if (!CONFIG.envId) missing.push('WX_ENV_ID');
  if (!CONFIG.appId) missing.push('WX_APPID');
  if (!CONFIG.appSecret) missing.push('WX_APPSECRET');
  return missing;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizePhone(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/[０-９＋]/g, (character) => {
      if (character === '＋') return '+';
      return String(character.charCodeAt(0) - 0xFF10);
    })
    .replace(/[()\s-]/g, '')
    .replace(/^00(\d+)/, '+$1');
  return /^\+86(1[3-9]\d{9})$/.test(normalized) ? normalized.slice(3) : normalized;
}

function validatePhone(phone) {
  if (!phone) return false;
  return /^1[3-9]\d{9}$/.test(phone) || /^\+[1-9]\d{6,14}$/.test(phone);
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
  const missing = getMissingCloudCredentials();
  if (missing.length > 0) {
    throw new Error(`cloudrun missing required env vars: ${missing.join(', ')}`);
  }
  const now = Date.now();
  if (accessTokenCache.token && accessTokenCache.expiresAt > now + 600000) {
    return accessTokenCache.token;
  }
  if (accessTokenPromise) return accessTokenPromise;
  accessTokenPromise = (async () => {
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
  })().finally(() => { accessTokenPromise = null; });
  return accessTokenPromise;
}

async function requestDb(endpoint, payload, retries = 1) {
  const token = await getAccessToken();
  const response = await fetch(`https://api.weixin.qq.com/tcb/${endpoint}?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ env: CONFIG.envId, ...payload }),
  });
  const result = await response.json();
  if (result.errcode && result.errcode !== 0) {
    if (result.errcode === 40001 && retries > 0) {
      accessTokenCache = { token: '', expiresAt: 0 };
      return requestDb(endpoint, payload, retries - 1);
    }
    throw new Error(`${endpoint} failed: ${result.errmsg} (${result.errcode})`);
  }
  return result;
}

function stringifyQueryValue(value) {
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
    const whereClause = where ? `.where(${JSON.stringify(where)})` : '';
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
  const dataStr = JSON.stringify(data);
  return requestDb('databaseadd', {
    query: `db.collection("${collection}").add({data:${dataStr}})`,
  });
}

async function dbUpdateDoc(collection, id, data) {
  const payload = { ...data };
  delete payload._id;
  delete payload._legacyId;
  const dataStr = JSON.stringify(payload);
  const query = `db.collection("${collection}").doc("${id}").update({data:${dataStr}})`;
  return requestDb('databaseupdate', { query });
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

function sz(v) {
  return String(v || '')
    .replace(/\n/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/"/g, "'")
    .replace(/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF]/g, '')
    .trim();
}

function normalizeActivity(item) {
  return {
    _id: item._id,
    title: sz(item.title || item.name),
    startTime: item.startTime || item.start_time || '',
    endTime: item.endTime || item.end_time || '',
    location: sz(item.location),
    organizer: sz(item.organizer),
    coOrganizer: sz(item.coOrganizer || item.co_organizer),
    description: sz(item.description),
    trafficInfo: sz(item.trafficInfo || item.traffic_info),
    mapImageFileID: item.mapImageFileID || item.mapImageFileId || item.mapFileId || '',
    coverImageFileID: item.coverImageFileID || item.coverImageFileId || item.coverFileId || '',
    contactPhone: item.contactPhone || item.contact_phone || '',
    contactPerson: sz(item.contactPerson || item.contact_person),
    latitude: Number(item.latitude || 0),
    longitude: Number(item.longitude || 0),
    globalBgImageFileID: item.globalBgImageFileID || '',
    introBgImageFileID: item.introBgImageFileID || '',
    scheduleBgImageFileID: item.scheduleBgImageFileID || '',
    badgeBgImageFileID: item.badgeBgImageFileID || '',
    seatingBgImageFileID: item.seatingBgImageFileID || '',
    routeBgImageFileID: item.routeBgImageFileID || '',
    liveBgImageFileID: item.liveBgImageFileID || '',
    routePdfFileID: item.routePdfFileID || '',
    globalTextColor: item.globalTextColor || '',
    cardTitleColor: item.cardTitleColor || '',
    cardSubtitleColor: item.cardSubtitleColor || '',
    primaryColor: item.primaryColor || '',
    accentColor: item.accentColor || '',
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
    remark: item.remark || '',
    checkedIn:
      item.checkedIn === true ||
      item.checkedIn === 1 ||
      item.checked_in === true ||
      item.checked_in === 1,
    checkedInAt: item.checkedInAt || item.checked_in_at || '',
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
  const username = item.username || '';
  const isDefaultSuperAdmin = username === CONFIG.defaultAdminUsername;
  return {
    _id: item._id,
    username,
    passwordHash: item.passwordHash || item.password_hash || '',
    name: item.name || item.realName || item.real_name || '',
    department: item.department || '',
    role: isDefaultSuperAdmin ? 'superadmin' : 'user',
    status: item.status || 'active',
    mustChangePassword: Boolean(item.mustChangePassword),
    approvedBy: item.approvedBy || '',
    approvedAt: item.approvedAt || '',
    lastLoginAt: item.lastLoginAt || '',
    createdAt: item.createdAt || item.created_at || '',
    updatedAt: item.updatedAt || item.updated_at || '',
  };
}

function adminPublicView(admin) {
  return {
    _id: admin._id,
    username: admin.username,
    name: admin.name,
    department: admin.department,
    role: admin.role,
    status: admin.status,
    mustChangePassword: admin.mustChangePassword,
    approvedBy: admin.approvedBy,
    approvedAt: admin.approvedAt,
    lastLoginAt: admin.lastLoginAt,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
  };
}

function validateUsername(username) {
  return /^[A-Za-z0-9_.-]{3,32}$/.test(username);
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 72
    && /[A-Za-z]/.test(password) && /\d/.test(password);
}

function attendeePublicView(item) {
  return {
    activityId: item.activityId,
    attendeeCode: item.attendeeCode,
    name: item.name,
    organization: item.organization,
    identityType: item.identityType,
    seatNo: item.seatNo,
    remark: item.remark,
    qrContent: item.attendeeCode ? `PASS:${item.attendeeCode}` : '',
  };
}

async function markAttendeeCheckedIn(item, source = 'query') {
  if (!item || item.checkedIn) {
    return item;
  }
  const checkedInAt = nowIso();
  await dbUpdateDoc(COLLECTIONS.attendees, item._id, {
    ...item,
    checkedIn: true,
    checkedInAt,
    checkInSource: source,
    updatedAt: checkedInAt,
  });
  return {
    ...item,
    checkedIn: true,
    checkedInAt,
    checkInSource: source,
    updatedAt: checkedInAt,
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
  const token = await getAccessToken();
  const response = await fetch(`https://api.weixin.qq.com/tcb/batchdownloadfile?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      env: CONFIG.envId,
      file_list: [{ fileid: fileId, max_age: 7200 }],
    }),
  });
  const result = await response.json();
  if (result.errcode && result.errcode !== 0) {
    throw new Error(`获取云存储访问地址失败: ${result.errmsg} (${result.errcode})`);
  }
  const item = result.file_list && result.file_list[0];
  return item ? item.download_url || item.tempFileURL || '' : '';
}

async function uploadCloudFile(cloudPath, fileContent, contentType = 'application/octet-stream') {
  const token = await getAccessToken();
  const metadataResponse = await fetch(`https://api.weixin.qq.com/tcb/uploadfile?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ env: CONFIG.envId, path: cloudPath }),
  });
  const upload = await metadataResponse.json();
  if (upload.errcode && upload.errcode !== 0) {
    throw new Error(`获取云存储上传信息失败: ${upload.errmsg} (${upload.errcode})`);
  }
  if (!upload.url || !upload.file_id || !upload.authorization || !upload.token || !upload.cos_file_id) {
    throw new Error('获取云存储上传信息失败：返回数据不完整');
  }
  const form = new FormData();
  form.append('key', cloudPath);
  form.append('Signature', upload.authorization);
  form.append('x-cos-security-token', upload.token);
  form.append('x-cos-meta-fileid', upload.cos_file_id);
  form.append('file', fileContent, {
    filename: path.basename(cloudPath),
    contentType,
    knownLength: fileContent.length,
  });
  const response = await fetch(upload.url, {
    method: 'POST',
    headers: form.getHeaders(),
    body: form,
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`云存储上传失败 (${response.status}): ${detail}`);
  }
  return { fileID: upload.file_id };
}

async function enrichActivity(activity) {
  const next = { ...activity };
  if (next.mapImageFileID) {
    next.mapImageUrl = await getTempUrl(next.mapImageFileID);
  }
  if (next.coverImageFileID) {
    next.coverImageUrl = await getTempUrl(next.coverImageFileID);
  }
  const bgFields = ['globalBgImageFileID', 'introBgImageFileID', 'scheduleBgImageFileID', 'badgeBgImageFileID', 'seatingBgImageFileID', 'routeBgImageFileID', 'liveBgImageFileID'];
  for (const field of bgFields) {
    if (next[field]) {
      next[field.replace('FileID', 'Url')] = await getTempUrl(next[field]);
    }
  }
  if (next.routePdfFileID) {
    next.routePdfUrl = await getTempUrl(next.routePdfFileID);
  }
  return next;
}

async function enrichImages(images) {
  return Promise.all(
    images.map(async (item) => ({
      ...item,
      imageUrl: item.imageUrl || (item.fileID ? await getTempUrl(item.fileID) : ''),
    }))
  );
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
  const existing = admins.find((item) => item.username === CONFIG.defaultAdminUsername);
  if (existing) {
    return;
  }
  await dbAdd(collection, {
    username: CONFIG.defaultAdminUsername,
    passwordHash: hashPassword(CONFIG.defaultAdminPassword),
    name: '超级管理员',
    department: '系统管理',
    role: 'superadmin',
    status: 'active',
    mustChangePassword: CONFIG.defaultAdminPassword === 'admin123',
    createdAt: nowIso(),
    updatedAt: nowIso(),
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
      remark: row.remark,
      checkedIn: false,
      checkedInAt: '',
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
  const allowed = ['title', 'startTime', 'endTime', 'location', 'organizer', 'coOrganizer', 'description', 'trafficInfo', 'mapImageFileID', 'coverImageFileID', 'contactPhone', 'contactPerson', 'latitude', 'longitude', 'globalBgImageFileID', 'introBgImageFileID', 'scheduleBgImageFileID', 'badgeBgImageFileID', 'seatingBgImageFileID', 'routeBgImageFileID', 'liveBgImageFileID', 'routePdfFileID', 'globalTextColor', 'cardTitleColor', 'cardSubtitleColor', 'primaryColor', 'accentColor'];
  const payload = { updatedAt: nowIso() };
  for (const key of allowed) {
    if (body[key] !== undefined) {
      payload[key] = ['latitude', 'longitude'].includes(key) ? Number(body[key] || 0) : sz(body[key]);
    }
  }
  if (Object.keys(payload).length <= 1) {
    const error = new Error('没有要更新的字段');
    error.statusCode = 400;
    throw error;
  }
  await dbUpdateDoc(COLLECTIONS.activities, activityId, payload);
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
  const checkedTarget = await markAttendeeCheckedIn(target, 'name_phoneLast4_query');
  res.json(attendeePublicView(checkedTarget));
}

async function sendPublicAttendeeByPhone(req, res) {
  const phone = normalizePhone(req.body.phone);
  if (!phone) {
    res.status(400).json({ error: 'phone is required' });
    return;
  }
  if (!validatePhone(phone)) {
    res.status(400).json({ error: '手机号格式不正确，请输入中国大陆手机号或带国家区号的国际手机号' });
    return;
  }
  const activity = await getCurrentActivity();
  if (!activity) {
    res.status(404).json({ error: '当前没有可用活动' });
    return;
  }
  const attendees = await getAttendeesByActivity(activity._id);
  const target = attendees.find((item) => normalizePhone(item.phone) === phone);
  if (!target) {
    res.status(404).json({ error: '暂未查询到您的参会信息，请联系工作人员。' });
    return;
  }
  const checkedTarget = await markAttendeeCheckedIn(target, 'phone_query');
  res.json(attendeePublicView(checkedTarget));
}

async function sendPublicImages(_req, res) {
  const activity = await getCurrentActivity();
  if (!activity) {
    res.json([]);
    return;
  }
  const images = (await getLiveImagesByActivity(activity._id))
    .filter((item) => item.isVisible)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  res.json(await enrichImages(images.slice(0, 1)));
}

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    res.status(401).json({ error: '未登录或登录已失效' });
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7), CONFIG.jwtSecret);
    const admins = (await getCollectionRows(LEGACY_COLLECTIONS.admins)).rows.map(normalizeAdmin);
    const admin = admins.find((item) => item._id === payload.adminId);
    if (!admin || admin.status !== 'active') {
      res.status(401).json({ error: '账号已停用、待审核或不存在' });
      return;
    }
    req.admin = { ...payload, ...adminPublicView(admin) };
    next();
  } catch (_error) {
    res.status(401).json({ error: '未登录或登录已失效' });
  }
}

function superAdminMiddleware(req, res, next) {
  if (req.admin?.role !== 'superadmin') {
    res.status(403).json({ error: '仅超级管理员可以执行此操作' });
    return;
  }
  next();
}

app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        CONFIG.corsOrigins.length === 0 ||
        CONFIG.corsOrigins.includes('*') ||
        CONFIG.corsOrigins.includes(origin)
      ) {
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

const rateLimitStore = new Map();
function rateLimit({ windowMs = 60000, max = 30 } = {}) {
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const entry = rateLimitStore.get(key);
    if (!entry || now - entry.start > windowMs) {
      rateLimitStore.set(key, { start: now, count: 1 });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      res.status(429).json({ error: '请求过于频繁，请稍后再试' });
      return;
    }
    next();
  };
}

const publicRateLimit = rateLimit({ windowMs: 60000, max: 20 });
const loginRateLimit = rateLimit({ windowMs: 300000, max: 10 });
const registerRateLimit = rateLimit({ windowMs: 3600000, max: 5 });

app.get('/health', async (_req, res, next) => {
  try {
    const missing = getMissingCloudCredentials();
    if (missing.length > 0) {
      res.status(503).json({
        status: 'degraded',
        currentActivityId: null,
        missingEnv: missing,
        timestamp: nowIso(),
      });
      return;
    }
    const current = await getCurrentActivity();
    res.json({ status: 'ok', currentActivityId: current ? current._id : null, timestamp: nowIso() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/login', loginRateLimit, async (req, res, next) => {
  try {
    requireFields(req.body, ['username', 'password']);
    if (process.env.NODE_ENV !== 'test') await seedBaseData();
    const admins = (await getCollectionRows(LEGACY_COLLECTIONS.admins)).rows.map(normalizeAdmin);
    const admin = admins.find((item) => item.username === req.body.username);
    if (!admin || !verifyPassword(req.body.password, admin.passwordHash)) {
      res.status(401).json({ error: '用户名或密码错误' });
      return;
    }
    if (admin.status === 'pending') {
      res.status(403).json({ error: '账号正在等待超级管理员审核' });
      return;
    }
    if (admin.status !== 'active') {
      res.status(403).json({ error: '账号已被停用，请联系超级管理员' });
      return;
    }
    const lastLoginAt = nowIso();
    await dbUpdateDoc(COLLECTIONS.admins, admin._id, { lastLoginAt, updatedAt: lastLoginAt });
    const token = jwt.sign(
      { adminId: admin._id, username: admin.username, role: admin.role, department: admin.department },
      CONFIG.jwtSecret,
      { expiresIn: '24h' }
    );
    res.json({ token, admin: { ...adminPublicView(admin), lastLoginAt } });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/register', registerRateLimit, async (req, res, next) => {
  try {
    requireFields(req.body, ['username', 'password', 'name', 'department']);
    const username = normalizeText(req.body.username);
    const name = normalizeText(req.body.name);
    const department = normalizeText(req.body.department);
    if (!validateUsername(username)) {
      res.status(400).json({ error: '用户名须为 3-32 位字母、数字、点、下划线或短横线' });
      return;
    }
    if (!validatePassword(req.body.password)) {
      res.status(400).json({ error: '密码须为 8-72 位，且同时包含字母和数字' });
      return;
    }
    if (name.length > 50 || department.length > 50) {
      res.status(400).json({ error: '姓名和部门不能超过 50 个字符' });
      return;
    }
    if (process.env.NODE_ENV !== 'test') await seedBaseData();
    const admins = (await getCollectionRows(LEGACY_COLLECTIONS.admins)).rows.map(normalizeAdmin);
    if (admins.some((item) => item.username.toLowerCase() === username.toLowerCase())) {
      res.status(409).json({ error: '用户名已存在' });
      return;
    }
    const timestamp = nowIso();
    await dbAdd(COLLECTIONS.admins, {
      username,
      passwordHash: hashPassword(req.body.password),
      name,
      department,
      role: 'user',
      status: 'pending',
      mustChangePassword: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    res.status(201).json({ success: true, message: '注册成功，请等待超级管理员审核' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/me', authMiddleware, (req, res) => res.json(req.admin));

app.put('/api/admin/me/password', authMiddleware, async (req, res, next) => {
  try {
    requireFields(req.body, ['currentPassword', 'newPassword']);
    if (!validatePassword(req.body.newPassword)) {
      res.status(400).json({ error: '新密码须为 8-72 位，且同时包含字母和数字' });
      return;
    }
    const admins = (await getCollectionRows(LEGACY_COLLECTIONS.admins)).rows.map(normalizeAdmin);
    const admin = admins.find((item) => item._id === req.admin._id);
    if (!admin || !verifyPassword(req.body.currentPassword, admin.passwordHash)) {
      res.status(400).json({ error: '当前密码不正确' });
      return;
    }
    await dbUpdateDoc(COLLECTIONS.admins, admin._id, {
      passwordHash: hashPassword(req.body.newPassword),
      mustChangePassword: false,
      updatedAt: nowIso(),
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/users', authMiddleware, superAdminMiddleware, async (_req, res, next) => {
  try {
    const admins = (await getCollectionRows(LEGACY_COLLECTIONS.admins)).rows
      .map(normalizeAdmin)
      .map(adminPublicView)
      .sort((a, b) => Number(a.role !== 'superadmin') - Number(b.role !== 'superadmin')
        || new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json(admins);
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/users/:id/status', authMiddleware, superAdminMiddleware, async (req, res, next) => {
  try {
    const status = normalizeText(req.body.status);
    if (!['active', 'disabled'].includes(status)) {
      res.status(400).json({ error: '账号状态无效' });
      return;
    }
    const admins = (await getCollectionRows(LEGACY_COLLECTIONS.admins)).rows.map(normalizeAdmin);
    const target = admins.find((item) => item._id === req.params.id);
    if (!target) {
      res.status(404).json({ error: '账号不存在' });
      return;
    }
    if (target.role === 'superadmin') {
      res.status(400).json({ error: '不能修改超级管理员账号状态' });
      return;
    }
    const timestamp = nowIso();
    await dbUpdateDoc(COLLECTIONS.admins, target._id, {
      status,
      approvedBy: status === 'active' ? req.admin.username : target.approvedBy,
      approvedAt: status === 'active' ? timestamp : target.approvedAt,
      updatedAt: timestamp,
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/users/:id/reset-password', authMiddleware, superAdminMiddleware, async (req, res, next) => {
  try {
    requireFields(req.body, ['password']);
    if (!validatePassword(req.body.password)) {
      res.status(400).json({ error: '临时密码须为 8-72 位，且同时包含字母和数字' });
      return;
    }
    const admins = (await getCollectionRows(LEGACY_COLLECTIONS.admins)).rows.map(normalizeAdmin);
    const target = admins.find((item) => item._id === req.params.id);
    if (!target) {
      res.status(404).json({ error: '账号不存在' });
      return;
    }
    await dbUpdateDoc(COLLECTIONS.admins, target._id, {
      passwordHash: hashPassword(req.body.password),
      mustChangePassword: true,
      updatedAt: nowIso(),
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/dashboard', authMiddleware, async (req, res, next) => {
  try {
    const activity = await getAdminActivity(req).catch((error) => {
      if (error.statusCode === 400) {
        return null;
      }
      throw error;
    });
    if (!activity) {
      res.json({
        activity: null,
        attendeeCount: 0,
        checkedInCount: 0,
        notCheckedInCount: 0,
        liveImageCount: 0,
        updatedAt: '',
      });
      return;
    }
    const attendees = await getAttendeesByActivity(activity._id);
    const images = await getLiveImagesByActivity(activity._id);
    res.json({
      activity: await enrichActivity(activity),
      attendeeCount: attendees.length,
      checkedInCount: attendees.filter((item) => item.checkedIn).length,
      notCheckedInCount: attendees.filter((item) => !item.checkedIn).length,
      liveImageCount: images.length,
      updatedAt: activity.updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/bootstrap', async (_req, res, next) => {
  try {
    await seedBaseData();
    const activities = await getActivities();
    const admins = (await getCollectionRows(LEGACY_COLLECTIONS.admins)).rows.map(normalizeAdmin);
    const current = activities.find((item) => item.isCurrent) || null;
    res.json({
      success: true,
      adminExists: admins.some((item) => item.username === CONFIG.defaultAdminUsername),
      activityCount: activities.length,
      currentActivityId: current ? current._id : null,
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
      latitude: Number(req.body.latitude || 0),
      longitude: Number(req.body.longitude || 0),
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
    const checkInStatus = normalizeText(req.query.checkInStatus || 'all');
    let attendees = await getAttendeesByActivity(activity._id);
    if (keyword) {
      attendees = attendees.filter((item) =>
        [item.name, item.phone, item.organization, item.attendeeCode].some((field) => field.includes(keyword))
      );
    }
    if (checkInStatus === 'checkedIn') {
      attendees = attendees.filter((item) => item.checkedIn);
    } else if (checkInStatus === 'notCheckedIn') {
      attendees = attendees.filter((item) => !item.checkedIn);
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

app.post('/api/admin/attendees', authMiddleware, async (req, res, next) => {
  try {
    const activity = await getAdminActivity(req);
    const { name, phone, organization, identityType, seatNo, remark } = req.body || {};
    if (!name || !phone) {
      res.status(400).json({ error: '姓名和手机号不能为空' });
      return;
    }
    const normalizedPhone = normalizePhone(phone);
    if (!validatePhone(normalizedPhone)) {
      res.status(400).json({ error: '手机号格式不正确' });
      return;
    }
    const current = await getAttendeesByActivity(activity._id);
    if (current.some((item) => item.name === normalizeText(name) && item.phone === normalizedPhone)) {
      res.status(400).json({ error: '该人员已存在于当前活动' });
      return;
    }
    const attendeeCode = await nextAttendeeCode(activity._id);
    await dbAdd(COLLECTIONS.attendees, {
      activityId: activity._id,
      attendeeCode,
      name: normalizeText(name),
      phone: normalizedPhone,
      phoneLast4: normalizedPhone.slice(-4),
      organization: normalizeText(organization || ''),
      identityType: normalizeText(identityType || ''),
      seatNo: normalizeText(seatNo || ''),
      remark: normalizeText(remark || ''),
      checkedIn: false,
      checkedInAt: '',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    res.json({ success: true, attendeeCode });
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
    const keyword = normalizeText(req.query.keyword || '');
    const checkInStatus = normalizeText(req.query.checkInStatus || 'all');
    let attendees = await getAttendeesByActivity(activity._id);
    if (keyword) {
      attendees = attendees.filter((item) =>
        [item.name, item.phone, item.organization, item.attendeeCode].some((field) => field.includes(keyword))
      );
    }
    if (checkInStatus === 'checkedIn') {
      attendees = attendees.filter((item) => item.checkedIn);
    } else if (checkInStatus === 'notCheckedIn') {
      attendees = attendees.filter((item) => !item.checkedIn);
    }
    const rows = attendees.map((item) => ({
      姓名: item.name,
      手机号: item.phone,
      单位: item.organization,
      身份类型: item.identityType,
      座位号: item.seatNo,
      备注: item.remark,
      参会码: item.attendeeCode,
      签到状态: item.checkedIn ? '已签到' : '未签到',
      签到时间: item.checkedInAt || '',
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, checkInStatus === 'checkedIn' ? '已签到人员' : '参会人员');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const filename = checkInStatus === 'checkedIn' ? 'checked-in-attendees.xlsx' : 'attendees.xlsx';
    res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(filename)}`);
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
    const uploaded = await uploadCloudFile(cloudPath, req.file.buffer, req.file.mimetype);
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
    const requestedFolder = normalizeText(req.body.folder) || 'activity';
    const folder = ['maps', 'covers', 'activity', 'miniapp-bg', 'module-bgs'].includes(requestedFolder) ? requestedFolder : 'activity';
    const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
    const cloudPath = `event/${folder}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    const uploaded = await uploadCloudFile(cloudPath, req.file.buffer, req.file.mimetype);
    res.json({ fileID: uploaded.fileID, imageUrl: await getTempUrl(uploaded.fileID) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/upload-pdf', authMiddleware, pdfUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: '请上传PDF文件' });
      return;
    }
    const ext = path.extname(req.file.originalname).toLowerCase() || '.pdf';
    const cloudPath = `event/route-pdf/${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    const uploaded = await uploadCloudFile(cloudPath, req.file.buffer, req.file.mimetype);
    res.json({ fileID: uploaded.fileID, pdfUrl: await getTempUrl(uploaded.fileID) });
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

app.post('/api/attendee/query', publicRateLimit, async (req, res, next) => {
  try {
    await sendPublicAttendeeByPhone(req, res);
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
app.get('/api/miniapp/uiConfig', async (req, res, next) => {
  try {
    const activity = await getCurrentActivity();
    if (!activity) {
      res.json({});
      return;
    }
    const enriched = await enrichActivity(activity);
    res.json({
      globalBgImageUrl: enriched.globalBgImageUrl || '',
      introBgImageUrl: enriched.introBgImageUrl || '',
      scheduleBgImageUrl: enriched.scheduleBgImageUrl || '',
      badgeBgImageUrl: enriched.badgeBgImageUrl || '',
      seatingBgImageUrl: enriched.seatingBgImageUrl || '',
      routeBgImageUrl: enriched.routeBgImageUrl || '',
      liveBgImageUrl: enriched.liveBgImageUrl || '',
      routePdfUrl: enriched.routePdfUrl || '',
      globalTextColor: enriched.globalTextColor || '',
      cardTitleColor: enriched.cardTitleColor || '',
      cardSubtitleColor: enriched.cardSubtitleColor || '',
      primaryColor: enriched.primaryColor || '',
      accentColor: enriched.accentColor || '',
    });
  } catch (error) {
    next(error);
  }
});
app.post('/api/miniapp/queryAttendee', publicRateLimit, async (req, res, next) => {
  try {
    req.body = { phone: req.body.phone };
    await sendPublicAttendeeByPhone(req, res);
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
app.post('/api/h5/queryAttendee', publicRateLimit, async (req, res, next) => {
  try {
    req.body = { phone: req.body.phone };
    await sendPublicAttendeeByPhone(req, res);
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, _next) => {
  const statusCode = error.statusCode || 500;
  console.error(error);
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Activity-Id');
  }
  res.status(statusCode).json({ error: error.message || '服务异常' });
});

async function startServer() {
  try {
    await seedBaseData();
  } catch (error) {
    console.warn('seedBaseData failed (server will still start):', error.message);
  }
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
  hashPassword,
  verifyPassword,
  normalizePhone,
  validatePhone,
  normalizeText,
  normalizeActivity,
  normalizeSchedule,
  normalizeAttendee,
  normalizeLiveImage,
  normalizeAdmin,
  adminPublicView,
  validateUsername,
  validatePassword,
  attendeePublicView,
  sz,
  CONFIG,
};
