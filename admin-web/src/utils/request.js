import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '../router'

// 云函数 HTTP 触发器基础地址
// 开发环境：通过 vite proxy 代理
// 生产环境：直接请求云函数 HTTP 触发器地址
const getBaseURL = () => {
  // 生产环境可以从环境变量读取云函数 HTTP 触发器地址
  const cloudFunctionUrl = import.meta.env.VITE_API_BASE_URL
  if (cloudFunctionUrl) {
    return cloudFunctionUrl
  }
  // 开发环境使用相对路径，通过 vite proxy 代理
  return '/api'
}

// 创建 axios 实例
const request = axios.create({
  baseURL: getBaseURL(),
  timeout: 30000
})

// 请求拦截器：自动在 header 中添加 Authorization: Bearer token
request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('admin_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器：处理401跳转登录，统一处理错误提示
request.interceptors.response.use(
  (response) => {
    // 云函数返回的数据结构可能是 { code, message, data } 或直接是数据
    const res = response.data
    // 如果返回的是标准格式，检查 code
    if (res && res.code !== undefined) {
      if (res.code === 200) {
        return res
      } else {
        ElMessage.error(res.message || '请求失败')
        return Promise.reject(new Error(res.message || '请求失败'))
      }
    }
    return res
  },
  (error) => {
    if (error.response) {
      const { status, data } = error.response
      if (status === 401) {
        // token 过期或无效，清除 token 并跳转到登录页
        localStorage.removeItem('admin_token')
        router.push('/login')
        ElMessage.error('登录已过期，请重新登录')
      } else {
        // 显示后端返回的错误信息
        const message = (data && data.message) || (data && data.error) || '请求失败'
        ElMessage.error(message)
      }
    } else {
      ElMessage.error('网络错误，请检查网络连接')
    }
    return Promise.reject(error)
  }
)

export default request
