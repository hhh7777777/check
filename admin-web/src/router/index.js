import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/login',
    component: () => import('../views/Login.vue'),
    meta: { requiresAuth: false, title: '管理员登录' }
  },
  {
    path: '/',
    component: () => import('../views/Layout.vue'),
    meta: { requiresAuth: true },
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', component: () => import('../views/Dashboard.vue'), meta: { title: '数据概览' } },
      { path: 'activities', component: () => import('../views/ActivitiesManage.vue'), meta: { title: '活动列表' } },
      { path: 'activity', component: () => import('../views/ActivityManage.vue'), meta: { title: '活动信息' } },
      { path: 'schedule', component: () => import('../views/ScheduleManage.vue'), meta: { title: '会议日程' } },
      { path: 'attendee', component: () => import('../views/AttendeeManage.vue'), meta: { title: '参会人员' } },
      { path: 'live', component: () => import('../views/LiveImageManage.vue'), meta: { title: '图文直播' } }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, _from, next) => {
  if (to.meta?.title) {
    document.title = `${to.meta.title} - 内部活动参会服务系统`
  }
  const token = localStorage.getItem('admin_token')
  if (to.meta.requiresAuth === false) {
    if (to.path === '/login' && token) {
      next('/dashboard')
      return
    }
    next()
    return
  }
  if (!token) {
    next('/login')
    return
  }
  next()
})

export default router
