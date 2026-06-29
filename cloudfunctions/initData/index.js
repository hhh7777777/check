// 云函数入口文件 - 初始化云数据库集合和测试数据
const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 需要创建的集合列表
const COLLECTIONS = ['admin', 'activity', 'schedule', 'attendee', 'live_image', 'checkin_log']

// 会议日程数据
const scheduleData = [
  { schedule_date: '2026-07-01', start_time: '09:00', end_time: '09:30', title: '开幕致辞', location: '主会场A', speaker: '张总经理', remark: '请提前10分钟入场', sort_order: 1 },
  { schedule_date: '2026-07-01', start_time: '09:30', end_time: '10:30', title: '2026年度工作总结与展望', location: '主会场A', speaker: '李副总经理', remark: '', sort_order: 2 },
  { schedule_date: '2026-07-01', start_time: '10:45', end_time: '11:45', title: '技术架构升级分享', location: '主会场A', speaker: '王技术总监', remark: '含Q&A环节', sort_order: 3 },
  { schedule_date: '2026-07-01', start_time: '14:00', end_time: '15:00', title: '团队协作工作坊', location: '分会场B', speaker: '陈培训师', remark: '请携带笔记本电脑', sort_order: 4 },
  { schedule_date: '2026-07-01', start_time: '15:15', end_time: '16:15', title: '产品创新思维', location: '分会场B', speaker: '刘产品经理', remark: '', sort_order: 5 },
  { schedule_date: '2026-07-02', start_time: '09:00', end_time: '10:00', title: '领导力提升', location: '主会场A', speaker: '外聘讲师赵老师', remark: '', sort_order: 6 },
  { schedule_date: '2026-07-02', start_time: '10:15', end_time: '11:15', title: '沟通与表达技巧', location: '主会场A', speaker: '外聘讲师孙老师', remark: '', sort_order: 7 },
  { schedule_date: '2026-07-02', start_time: '14:00', end_time: '15:30', title: '分组讨论与汇报', location: '各分会场', speaker: '各组组长', remark: '按部门分组', sort_order: 8 },
  { schedule_date: '2026-07-02', start_time: '15:45', end_time: '17:00', title: '闭幕总结与颁奖', location: '主会场A', speaker: '张总经理', remark: '', sort_order: 9 }
]

// 参会人员测试数据
const attendeeData = [
  { attendee_code: 'A202606240001', name: '张三', phone: '13800001111', organization: '技术研发部', identity_type: '参会嘉宾', seat_no: 'A-01', table_no: '1号桌', dining_place: '一楼宴会厅', hotel_name: '北京国际饭店', room_no: '301', remark: '' },
  { attendee_code: 'A202606240002', name: '李四', phone: '13800002222', organization: '产品设计部', identity_type: '参会嘉宾', seat_no: 'A-02', table_no: '1号桌', dining_place: '一楼宴会厅', hotel_name: '北京国际饭店', room_no: '302', remark: '' },
  { attendee_code: 'A202606240003', name: '王五', phone: '13800003333', organization: '市场营销部', identity_type: '参会嘉宾', seat_no: 'A-03', table_no: '2号桌', dining_place: '一楼宴会厅', hotel_name: '北京国际饭店', room_no: '303', remark: '' },
  { attendee_code: 'A202606240004', name: '赵六', phone: '13800004444', organization: '人力资源部', identity_type: '工作人员', seat_no: 'B-01', table_no: '3号桌', dining_place: '一楼宴会厅', hotel_name: '北京国际饭店', room_no: '305', remark: '负责签到' },
  { attendee_code: 'A202606240005', name: '钱七', phone: '13800005555', organization: '财务管理部', identity_type: '参会嘉宾', seat_no: 'B-02', table_no: '3号桌', dining_place: '一楼宴会厅', hotel_name: '北京国际饭店', room_no: '306', remark: '' },
  { attendee_code: 'A202606240006', name: '孙八', phone: '13800006666', organization: '技术研发部', identity_type: '参会嘉宾', seat_no: 'B-03', table_no: '4号桌', dining_place: '一楼宴会厅', hotel_name: '北京国际饭店', room_no: '307', remark: '' },
  { attendee_code: 'A202606240007', name: '周九', phone: '13800007777', organization: '行政管理部', identity_type: '工作人员', seat_no: 'C-01', table_no: '4号桌', dining_place: '一楼宴会厅', hotel_name: '北京国际饭店', room_no: '308', remark: '负责会务' },
  { attendee_code: 'A202606240008', name: '吴十', phone: '13800008888', organization: '技术研发部', identity_type: '参会嘉宾', seat_no: 'C-02', table_no: '5号桌', dining_place: '一楼宴会厅', hotel_name: '北京国际饭店', room_no: '309', remark: '' },
  { attendee_code: 'A202606240009', name: '郑十一', phone: '13800009999', organization: '产品设计部', identity_type: '特邀嘉宾', seat_no: 'C-03', table_no: '5号桌', dining_place: '一楼宴会厅', hotel_name: '北京国际饭店', room_no: '501', remark: 'VIP嘉宾' },
  { attendee_code: 'A202606240010', name: '冯十二', phone: '13800000000', organization: '市场营销部', identity_type: '参会嘉宾', seat_no: 'D-01', table_no: '6号桌', dining_place: '一楼宴会厅', hotel_name: '北京国际饭店', room_no: '502', remark: '' }
]

/**
 * 创建所有需要的集合
 */
async function createCollections() {
  const results = []
  for (const col of COLLECTIONS) {
    try {
      await db.createCollection(col)
      results.push({ collection: col, status: 'created' })
    } catch (e) {
      // 集合已存在时忽略错误
      results.push({ collection: col, status: 'already_exists' })
    }
  }
  return results
}

/**
 * 初始化管理员账号
 */
async function initAdmin() {
  const count = await db.collection('admin').count()
  if (count.total > 0) {
    return { status: 'skipped', reason: '管理员账号已存在' }
  }

  const passwordHash = crypto.createHash('sha256').update('admin123').digest('hex')
  await db.collection('admin').add({
    data: {
      username: 'admin',
      password_hash: passwordHash,
      role: 'admin',
      created_at: new Date()
    }
  })
  return { status: 'created', username: 'admin' }
}

/**
 * 初始化活动信息
 */
async function initActivity() {
  const count = await db.collection('activity').count()
  if (count.total > 0) {
    return { status: 'skipped', reason: '活动信息已存在' }
  }

  await db.collection('activity').add({
    data: {
      title: '2026年度内部培训大会',
      start_time: '2026-07-01 09:00:00',
      end_time: '2026-07-02 18:00:00',
      location: '北京国际会议中心',
      organizer: '人力资源部',
      co_organizer: '行政管理部',
      description: '本次大会旨在加强团队建设，提升专业技能，促进部门间交流合作。为期两天的培训将涵盖技术分享、团队协作、领导力提升等多个主题。',
      traffic_info: '1. 地铁：乘坐1号线至天安门东站，A出口步行约10分钟\n2. 公交：乘坐1路、52路至天安门东站\n3. 自驾：导航至"北京国际会议中心"，地下停车场可停车',
      map_image: '',
      contact_phone: '010-12345678',
      updated_at: new Date()
    }
  })
  return { status: 'created', title: '2026年度内部培训大会' }
}

/**
 * 初始化会议日程
 */
async function initSchedule() {
  const count = await db.collection('schedule').count()
  if (count.total > 0) {
    return { status: 'skipped', reason: '会议日程已存在' }
  }

  const tasks = scheduleData.map(item => {
    return db.collection('schedule').add({
      data: {
        ...item,
        created_at: new Date()
      }
    })
  })
  await Promise.all(tasks)
  return { status: 'created', count: scheduleData.length }
}

/**
 * 初始化参会人员
 */
async function initAttendee() {
  const count = await db.collection('attendee').count()
  if (count.total > 0) {
    return { status: 'skipped', reason: '参会人员数据已存在' }
  }

  const tasks = attendeeData.map(item => {
    return db.collection('attendee').add({
      data: {
        ...item,
        checkin_status: 0,
        checkin_time: null,
        created_at: new Date(),
        updated_at: new Date()
      }
    })
  })
  await Promise.all(tasks)
  return { status: 'created', count: attendeeData.length }
}

/**
 * 初始化图文直播示例数据
 */
async function initLiveImage() {
  const count = await db.collection('live_image').count()
  if (count.total > 0) {
    return { status: 'skipped', reason: '图文直播数据已存在' }
  }

  // 空集合，仅创建索引结构，实际使用时由管理员上传
  return { status: 'created', count: 0, reason: '图文直播集合已创建，暂无示例数据' }
}

// 云函数入口
exports.main = async (event, context) => {
  try {
    const results = {
      collections: [],
      admin: null,
      activity: null,
      schedule: null,
      attendee: null,
      live_image: null
    }

    // 1. 创建集合
    results.collections = await createCollections()

    // 2. 初始化管理员账号
    results.admin = await initAdmin()

    // 3. 初始化活动信息
    results.activity = await initActivity()

    // 4. 初始化会议日程
    results.schedule = await initSchedule()

    // 5. 初始化参会人员
    results.attendee = await initAttendee()

    // 6. 初始化图文直播
    results.live_image = await initLiveImage()

    return {
      success: true,
      message: '数据库初始化成功',
      data: results
    }
  } catch (err) {
    console.error('数据库初始化失败：', err)
    return {
      success: false,
      message: '初始化失败: ' + err.message
    }
  }
}
