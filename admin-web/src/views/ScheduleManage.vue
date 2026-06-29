<template>
  <el-card>
    <template #header>
      <div class="header-row">
        <span>会议日程管理</span>
        <el-button type="primary" @click="openCreate">新增日程</el-button>
      </div>
    </template>

    <el-table :data="list" v-loading="loading" border>
      <el-table-column prop="date" label="日期" width="120" />
      <el-table-column prop="startTime" label="开始" width="100" />
      <el-table-column prop="endTime" label="结束" width="100" />
      <el-table-column prop="title" label="主题" min-width="220" />
      <el-table-column prop="location" label="地点" min-width="160" />
      <el-table-column prop="speaker" label="主讲人" min-width="120" />
      <el-table-column prop="sortOrder" label="排序" width="80" />
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <el-button link type="primary" @click="editRow(row)">编辑</el-button>
          <el-button link type="danger" @click="removeRow(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="visible" :title="editingId ? '编辑日程' : '新增日程'" width="560px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="日期" prop="date"><el-input v-model="form.date" placeholder="2026-06-24" /></el-form-item>
        <el-form-item label="开始时间" prop="startTime"><el-input v-model="form.startTime" placeholder="09:00" /></el-form-item>
        <el-form-item label="结束时间" prop="endTime"><el-input v-model="form.endTime" placeholder="09:30" /></el-form-item>
        <el-form-item label="主题" prop="title"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="地点"><el-input v-model="form.location" /></el-form-item>
        <el-form-item label="主讲人"><el-input v-model="form.speaker" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" /></el-form-item>
        <el-form-item label="排序号"><el-input-number v-model="form.sortOrder" :min="0" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { addSchedule, deleteSchedule, getSchedules, updateSchedule } from '../api'

const loading = ref(false)
const saving = ref(false)
const visible = ref(false)
const editingId = ref('')
const formRef = ref()
const list = ref([])
const form = reactive({
  date: '',
  startTime: '',
  endTime: '',
  title: '',
  location: '',
  speaker: '',
  remark: '',
  sortOrder: 0
})
const rules = {
  date: [{ required: true, message: '请输入日期', trigger: 'blur' }],
  startTime: [{ required: true, message: '请输入开始时间', trigger: 'blur' }],
  endTime: [{ required: true, message: '请输入结束时间', trigger: 'blur' }],
  title: [{ required: true, message: '请输入主题', trigger: 'blur' }]
}

const reset = () => {
  Object.assign(form, {
    date: '',
    startTime: '',
    endTime: '',
    title: '',
    location: '',
    speaker: '',
    remark: '',
    sortOrder: 0
  })
  editingId.value = ''
}

const load = async () => {
  loading.value = true
  try {
    list.value = await getSchedules()
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  reset()
  visible.value = true
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
    if (editingId.value) {
      await updateSchedule(editingId.value, form)
    } else {
      await addSchedule(form)
    }
    ElMessage.success('保存成功')
    visible.value = false
    await load()
  } finally {
    saving.value = false
  }
}

const removeRow = async (row) => {
  await ElMessageBox.confirm(`确认删除日程“${row.title}”吗？`, '提示', { type: 'warning' })
  await deleteSchedule(row._id)
  ElMessage.success('删除成功')
  await load()
}

load()
</script>

<style scoped>
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
