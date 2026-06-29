<template>
  <div class="dashboard-container">
    <!-- 统计卡片区域 -->
    <el-row :gutter="20" class="stat-row">
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card stat-card-total">
          <div class="stat-icon">
            <el-icon size="40" color="#409eff"><User /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ dashboardData.total || 0 }}</div>
            <div class="stat-label">参会总人数</div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card stat-card-checked">
          <div class="stat-icon">
            <el-icon size="40" color="#67c23a"><Finished /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ dashboardData.checkedIn || 0 }}</div>
            <div class="stat-label">已签到人数</div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card stat-card-unchecked">
          <div class="stat-icon">
            <el-icon size="40" color="#e6a23c"><Warning /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ (dashboardData.total || 0) - (dashboardData.checkedIn || 0) }}</div>
            <div class="stat-label">未签到人数</div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card stat-card-rate">
          <div class="stat-icon">
            <el-icon size="40" color="#f56c6c"><TrendCharts /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ checkinRate }}%</div>
            <div class="stat-label">签到率</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 欢迎区域 -->
    <el-card class="welcome-card" shadow="never">
      <template #header>
        <div class="welcome-header">
          <span>欢迎使用内部活动管理系统</span>
        </div>
      </template>
      <div class="welcome-content">
        <p>您可以通过左侧菜单进行以下操作：</p>
        <ul>
          <li><strong>活动信息管理</strong>：编辑和维护活动的基本信息</li>
          <li><strong>会议日程管理</strong>：管理会议日程安排</li>
          <li><strong>参会人员管理</strong>：导入、编辑和导出参会人员信息</li>
          <li><strong>签到管理</strong>：查看签到状态，导出签到报表</li>
          <li><strong>图文直播管理</strong>：上传和管理活动现场图片</li>
        </ul>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { User, Finished, Warning, TrendCharts } from '@element-plus/icons-vue'
import { getDashboard } from '../api'

// 仪表盘数据
const dashboardData = ref({
  total: 0,
  checkedIn: 0
})

// 计算签到率
const checkinRate = computed(() => {
  const total = dashboardData.value.total || 0
  const checkedIn = dashboardData.value.checkedIn || 0
  if (total === 0) return 0
  return ((checkedIn / total) * 100).toFixed(1)
})

// 获取仪表盘数据
const fetchDashboard = async () => {
  try {
    const res = await getDashboard()
    // API 返回: { code: 200, data: { total, checkedIn, notCheckedIn, rate } }
    dashboardData.value = res.data || res || {}
  } catch (error) {
    console.error('获取仪表盘数据失败:', error)
  }
}

onMounted(() => {
  fetchDashboard()
})
</script>

<style scoped>
.dashboard-container {
  min-height: 100%;
}

.stat-row {
  margin-bottom: 20px;
}

.stat-card {
  margin-bottom: 20px;
  border-radius: 8px;
}

.stat-card :deep(.el-card__body) {
  display: flex;
  align-items: center;
  padding: 24px;
  gap: 20px;
}

.stat-icon {
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-card-total .stat-icon {
  background: rgba(64, 158, 255, 0.1);
}

.stat-card-checked .stat-icon {
  background: rgba(103, 194, 58, 0.1);
}

.stat-card-unchecked .stat-icon {
  background: rgba(230, 162, 60, 0.1);
}

.stat-card-rate .stat-icon {
  background: rgba(245, 108, 108, 0.1);
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #303133;
  line-height: 1.2;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-top: 4px;
}

.welcome-card {
  border-radius: 8px;
}

.welcome-header {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.welcome-content p {
  color: #606266;
  margin-bottom: 12px;
}

.welcome-content ul {
  padding-left: 20px;
  color: #606266;
}

.welcome-content li {
  margin-bottom: 8px;
  line-height: 1.6;
}

.welcome-content li strong {
  color: #409eff;
}
</style>
