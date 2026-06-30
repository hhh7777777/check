import request from '../utils/request'

export const adminLogin = (data) => request.post('/admin/login', data)
export const adminRegister = (data) => request.post('/admin/register', data)
export const getAdminUsers = () => request.get('/admin/users')
export const updateAdminUserStatus = (id, status) => request.put(`/admin/users/${id}/status`, { status })
export const resetAdminUserPassword = (id, password) =>
  request.put(`/admin/users/${id}/reset-password`, { password })

export const getDashboard = () => request.get('/admin/dashboard')

export const getActivities = () => request.get('/admin/activities')
export const createActivity = (data) => request.post('/admin/activities', data)
export const getActivityById = (id) => request.get(`/admin/activities/${id}`)
export const updateActivityById = (id, data) => request.put(`/admin/activities/${id}`, data)
export const deleteActivity = (id) => request.delete(`/admin/activities/${id}`)
export const activateActivity = (id) => request.post(`/admin/activities/${id}/activate`)

export const getActivity = () => request.get('/admin/activity')
export const updateActivity = (data) => request.put('/admin/activity', data)

export const getSchedules = () => request.get('/admin/schedules')
export const addSchedule = (data) => request.post('/admin/schedules', data)
export const updateSchedule = (id, data) => request.put(`/admin/schedules/${id}`, data)
export const deleteSchedule = (id) => request.delete(`/admin/schedules/${id}`)

export const getAttendees = (params) => request.get('/admin/attendees', { params })
export const updateAttendee = (id, data) => request.put(`/admin/attendees/${id}`, data)
export const deleteAttendee = (id) => request.delete(`/admin/attendees/${id}`)
export const exportAttendees = (params) =>
  request.get('/admin/attendees/export', { params, responseType: 'blob' })

export const getLiveImages = () => request.get('/admin/live-images')
export const updateLiveImage = (id, data) => request.put(`/admin/live-images/${id}`, data)
export const deleteLiveImage = (id) => request.delete(`/admin/live-images/${id}`)
