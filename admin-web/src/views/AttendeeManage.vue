<template>
  <el-card>
    <template #header>
      <div class="header-row">
        <span>参会人员管理</span>
        <div class="actions">
          <el-button type="primary" @click="openAdd">添加参会人员</el-button>
          <el-upload :action="importUrl" :headers="uploadHeaders" :show-file-list="false" accept=".xlsx,.xls" :on-success="onImport">
            <el-button type="success">Excel 导入</el-button>
          </el-upload>
          <el-button type="success" plain @click="downloadExcel('checkedIn')">导出已签到名单</el-button>
          <el-button type="warning" @click="downloadExcel('all')">导出全部名单</el-button>
        </div>
      </div>
    </template>

    <div class="toolbar">
      <el-input v-model="keyword" placeholder="姓名 / 手机号 / 单位 / 参会码" clearable @keyup.enter="load" />
      <el-select v-model="checkInStatus" placeholder="签到状态" style="width: 150px" @change="onFilterChange">
        <el-option label="全部人员" value="all" />
        <el-option label="已签到" value="checkedIn" />
        <el-option label="未签到" value="notCheckedIn" />
      </el-select>
      <el-button type="primary" @click="load">搜索</el-button>
    </div>

    <el-table :data="list" v-loading="loading" border>
      <el-table-column prop="attendeeCode" label="参会码" min-width="140" />
      <el-table-column prop="name" label="姓名" width="100" />
      <el-table-column prop="phone" label="手机号" width="140" />
      <el-table-column prop="organization" label="单位" min-width="180" />
      <el-table-column prop="identityType" label="身份类型" width="100" />
      <el-table-column prop="seatNo" label="座位号" min-width="120" />
      <el-table-column label="签到状态" width="110" fixed="right">
        <template #default="{ row }">
          <el-tag :type="row.checkedIn ? 'success' : 'info'">{{ row.checkedIn ? '已签到' : '未签到' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="签到时间" min-width="180">
        <template #default="{ row }">{{ formatDateTime(row.checkedInAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="editRow(row)">编辑</el-button>
          <el-button link type="danger" @click="removeRow(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" layout="total, prev, pager, next" @current-change="load" />
    </div>

    <el-dialog v-model="visible" :title="editingId ? '编辑参会人员' : '添加参会人员'" width="680px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="姓名" prop="name"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="手机号" prop="phone"><el-input v-model="form.phone" /></el-form-item>
        <el-form-item label="单位"><el-input v-model="form.organization" /></el-form-item>
        <el-form-item label="身份类型"><el-input v-model="form.identityType" /></el-form-item>
        <el-form-item label="座位号"><el-input v-model="form.seatNo" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createAttendee, deleteAttendee, exportAttendees, getAttendees, updateAttendee } from '../api'

const loading = ref(false)
const saving = ref(false)
const visible = ref(false)
const formRef = ref()
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const keyword = ref('')
const checkInStatus = ref('all')
const editingId = ref('')
const importUrl = `${import.meta.env.VITE_API_BASE_URL || '/api'}/admin/attendees/import`
const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}`,
  'X-Activity-Id': localStorage.getItem('current_activity_id') || ''
}))
const form = reactive({
  name: '',
  phone: '',
  organization: '',
  identityType: '',
  seatNo: '',
  remark: ''
})
const rules = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  phone: [{ required: true, message: '请输入手机号', trigger: 'blur' }]
}

const load = async () => {
  loading.value = true
  try {
    const res = await getAttendees({
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value,
      checkInStatus: checkInStatus.value
    })
    list.value = res.list
    total.value = res.total
  } finally {
    loading.value = false
  }
}

const onFilterChange = () => {
  page.value = 1
  load()
}

const formatDateTime = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

const editRow = (row) => {
  editingId.value = row._id
  Object.assign(form, row)
  visible.value = true
}

const openAdd = () => {
  editingId.value = ''
  Object.assign(form, { name: '', phone: '', organization: '', identityType: '', seatNo: '', remark: '' })
  visible.value = true
}

const save = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    if (editingId.value) {
      await updateAttendee(editingId.value, form)
    } else {
      await createAttendee(form)
    }
    ElMessage.success(editingId.value ? '保存成功' : '添加成功')
    visible.value = false
    await load()
  } finally {
    saving.value = false
  }
}

const removeRow = async (row) => {
  try {
    await ElMessageBox.confirm(`确认删除 ${row.name} 吗？`, '提示', { type: 'warning' })
    await deleteAttendee(row._id)
    ElMessage.success('删除成功')
    await load()
  } catch (_) {}
}

const onImport = (res) => {
  if (res.errors?.length) {
    ElMessage.warning(`导入 ${res.imported} 条，${res.errors.length} 条失败`)
  } else {
    ElMessage.success(`导入成功 ${res.imported} 条`)
  }
  load()
}

const downloadExcel = async (status) => {
  const blob = await exportAttendees({ keyword: keyword.value, checkInStatus: status })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = status === 'checkedIn' ? '已签到人员名单.xlsx' : '全部参会人员名单.xlsx'
  link.click()
  URL.revokeObjectURL(url)
}

let refreshTimer
const startPolling = () => {
  if (refreshTimer) window.clearInterval(refreshTimer)
  refreshTimer = window.setInterval(() => {
    if (!visible.value) load()
  }, 10000)
}
const stopPolling = () => {
  if (refreshTimer) { window.clearInterval(refreshTimer); refreshTimer = null }
}
onMounted(() => {
  load()
  startPolling()
})
onUnmounted(() => {
  stopPolling()
})

watch(visible, (open) => {
  if (open) stopPolling(); else startPolling()
})
</script>

<style scoped>
.header-row,
.toolbar,
.actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-row {
  justify-content: space-between;
}

.toolbar {
  margin-bottom: 16px;
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
