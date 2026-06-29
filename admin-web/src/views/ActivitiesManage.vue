<template>
  <el-card>
    <template #header>
      <div class="header-row">
        <span>活动列表</span>
        <el-button type="primary" @click="openCreate">新建活动</el-button>
      </div>
    </template>

    <el-table :data="activities" v-loading="loading" border>
      <el-table-column prop="title" label="活动名称" min-width="220" />
      <el-table-column prop="startTime" label="开始时间" min-width="160" />
      <el-table-column prop="location" label="地点" min-width="160" />
      <el-table-column prop="attendeeCount" label="参会人数" width="100" />
      <el-table-column prop="liveImageCount" label="直播图片" width="100" />
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="row.isCurrent ? 'success' : 'info'">{{ row.isCurrent ? '当前活动' : '历史活动' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="editActivity(row)">编辑</el-button>
          <el-button link type="success" :disabled="row.isCurrent" @click="setCurrent(row)">设为当前</el-button>
          <el-button link type="danger" :disabled="row.isCurrent" @click="removeActivity(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="visible" :title="editingId ? '编辑活动' : '新建活动'" width="640px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="活动名称" prop="title"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="开始时间"><el-input v-model="form.startTime" placeholder="2026-06-24 09:00" /></el-form-item>
        <el-form-item label="结束时间"><el-input v-model="form.endTime" placeholder="2026-06-24 18:00" /></el-form-item>
        <el-form-item label="活动地点"><el-input v-model="form.location" /></el-form-item>
        <el-form-item label="主办单位"><el-input v-model="form.organizer" /></el-form-item>
        <el-form-item label="承办单位"><el-input v-model="form.coOrganizer" /></el-form-item>
        <el-form-item label="活动介绍"><el-input v-model="form.description" type="textarea" :rows="4" /></el-form-item>
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
import { activateActivity, createActivity, deleteActivity, getActivities, updateActivityById } from '../api'

const loading = ref(false)
const saving = ref(false)
const visible = ref(false)
const editingId = ref('')
const formRef = ref()
const activities = ref([])
const form = reactive({
  title: '',
  startTime: '',
  endTime: '',
  location: '',
  organizer: '',
  coOrganizer: '',
  description: ''
})
const rules = { title: [{ required: true, message: '请输入活动名称', trigger: 'blur' }] }

const resetForm = () => {
  Object.assign(form, {
    title: '',
    startTime: '',
    endTime: '',
    location: '',
    organizer: '',
    coOrganizer: '',
    description: ''
  })
  editingId.value = ''
}

const load = async () => {
  loading.value = true
  try {
    activities.value = await getActivities()
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  resetForm()
  visible.value = true
}

const editActivity = (row) => {
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
      await updateActivityById(editingId.value, form)
    } else {
      await createActivity(form)
    }
    ElMessage.success('保存成功')
    visible.value = false
    await load()
  } finally {
    saving.value = false
  }
}

const setCurrent = async (row) => {
  await activateActivity(row._id)
  localStorage.setItem('current_activity_id', row._id)
  ElMessage.success('已切换当前活动')
  await load()
}

const removeActivity = async (row) => {
  await ElMessageBox.confirm(`确认删除活动“${row.title}”吗？`, '提示', { type: 'warning' })
  await deleteActivity(row._id)
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
