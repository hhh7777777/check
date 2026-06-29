<template>
  <el-card>
    <template #header>
      <div class="header-row">
        <span>参会人员管理</span>
        <div class="actions">
          <el-upload :action="importUrl" :headers="uploadHeaders" :show-file-list="false" accept=".xlsx,.xls" :on-success="onImport">
            <el-button type="success">Excel 导入</el-button>
          </el-upload>
          <el-button type="warning" @click="downloadExcel">导出 Excel</el-button>
        </div>
      </div>
    </template>

    <div class="toolbar">
      <el-input v-model="keyword" placeholder="姓名 / 手机号 / 单位 / 参会码" clearable @keyup.enter="load" />
      <el-button type="primary" @click="load">搜索</el-button>
    </div>

    <el-table :data="list" v-loading="loading" border>
      <el-table-column prop="attendeeCode" label="参会码" min-width="140" />
      <el-table-column prop="name" label="姓名" width="100" />
      <el-table-column prop="phone" label="手机号" width="140" />
      <el-table-column prop="organization" label="单位" min-width="180" />
      <el-table-column prop="identityType" label="身份类型" width="100" />
      <el-table-column prop="seatNo" label="座位号" min-width="120" />
      <el-table-column prop="tableNo" label="餐桌号" min-width="100" />
      <el-table-column prop="diningPlace" label="用餐地点" min-width="140" />
      <el-table-column prop="hotelName" label="酒店名称" min-width="140" />
      <el-table-column prop="roomNo" label="房间号" width="100" />
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

    <el-dialog v-model="visible" title="编辑参会人员" width="680px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="姓名" prop="name"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="手机号" prop="phone"><el-input v-model="form.phone" /></el-form-item>
        <el-form-item label="单位"><el-input v-model="form.organization" /></el-form-item>
        <el-form-item label="身份类型"><el-input v-model="form.identityType" /></el-form-item>
        <el-form-item label="座位号"><el-input v-model="form.seatNo" /></el-form-item>
        <el-form-item label="餐桌号"><el-input v-model="form.tableNo" /></el-form-item>
        <el-form-item label="用餐地点"><el-input v-model="form.diningPlace" /></el-form-item>
        <el-form-item label="酒店名称"><el-input v-model="form.hotelName" /></el-form-item>
        <el-form-item label="房间号"><el-input v-model="form.roomNo" /></el-form-item>
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
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { deleteAttendee, exportAttendees, getAttendees, updateAttendee } from '../api'

const loading = ref(false)
const saving = ref(false)
const visible = ref(false)
const formRef = ref()
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const keyword = ref('')
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
  tableNo: '',
  diningPlace: '',
  hotelName: '',
  roomNo: '',
  remark: ''
})
const rules = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  phone: [{ required: true, message: '请输入手机号', trigger: 'blur' }]
}

const load = async () => {
  loading.value = true
  try {
    const res = await getAttendees({ page: page.value, pageSize: pageSize.value, keyword: keyword.value })
    list.value = res.list
    total.value = res.total
  } finally {
    loading.value = false
  }
}

const editRow = (row) => {
  editingId.value = row._id
  Object.assign(form, row)
  visible.value = true
}

const save = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    await updateAttendee(editingId.value, form)
    ElMessage.success('保存成功')
    visible.value = false
    await load()
  } finally {
    saving.value = false
  }
}

const removeRow = async (row) => {
  await ElMessageBox.confirm(`确认删除 ${row.name} 吗？`, '提示', { type: 'warning' })
  await deleteAttendee(row._id)
  ElMessage.success('删除成功')
  await load()
}

const onImport = (res) => {
  const message = res.errors?.length ? `导入 ${res.imported} 条，${res.errors.length} 条失败` : `导入成功 ${res.imported} 条`
  ElMessage.success(message)
  load()
}

const downloadExcel = async () => {
  const blob = await exportAttendees({ keyword: keyword.value })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'attendees.xlsx'
  link.click()
  URL.revokeObjectURL(url)
}

load()
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
