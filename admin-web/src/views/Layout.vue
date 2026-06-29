<template>
  <el-container class="layout-shell">
    <el-aside width="240px" class="aside">
      <div class="brand">
        <strong>活动后台</strong>
        <span>Admin Console</span>
      </div>
      <el-menu :default-active="route.path" router>
        <el-menu-item index="/dashboard">数据概览</el-menu-item>
        <el-menu-item index="/activities">活动列表</el-menu-item>
        <el-menu-item index="/activity">活动信息</el-menu-item>
        <el-menu-item index="/schedule">会议日程</el-menu-item>
        <el-menu-item index="/attendee">参会人员</el-menu-item>
        <el-menu-item index="/live">图文直播</el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header">
        <div class="header-left">
          <div>
            <div class="title">{{ route.meta.title || '管理后台' }}</div>
            <div class="sub-title">前台永远显示当前活动，后台可维护多场活动</div>
          </div>
        </div>
        <div class="header-right">
          <el-select v-model="currentActivityId" placeholder="选择活动" style="width: 280px" @change="changeActivity">
            <el-option v-for="item in activities" :key="item._id" :label="item.title" :value="item._id" />
          </el-select>
          <el-button @click="logout">退出</el-button>
        </div>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getActivities } from '../api'

const route = useRoute()
const router = useRouter()
const activities = ref([])
const currentActivityId = ref(localStorage.getItem('current_activity_id') || '')

const loadActivities = async () => {
  activities.value = await getActivities()
  const current = activities.value.find((item) => item.isCurrent)
  if (!currentActivityId.value && current) {
    currentActivityId.value = current._id
    localStorage.setItem('current_activity_id', current._id)
  }
}

const changeActivity = (value) => {
  localStorage.setItem('current_activity_id', value)
  ElMessage.success('已切换后台管理活动')
  router.replace({ path: route.path, query: { t: Date.now() } })
}

const logout = () => {
  localStorage.removeItem('admin_token')
  localStorage.removeItem('admin_info')
  localStorage.removeItem('current_activity_id')
  router.push('/login')
}

loadActivities()
</script>

<style scoped>
.layout-shell {
  min-height: 100vh;
}

.aside {
  background: linear-gradient(180deg, #18314f, #102437);
  color: #fff;
}

.brand {
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.brand span {
  font-size: 12px;
  opacity: 0.72;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
  border-bottom: 1px solid #edf1f5;
}

.title {
  font-size: 18px;
  font-weight: 700;
}

.sub-title {
  font-size: 12px;
  color: #667085;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.main {
  background: #f5f7fb;
}
</style>
