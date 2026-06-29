import request from '../utils/request'

// ==================== 管理员登录 ====================
export const adminLogin = (data) => request.post('/admin/login', data)

// ==================== 数据概览 ====================
export const getDashboard = () => request.get('/admin/dashboard')

// ==================== 活动信息 ====================
export const getActivity = () => request.get('/admin/activity')
export const updateActivity = (data) => request.put('/admin/activity', data)

// ==================== 日程管理 ====================
export const getSchedules = () => request.get('/admin/schedules')
export const addSchedule = (data) => request.post('/admin/schedules', data)
export const updateSchedule = (id, data) => request.put(`/admin/schedules/${id}`, data)
export const deleteSchedule = (id) => request.delete(`/admin/schedules/${id}`)

// ==================== 参会人员 ====================
export const getAttendees = (params) => request.get('/admin/attendees', { params })
export const importAttendees = (formData) =>
  request.post('/admin/attendees/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
export const updateAttendee = (id, data) => request.put(`/admin/attendees/${id}`, data)
export const deleteAttendee = (id) => request.delete(`/admin/attendees/${id}`)
export const exportAttendees = (params) =>
  request.get('/admin/attendees/export', { params, responseType: 'blob' })

// ==================== 签到管理 ====================
export const getCheckinList = (params) => request.get('/admin/checkin/list', { params })

// ==================== 图文直播 ====================
export const getLiveImages = () => request.get('/admin/live-images')
export const uploadLiveImage = (formData) =>
  request.post('/admin/live-images', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
export const updateLiveImage = (id, data) => request.put(`/admin/live-images/${id}`, data)
export const deleteLiveImage = (id) => request.delete(`/admin/live-images/${id}`)
