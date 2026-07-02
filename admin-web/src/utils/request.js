import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '../router'

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000
})

request.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token')
  const activityId = localStorage.getItem('current_activity_id')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  if (activityId && config.url !== '/admin/activities' && config.url !== '/admin/login') {
    config.headers['X-Activity-Id'] = activityId
  }
  return config
})

request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      const currentPath = window.location.hash.replace('#', '').split('?')[0]
      if (currentPath !== '/login') {
        localStorage.removeItem('admin_token')
        localStorage.removeItem('admin_info')
        router.push('/login')
        ElMessage.error('登录已失效，请重新登录')
      }
      return Promise.reject(error)
    }
    ElMessage.error(error.response?.data?.error || error.message || '请求失败')
    return Promise.reject(error)
  }
)

export default request
