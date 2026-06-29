<template>
  <el-container class="layout-container">
    <!-- 左侧侧边栏 -->
    <el-aside :width="isCollapse ? '64px' : '220px'" class="layout-aside">
      <div class="logo-area">
        <el-icon size="24" color="#409eff"><Monitor /></el-icon>
        <span v-show="!isCollapse" class="logo-text">活动管理</span>
      </div>
      <el-menu
        :default-active="currentRoute"
        class="side-menu"
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409eff"
        :collapse="isCollapse"
        router
        :collapse-transition="false"
      >
        <el-menu-item index="/activity">
          <el-icon><Calendar /></el-icon>
          <template #title>活动信息管理</template>
        </el-menu-item>
        <el-menu-item index="/schedule">
          <el-icon><List /></el-icon>
          <template #title>会议日程管理</template>
        </el-menu-item>
        <el-menu-item index="/attendee">
          <el-icon><User /></el-icon>
          <template #title>参会人员管理</template>
        </el-menu-item>
        <el-menu-item index="/live">
          <el-icon><Picture /></el-icon>
          <template #title>图文直播管理</template>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <!-- 右侧主区域 -->
    <el-container>
      <!-- 顶部 header -->
      <el-header class="layout-header">
        <div class="header-left">
          <el-icon
            class="collapse-btn"
            size="20"
            @click="isCollapse = !isCollapse"
          >
            <Fold v-if="!isCollapse" />
            <Expand v-else />
          </el-icon>
          <span class="page-title">{{ currentTitle }}</span>
        </div>
        <div class="header-center">
          <!-- 活动选择器 -->
          <div class="activity-selector" v-if="activityList.length > 0">
            <span class="activity-label">当前活动：</span>
            <el-select
              v-model="currentActivityId"
              placeholder="选择活动"
              size="small"
              style="width: 220px"
              @change="handleActivityChange"
              :disabled="activityList.length <= 1"
            >
              <el-option
                v-for="item in activityList"
                :key="item._id || item.id"
                :label="item.title"
                :value="item._id || item.id"
              />
            </el-select>
            <el-button size="small" type="primary" plain @click="showCreateActivity">
              新建活动
            </el-button>
          </div>
        </div>
        <div class="header-right">
          <span class="admin-name">{{ adminName }}</span>
          <el-button type="danger" text @click="handleLogout">
            <el-icon><SwitchButton /></el-icon>
            退出登录
          </el-button>
        </div>
      </el-header>

      <!-- 主内容区域 -->
      <el-main class="layout-main">
        <router-view :key="activityChangeKey" />
      </el-main>
    </el-container>

    <!-- 新建活动对话框 -->
    <el-dialog v-model="createActivityVisible" title="新建活动" width="500px">
      <el-form :model="newActivityForm" label-width="80px">
        <el-form-item label="活动名称">
          <el-input v-model="newActivityForm.title" placeholder="请输入活动名称" />
        </el-form-item>
        <el-form-item label="活动地点">
          <el-input v-model="newActivityForm.location" placeholder="请输入活动地点" />
        </el-form-item>
        <el-form-item label="主办方">
          <el-input v-model="newActivityForm.organizer" placeholder="请输入主办方" />
        </el-form-item>
        <el-form-item label="开始时间">
          <el-input v-model="newActivityForm.start_time" placeholder="如：2026-07-01 09:00" />
        </el-form-item>
        <el-form-item label="结束时间">
          <el-input v-model="newActivityForm.end_time" placeholder="如：2026-07-02 18:00" />
        </el-form-item>
        <el-form-item label="活动描述">
          <el-input v-model="newActivityForm.description" type="textarea" :rows="3" placeholder="请输入活动描述" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createActivityVisible = false">取消</el-button>
        <el-button type="primary" @click="handleCreateActivity" :loading="creatingActivity">确定</el-button>
      </template>
    </el-dialog>
  </el-container>
</template>

<script setup>
import { ref, computed, onMounted, provide } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import {
  Monitor,
  DataBoard,
  Calendar,
  List,
  User,
  Finished,
  Picture,
  Fold,
  Expand,
  SwitchButton
} from '@element-plus/icons-vue'
import { getActivities, createActivity, activateActivity } from '../api'

const router = useRouter()
const route = useRoute()

// 侧边栏是否折叠
const isCollapse = ref(false)

// 当前路由路径，用于菜单高亮
const currentRoute = computed(() => route.path)

// 当前页面标题
const currentTitle = computed(() => route.meta.title || '首页概览')

// 管理员名称
const adminName = computed(() => {
  try {
    const info = JSON.parse(localStorage.getItem('admin_info') || '{}')
    return info.name || info.username || '管理员'
  } catch {
    return '管理员'
  }
})

// ==================== 活动管理 ====================
const activityList = ref([])
const currentActivityId = ref('')
const activityChangeKey = ref(0)

// 提供 currentActivityId 给子组件使用
provide('currentActivityId', currentActivityId)

// 加载活动列表
const loadActivities = async () => {
  try {
    const res = await getActivities()
    if (res.code === 200 || Array.isArray(res)) {
      const list = Array.isArray(res) ? res : (res.data || [])
      activityList.value = list
      // 找到当前活动
      const current = list.find(a => a.is_current === 1)
      if (current) {
        currentActivityId.value = current._id || current.id
      } else if (list.length > 0) {
        currentActivityId.value = list[0]._id || list[0].id
      }
    }
  } catch (err) {
    console.error('加载活动列表失败:', err)
  }
}

// 切换活动
const handleActivityChange = async (activityId) => {
  try {
    await activateActivity(activityId)
    ElMessage.success('已切换活动')
    // 触发子组件刷新
    activityChangeKey.value++
    // 刷新当前页面数据
    router.replace({ path: route.path, query: { t: Date.now() } })
  } catch (err) {
    ElMessage.error('切换活动失败')
    console.error('切换活动失败:', err)
  }
}

// 新建活动
const createActivityVisible = ref(false)
const creatingActivity = ref(false)
const newActivityForm = ref({
  title: '',
  location: '',
  organizer: '',
  start_time: '',
  end_time: '',
  description: ''
})

const showCreateActivity = () => {
  newActivityForm.value = {
    title: '',
    location: '',
    organizer: '',
    start_time: '',
    end_time: '',
    description: ''
  }
  createActivityVisible.value = true
}

const handleCreateActivity = async () => {
  if (!newActivityForm.value.title) {
    return ElMessage.warning('请输入活动名称')
  }
  creatingActivity.value = true
  try {
    await createActivity(newActivityForm.value)
    ElMessage.success('活动创建成功')
    createActivityVisible.value = false
    await loadActivities()
  } catch (err) {
    ElMessage.error('创建活动失败')
    console.error('创建活动失败:', err)
  } finally {
    creatingActivity.value = false
  }
}

// 退出登录
const handleLogout = () => {
  ElMessageBox.confirm('确定要退出登录吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_info')
    ElMessage.success('已退出登录')
    router.push('/login')
  }).catch(() => {
    // 取消操作
  })
}

// 初始化加载
onMounted(() => {
  loadActivities()
})
</script>

<style scoped>
.layout-container {
  height: 100vh;
  overflow: hidden;
}

.layout-aside {
  background-color: #304156;
  transition: width 0.3s;
  overflow: hidden;
}

.logo-area {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background-color: #263445;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
}

.logo-text {
  font-size: 16px;
}

.side-menu {
  border-right: none;
  height: calc(100vh - 60px);
  overflow-y: auto;
}

.side-menu::-webkit-scrollbar {
  width: 0;
}

.layout-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
  border-bottom: 1px solid #ebeef5;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  padding: 0 20px;
  height: 60px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.collapse-btn {
  cursor: pointer;
  color: #606266;
  transition: color 0.3s;
}

.collapse-btn:hover {
  color: #409eff;
}

.page-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-center {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
}

.activity-selector {
  display: flex;
  align-items: center;
  gap: 8px;
}

.activity-label {
  font-size: 13px;
  color: #606266;
  white-space: nowrap;
}

.admin-name {
  font-size: 14px;
  color: #606266;
}

.layout-main {
  background-color: #f0f2f5;
  padding: 20px;
  overflow-y: auto;
  height: calc(100vh - 60px);
}

/* 表格隔行变色 */
:deep(.el-table) {
  --el-table-tr-bg-color: #fff;
}

:deep(.el-table--striped .el-table__body tr.el-table__row--striped td.el-table__cell) {
  background: #fafafa;
}
</style>
