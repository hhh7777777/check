try { require('dotenv').config() } catch (_) {}
const crypto = require('crypto')
const fetch = require('node-fetch')

const CONFIG = {
  appId: process.env.WX_APPID || '',
  appSecret: process.env.WX_APPSECRET || '',
  sourceEnvId: process.env.SOURCE_WX_ENV_ID || '',
  targetEnvId: process.env.TARGET_WX_ENV_ID || process.env.WX_ENV_ID || ''
}

const COLLECTIONS = {
  activities: 'activity',
  schedules: 'schedule',
  attendees: 'attendee',
  liveImages: 'live_image',
  admins: 'admin'
}

const LEGACY_COLLECTIONS = {
  activities: ['activity', 'activities'],
  schedules: ['schedule', 'schedules'],
  attendees: ['attendee', 'attendees'],
  liveImages: ['live_image', 'live_images'],
  admins: ['admin', 'admins']
}

let accessTokenCache = { token: '', expiresAt: 0 }

function nowIso() {
  return new Date().toISOString()
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizePhone(value) {
  return String(value || '')
    .trim()
    .replace(/[()\s-]/g, '')
    .replace(/^00(\d+)/, '+$1')
}

function toDateCode(dateText) {
  const date = new Date(dateText || nowIso())
  const source = Number.isNaN(date.getTime()) ? new Date() : date
  return `${source.getFullYear()}${String(source.getMonth() + 1).padStart(2, '0')}${String(
    source.getDate()
  ).padStart(2, '0')}`
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
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
    isCurrent: item.isCurrent === true || item.isCurrent === 1 || item.is_current === 1
  }
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
    updatedAt: item.updatedAt || item.updated_at || ''
  }
}

function normalizeAttendee(item) {
  const phone = normalizePhone(item.phone)
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
    updatedAt: item.updatedAt || item.updated_at || ''
  }
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
    updatedAt: item.updatedAt || item.updated_at || ''
  }
}

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

function normalizeAdmin(item) {
  return {
    _id: item._id,
    username: item.username || '',
    passwordHash: item.passwordHash || item.password_hash || hashPassword('admin123'),
    role: item.role || 'admin',
    createdAt: item.createdAt || item.created_at || ''
  }
}

async function getAccessToken() {
  if (!CONFIG.appId || !CONFIG.appSecret || !CONFIG.sourceEnvId || !CONFIG.targetEnvId) {
    throw new Error('WX_APPID, WX_APPSECRET, SOURCE_WX_ENV_ID, TARGET_WX_ENV_ID are required')
  }
  const now = Date.now()
  if (accessTokenCache.token && accessTokenCache.expiresAt > now + 600000) {
    return accessTokenCache.token
  }
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${CONFIG.appId}&secret=${CONFIG.appSecret}`
  const response = await fetch(url)
  const data = await response.json()
  if (data.errcode) {
    throw new Error(`failed to fetch access token: ${data.errmsg}`)
  }
  accessTokenCache = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000
  }
  return accessTokenCache.token
}

function stringifyQueryValue(value) {
  if (value instanceof Date) {
    return `new Date("${value.toISOString()}")`
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stringifyQueryValue(item)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .map(([key, item]) => `${JSON.stringify(key)}:${stringifyQueryValue(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

async function requestDb(envId, endpoint, payload, retries = 1) {
  const token = await getAccessToken()
  const response = await fetch(`https://api.weixin.qq.com/tcb/${endpoint}?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ env: envId, ...payload })
  })
  const result = await response.json()
  if (result.errcode && result.errcode !== 0) {
    if (result.errcode === 40001 && retries > 0) {
      accessTokenCache = { token: '', expiresAt: 0 }
      return requestDb(envId, endpoint, payload, retries - 1)
    }
    throw new Error(`${endpoint} failed in ${envId}: ${result.errmsg} (${result.errcode})`)
  }
  return result
}

async function dbQuery(envId, query) {
  const result = await requestDb(envId, 'databasequery', { query })
  return Array.isArray(result.data) ? result.data.map((item) => JSON.parse(item)) : []
}

async function dbQueryAll(envId, collection, where = null, orderBy = null) {
  const rows = []
  const batchSize = 100
  let offset = 0
  while (true) {
    const whereClause = where ? `.where(${stringifyQueryValue(where)})` : ''
    const orderClause = orderBy ? `.orderBy("${orderBy.field}","${orderBy.order || 'asc'}")` : ''
    const query = `db.collection("${collection}")${whereClause}${orderClause}.skip(${offset}).limit(${batchSize}).get()`
    const batch = await dbQuery(envId, query)
    rows.push(...batch)
    if (batch.length < batchSize) break
    offset += batchSize
  }
  return rows
}

async function dbAdd(envId, collection, data) {
  return requestDb(envId, 'databaseadd', {
    query: `db.collection("${collection}").add({data:${stringifyQueryValue(data)}})`
  })
}

async function dbUpdateDoc(envId, collection, id, data) {
  const payload = { ...data }
  delete payload._id
  return requestDb(envId, 'databaseupdate', {
    query: `db.collection("${collection}").doc("${id}").update({data:${stringifyQueryValue(payload)}})`
  })
}

async function getCollectionRows(envId, candidates) {
  for (const name of candidates) {
    try {
      return { collection: name, rows: await dbQueryAll(envId, name) }
    } catch (_) {}
  }
  return { collection: candidates[0], rows: [] }
}

async function getTargetActivities() {
  return (await getCollectionRows(CONFIG.targetEnvId, LEGACY_COLLECTIONS.activities)).rows.map(normalizeActivity)
}

async function getTargetAttendeesByActivity(activityId) {
  return (await getCollectionRows(CONFIG.targetEnvId, LEGACY_COLLECTIONS.attendees)).rows
    .map(normalizeAttendee)
    .filter((item) => item.activityId === activityId)
}

async function nextAttendeeCode(activityId, activityMap) {
  const activities = await getTargetActivities()
  const activity = activities.find((item) => item._id === activityId) || null
  const prefix = `A${toDateCode(activity ? activity.startTime || activity.createdAt : nowIso())}`
  const attendees = await getTargetAttendeesByActivity(activityId)
  const max = attendees.reduce((result, item) => {
    if (item.attendeeCode && item.attendeeCode.startsWith(prefix)) {
      return Math.max(result, Number(item.attendeeCode.slice(prefix.length)) || 0)
    }
    return result
  }, 0)
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

async function ensureCurrentActivity() {
  const activities = await getTargetActivities()
  if (activities.length === 0) return
  if (activities.some((item) => item.isCurrent)) return
  const first = activities[0]
  await dbUpdateDoc(CONFIG.targetEnvId, COLLECTIONS.activities, first._id, {
    isCurrent: true,
    updatedAt: nowIso()
  })
}

async function migrateAcrossEnvs() {
  const summary = {
    activities: 0,
    schedules: 0,
    attendees: 0,
    liveImages: 0,
    admins: 0
  }

  const sourceActivities = (await getCollectionRows(CONFIG.sourceEnvId, LEGACY_COLLECTIONS.activities)).rows
  const sourceSchedules = (await getCollectionRows(CONFIG.sourceEnvId, LEGACY_COLLECTIONS.schedules)).rows
  const sourceAttendees = (await getCollectionRows(CONFIG.sourceEnvId, LEGACY_COLLECTIONS.attendees)).rows
  const sourceImages = (await getCollectionRows(CONFIG.sourceEnvId, LEGACY_COLLECTIONS.liveImages)).rows
  const sourceAdmins = (await getCollectionRows(CONFIG.sourceEnvId, LEGACY_COLLECTIONS.admins)).rows

  const targetActivitiesRaw = await dbQueryAll(CONFIG.targetEnvId, COLLECTIONS.activities).catch(() => [])
  const targetSchedulesRaw = await dbQueryAll(CONFIG.targetEnvId, COLLECTIONS.schedules).catch(() => [])
  const targetAttendeesRaw = await dbQueryAll(CONFIG.targetEnvId, COLLECTIONS.attendees).catch(() => [])
  const targetImagesRaw = await dbQueryAll(CONFIG.targetEnvId, COLLECTIONS.liveImages).catch(() => [])
  const targetAdminsRaw = await dbQueryAll(CONFIG.targetEnvId, COLLECTIONS.admins).catch(() => [])

  const activityMap = new Map()
  for (const item of targetActivitiesRaw) {
    if (item._legacyId) activityMap.set(item._legacyId, item._id)
  }

  const errors = []

  for (const raw of sourceActivities) {
    if (activityMap.has(raw._id)) continue
    try {
      const normalized = normalizeActivity(raw)
      const result = await dbAdd(CONFIG.targetEnvId, COLLECTIONS.activities, {
        ...normalized,
        _legacyId: raw._id,
        createdAt: normalized.createdAt || nowIso(),
        updatedAt: normalized.updatedAt || nowIso()
      })
      const createdId = result.id_list && result.id_list[0]
      if (createdId) {
        activityMap.set(raw._id, createdId)
        summary.activities += 1
      }
    } catch (e) {
      errors.push({ collection: 'activities', id: raw._id, error: e.message })
      console.error(`migrate activity ${raw._id} failed:`, e.message)
    }
  }

  const targetScheduleLegacy = new Set(targetSchedulesRaw.map((item) => item._legacyId).filter(Boolean))
  for (const raw of sourceSchedules) {
    if (targetScheduleLegacy.has(raw._id)) continue
    try {
      const normalized = normalizeSchedule(raw)
      await dbAdd(CONFIG.targetEnvId, COLLECTIONS.schedules, {
        ...normalized,
        activityId: activityMap.get(normalized.activityId) || normalized.activityId || '',
        _legacyId: raw._id,
        createdAt: normalized.createdAt || nowIso(),
        updatedAt: normalized.updatedAt || nowIso()
      })
      summary.schedules += 1
    } catch (e) {
      errors.push({ collection: 'schedules', id: raw._id, error: e.message })
      console.error(`migrate schedule ${raw._id} failed:`, e.message)
    }
  }

  const targetAttendeeLegacy = new Set(targetAttendeesRaw.map((item) => item._legacyId).filter(Boolean))
  for (const raw of sourceAttendees) {
    if (targetAttendeeLegacy.has(raw._id)) continue
    try {
      const normalized = normalizeAttendee(raw)
      const activityId = activityMap.get(normalized.activityId) || normalized.activityId || ''
      const attendeeCode = normalized.attendeeCode || (activityId ? await nextAttendeeCode(activityId, activityMap) : '')
      await dbAdd(CONFIG.targetEnvId, COLLECTIONS.attendees, {
        ...normalized,
        attendeeCode,
        activityId,
        _legacyId: raw._id,
        createdAt: normalized.createdAt || nowIso(),
        updatedAt: normalized.updatedAt || nowIso()
      })
      summary.attendees += 1
    } catch (e) {
      errors.push({ collection: 'attendees', id: raw._id, error: e.message })
      console.error(`migrate attendee ${raw._id} failed:`, e.message)
    }
  }

  const targetImageLegacy = new Set(targetImagesRaw.map((item) => item._legacyId).filter(Boolean))
  for (const raw of sourceImages) {
    if (targetImageLegacy.has(raw._id)) continue
    try {
      const normalized = normalizeLiveImage(raw)
      await dbAdd(CONFIG.targetEnvId, COLLECTIONS.liveImages, {
        ...normalized,
        activityId: activityMap.get(normalized.activityId) || normalized.activityId || '',
        _legacyId: raw._id,
        createdAt: normalized.createdAt || nowIso(),
        updatedAt: normalized.updatedAt || nowIso()
      })
      summary.liveImages += 1
    } catch (e) {
      errors.push({ collection: 'liveImages', id: raw._id, error: e.message })
      console.error(`migrate liveImage ${raw._id} failed:`, e.message)
    }
  }

  const targetAdminUsernames = new Set(targetAdminsRaw.map((item) => item.username).filter(Boolean))
  for (const raw of sourceAdmins) {
    try {
      const normalized = normalizeAdmin(raw)
      if (!normalized.username || targetAdminUsernames.has(normalized.username)) continue
      await dbAdd(CONFIG.targetEnvId, COLLECTIONS.admins, {
        ...normalized,
        _legacyId: raw._id,
        createdAt: normalized.createdAt || nowIso()
      })
      summary.admins += 1
    } catch (e) {
      errors.push({ collection: 'admins', id: raw._id, error: e.message })
      console.error(`migrate admin ${raw._id} failed:`, e.message)
    }
  }

  await ensureCurrentActivity()
  if (errors.length > 0) {
    console.warn(`${errors.length} records failed during migration`)
  }
  return { ...summary, errors }
}

migrateAcrossEnvs()
  .then((summary) => {
    console.log('cross-env migration complete')
    console.log(JSON.stringify({ sourceEnvId: CONFIG.sourceEnvId, targetEnvId: CONFIG.targetEnvId, summary }, null, 2))
    process.exit(0)
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
