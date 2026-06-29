import { createRouter, createWebHistory } from 'vue-router'

// 路由配置
const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { title: '登录', requiresAuth: false }
  },
  {
    path: '/',
    component: () => import('../views/Layout.vue'),
    meta: { requiresAuth: true },
    redirect: '/activity',
    children: [
      {
        path: 'activity',
        name: 'ActivityManage',
        component: () => import('../views/ActivityManage.vue'),
        meta: { title: '活动信息管理' }
      },
      {
        path: 'schedule',
        name: 'ScheduleManage',
        component: () => import('../views/ScheduleManage.vue'),
        meta: { title: '会议日程管理' }
      },
      {
        path: 'attendee',
        name: 'AttendeeManage',
        component: () => import('../views/AttendeeManage.vue'),
        meta: { title: '参会人员管理' }
      },
      {
        path: 'live',
        name: 'LiveImageManage',
        component: () => import('../views/LiveImageManage.vue'),
        meta: { title: '图文直播管理' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 全局前置守卫：检查 token，未登录跳转到 /login
router.beforeEach((to, from, next) => {
  // 设置页面标题
  if (to.meta.title) {
    document.title = `${to.meta.title} - 内部活动管理系统`
  }

  const token = localStorage.getItem('admin_token')

  // 需要鉴权的路由
  if (to.meta.requiresAuth !== false && to.matched.some((record) => record.meta.requiresAuth)) {
    if (!token) {
      next({ path: '/login', query: { redirect: to.fullPath } })
    } else {
      next()
    }
  } else {
    // 不需要鉴权的路由（如登录页），如果已登录则跳转到首页
    if (to.path === '/login' && token) {
      next({ path: '/activity' })
    } else {
      next()
    }
  }
})

export default router
