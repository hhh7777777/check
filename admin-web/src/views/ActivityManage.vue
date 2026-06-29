<template>
  <el-card>
    <template #header>
      <div class="header-row">
        <span>当前选中活动信息</span>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </div>
    </template>

    <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" v-loading="loading">
      <el-form-item label="活动名称" prop="title"><el-input v-model="form.title" /></el-form-item>
      <el-form-item label="开始时间"><el-input v-model="form.startTime" placeholder="2026-06-24 09:00" /></el-form-item>
      <el-form-item label="结束时间"><el-input v-model="form.endTime" placeholder="2026-06-24 18:00" /></el-form-item>
      <el-form-item label="活动地点"><el-input v-model="form.location" /></el-form-item>
      <el-form-item label="主办单位"><el-input v-model="form.organizer" /></el-form-item>
      <el-form-item label="承办单位"><el-input v-model="form.coOrganizer" /></el-form-item>
      <el-form-item label="联系人"><el-input v-model="form.contactPerson" /></el-form-item>
      <el-form-item label="联系电话"><el-input v-model="form.contactPhone" /></el-form-item>
      <el-form-item label="活动介绍"><el-input v-model="form.description" type="textarea" :rows="4" /></el-form-item>
      <el-form-item label="交通说明"><el-input v-model="form.trafficInfo" type="textarea" :rows="3" /></el-form-item>
      <el-form-item label="地图图片">
        <el-upload :action="uploadUrl" :headers="uploadHeaders" :data="{ folder: 'maps' }" :show-file-list="false" :on-success="(res) => (form.mapImageFileID = res.fileID)">
          <el-button>上传地图图</el-button>
        </el-upload>
        <span class="file-hint">{{ form.mapImageFileID || '未上传' }}</span>
      </el-form-item>
      <el-form-item label="封面图片">
        <el-upload :action="uploadUrl" :headers="uploadHeaders" :data="{ folder: 'covers' }" :show-file-list="false" :on-success="(res) => (form.coverImageFileID = res.fileID)">
          <el-button>上传封面图</el-button>
        </el-upload>
        <span class="file-hint">{{ form.coverImageFileID || '未上传' }}</span>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getActivity, updateActivity } from '../api'

const formRef = ref()
const loading = ref(false)
const saving = ref(false)
const form = reactive({
  title: '',
  startTime: '',
  endTime: '',
  location: '',
  organizer: '',
  coOrganizer: '',
  contactPerson: '',
  contactPhone: '',
  description: '',
  trafficInfo: '',
  mapImageFileID: '',
  coverImageFileID: ''
})
const rules = { title: [{ required: true, message: '请输入活动名称', trigger: 'blur' }] }
const uploadUrl = `${import.meta.env.VITE_API_BASE_URL || '/api'}/admin/upload`
const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}`,
  'X-Activity-Id': localStorage.getItem('current_activity_id') || ''
}))

const load = async () => {
  loading.value = true
  try {
    Object.assign(form, await getActivity())
  } finally {
    loading.value = false
  }
}

const save = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    await updateActivity(form)
    ElMessage.success('保存成功')
  } finally {
    saving.value = false
  }
}

load()
</script>

<style scoped>
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.file-hint {
  margin-left: 12px;
  color: #667085;
}
</style>
