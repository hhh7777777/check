<template>
  <div>
    <div class="page-head">
      <div><h2>账号管理</h2><p>审核注册申请、停用账号或重置同事密码。</p></div>
      <el-button @click="loadUsers">刷新</el-button>
    </div>
    <el-card>
      <el-table :data="users" v-loading="loading">
        <el-table-column label="用户" min-width="150">
          <template #default="{ row }"><strong>{{ row.name || row.username }}</strong><div class="muted">@{{ row.username }}</div></template>
        </el-table-column>
        <el-table-column prop="department" label="部门" min-width="120" />
        <el-table-column label="身份" width="120">
          <template #default="{ row }"><el-tag :type="row.role === 'superadmin' ? 'danger' : 'info'">{{ row.role === 'superadmin' ? '超级管理员' : '普通用户' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }"><el-tag :type="statusType[row.status]">{{ statusText[row.status] || row.status }}</el-tag></template>
        </el-table-column>
        <el-table-column label="注册时间" min-width="170"><template #default="{ row }">{{ formatTime(row.createdAt) }}</template></el-table-column>
        <el-table-column label="操作" width="270" fixed="right">
          <template #default="{ row }">
            <template v-if="row.role !== 'superadmin'">
              <el-button v-if="row.status !== 'active'" type="success" link @click="setStatus(row, 'active')">审核通过</el-button>
              <el-button v-else type="danger" link @click="setStatus(row, 'disabled')">停用</el-button>
              <el-button type="primary" link @click="openReset(row)">重置密码</el-button>
            </template>
            <span v-else class="muted">系统保留账号</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
    <el-dialog v-model="resetVisible" title="重置密码" width="420px">
      <p>为 {{ current?.name || current?.username }} 设置临时密码。</p>
      <el-input v-model="temporaryPassword" type="password" show-password placeholder="至少 8 位，包含字母和数字" />
      <template #footer><el-button @click="resetVisible = false">取消</el-button><el-button type="primary" @click="resetPassword">确认重置</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getAdminUsers, updateAdminUserStatus, resetAdminUserPassword } from '../api'

const users = ref([])
const loading = ref(false)
const resetVisible = ref(false)
const current = ref(null)
const temporaryPassword = ref('')
const statusText = { pending: '待审核', active: '已启用', disabled: '已停用' }
const statusType = { pending: 'warning', active: 'success', disabled: 'danger' }
const formatTime = (value) => value ? new Date(value).toLocaleString('zh-CN') : '-'
const loadUsers = async () => {
  loading.value = true
  try { users.value = await getAdminUsers() } finally { loading.value = false }
}
const setStatus = async (row, status) => {
  await ElMessageBox.confirm(status === 'active' ? `确认启用 ${row.name || row.username}？` : `确认停用 ${row.name || row.username}？`, '账号状态确认')
  await updateAdminUserStatus(row._id, status)
  ElMessage.success(status === 'active' ? '账号已启用' : '账号已停用')
  loadUsers()
}
const openReset = (row) => {
  current.value = row
  temporaryPassword.value = ''
  resetVisible.value = true
}
const resetPassword = async () => {
  if (!/^(?=.*[A-Za-z])(?=.*\d).{8,72}$/.test(temporaryPassword.value)) {
    ElMessage.warning('临时密码至少 8 位，且包含字母和数字')
    return
  }
  await resetAdminUserPassword(current.value._id, temporaryPassword.value)
  ElMessage.success('密码已重置')
  resetVisible.value = false
}
loadUsers()
</script>

<style scoped>
.page-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
h2 { margin: 0; }
.page-head p { margin: 6px 0 0; color: #667085; }
.muted { color: #98a2b3; font-size: 12px; margin-top: 4px; }
</style>
