<template>
  <div class="checkin-manage">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span class="card-title">签到管理</span>
          <div class="header-actions">
            <el-dropdown @command="handleExport">
              <el-button type="warning">
                <el-icon><Download /></el-icon>
                导出名单
                <el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="checked">导出已签到名单</el-dropdown-item>
                  <el-dropdown-item command="unchecked">导出未签到名单</el-dropdown-item>
                  <el-dropdown-item command="all">导出全部名单</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </template>

      <!-- 搜索筛选 -->
      <div class="search-bar">
        <el-form :inline="true" :model="searchParams">
          <el-form-item label="关键词">
            <el-input
              v-model="searchParams.keyword"
              placeholder="姓名/参会码/单位"
              clearable
              @keyup.enter="handleSearch"
            />
          </el-form-item>
          <el-form-item label="签到状态">
            <el-select v-model="searchParams.status" placeholder="全部" clearable>
              <el-option label="已签到" value="checked_in" />
              <el-option label="未签到" value="not_checked_in" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleSearch">
              <el-icon><Search /></el-icon>
              搜索
            </el-button>
            <el-button @click="handleReset">
              <el-icon><Refresh /></el-icon>
              重置
            </el-button>
          </el-form-item>
        </el-form>
      </div>

      <!-- 签到列表 -->
      <el-table
        :data="checkinList"
        stripe
        v-loading="loading"
        border
        style="width: 100%"
      >
        <el-table-column prop="attendeeCode" label="参会码" min-width="120" />
        <el-table-column prop="name" label="姓名" min-width="100" />
        <el-table-column prop="organization" label="单位" min-width="160" show-overflow-tooltip />
        <el-table-column prop="identityType" label="身份类型" min-width="120" />
        <el-table-column label="签到状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.status === 'checked_in' || row.checkedIn" type="success" size="small">
              已签到
            </el-tag>
            <el-tag v-else type="info" size="small">未签到</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="签到时间" min-width="170">
          <template #default="{ row }">
            {{ row.checkinTime || row.checkin_time || '-' }}
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, ArrowDown, Search, Refresh } from '@element-plus/icons-vue'
import { getCheckinList, exportAttendees } from '../api'

// 列表数据
const checkinList = ref([])
// 加载状态
const loading = ref(false)

// 搜索参数
const searchParams = reactive({
  keyword: '',
  status: ''
})

// 分页参数
const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

// 获取签到列表
const fetchCheckinList = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      ...searchParams
    }
    // 移除空参数
    Object.keys(params).forEach((key) => {
      if (params[key] === '' || params[key] === null || params[key] === undefined) {
        delete params[key]
      }
    })
    const res = await getCheckinList(params)
    const data = res.data || res
    checkinList.value = Array.isArray(data) ? data : (data.list || data.items || [])
    pagination.total = data.total || 0
  } catch (error) {
    console.error('获取签到列表失败:', error)
  } finally {
    loading.value = false
  }
}

// 搜索
const handleSearch = () => {
  pagination.page = 1
  fetchCheckinList()
}

// 重置
const handleReset = () => {
  searchParams.keyword = ''
  searchParams.status = ''
  pagination.page = 1
  fetchCheckinList()
}

// 分页大小变化
const handleSizeChange = (val) => {
  pagination.pageSize = val
  pagination.page = 1
  fetchCheckinList()
}

// 页码变化
const handlePageChange = (val) => {
  pagination.page = val
  fetchCheckinList()
}

// 导出名单
const handleExport = async (command) => {
  try {
    const statusMap = {
      checked: 'checked_in',
      unchecked: 'not_checked_in',
      all: ''
    }
    const labelMap = {
      checked: '已签到',
      unchecked: '未签到',
      all: '全部'
    }

    const params = { status: statusMap[command] }
    if (params.status === '') delete params.status

    const res = await exportAttendees(params)

    // 创建 blob 下载
    const blob = new Blob([res], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${labelMap[command]}名单_${new Date().toLocaleDateString()}.xlsx`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    ElMessage.success(`${labelMap[command]}名单导出成功`)
  } catch (error) {
    console.error('导出失败:', error)
  }
}

onMounted(() => {
  fetchCheckinList()
})
</script>

<style scoped>
.checkin-manage {
  min-height: 100%;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.search-bar {
  margin-bottom: 16px;
}

.search-bar .el-form-item {
  margin-bottom: 12px;
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  padding: 8px 0;
}
</style>
