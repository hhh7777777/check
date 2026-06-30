import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/login',
    component: () => import('../views/Login.vue'),
    meta: { requiresAuth: false, title: '管理员登录' }
  },
  {
    path: '/register',
    component: () => import('../views/Register.vue'),
    meta: { requiresAuth: false, title: '用户注册' }
  },
  {
    path: '/',
    component: () => import('../views/Layout.vue'),
    meta: { requiresAuth: true },
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', component: () => import('../views/Dashboard.vue'), meta: { title: '数据概览', role: 'admin' } },
      { path: 'activities', component: () => import('../views/ActivitiesManage.vue'), meta: { title: '活动列表', role: 'admin' } },
      { path: 'activity', component: () => import('../views/ActivityManage.vue'), meta: { title: '活动信息', role: 'admin' } },
      { path: 'schedule', component: () => import('../views/ScheduleManage.vue'), meta: { title: '会议日程', role: 'admin' } },
      { path: 'attendee', component: () => import('../views/AttendeeManage.vue'), meta: { title: '参会人员', role: 'admin' } },
      { path: 'live', component: () => import('../views/LiveImageManage.vue'), meta: { title: '图文直播', role: 'admin' } },
      { path: 'users', component: () => import('../views/UserManage.vue'), meta: { title: '账号管理', role: 'superadmin' } }
    ]
  }
]

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes
})

function parseJwtPayload(token) {
  try {
    const base64 = token.split('.')[1]
    return JSON.parse(atob(base64.replace(/-/g, '+').replace(/_/g, '/')))
  } catch (_) {
    return null
  }
}

router.beforeEach((to, _from, next) => {
  if (to.meta?.title) {
    document.title = `${to.meta.title} - 内部活动参会服务系统`
  }
  const token = localStorage.getItem('admin_token')
  if (to.meta.requiresAuth === false) {
    if (to.path === '/login' && token) {
      const payload = parseJwtPayload(token)
      if (payload && (!payload.exp || payload.exp * 1000 > Date.now())) {
        next('/dashboard')
        return
      }
      localStorage.removeItem('admin_token')
    }
    next()
    return
  }
  if (!token) {
    next('/login')
    return
  }
  const payload = parseJwtPayload(token)
  if (!payload || (payload.exp && payload.exp * 1000 <= Date.now())) {
    localStorage.removeItem('admin_token')
    next('/login')
    return
  }
  if (to.meta.role === 'superadmin' && payload.role !== 'superadmin') {
    next('/dashboard')
    return
  }
  next()
})

export default router
