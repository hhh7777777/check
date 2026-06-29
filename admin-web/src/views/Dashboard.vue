<template>
  <div class="dashboard-grid">
    <el-card>
      <div class="metric-label">当前活动</div>
      <div class="metric-value">{{ data.activity?.title || '-' }}</div>
    </el-card>
    <el-card>
      <div class="metric-label">参会人数</div>
      <div class="metric-value">{{ data.attendeeCount || 0 }}</div>
    </el-card>
    <el-card>
      <div class="metric-label">直播图片</div>
      <div class="metric-value">{{ data.liveImageCount || 0 }}</div>
    </el-card>
    <el-card>
      <div class="metric-label">最近更新时间</div>
      <div class="metric-value small">{{ data.updatedAt || '-' }}</div>
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { getDashboard } from '../api'

const data = ref({})

const load = async () => {
  data.value = await getDashboard()
}

load()
</script>

<style scoped>
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.metric-label {
  color: #667085;
  margin-bottom: 12px;
}

.metric-value {
  font-size: 28px;
  font-weight: 700;
}

.metric-value.small {
  font-size: 16px;
}
</style>
