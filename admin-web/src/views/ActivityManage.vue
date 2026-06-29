<template>
  <div class="activity-manage">
    <el-card shadow="never" class="form-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">活动信息编辑</span>
          <el-button type="primary" :loading="saving" @click="handleSave">
            <el-icon><Check /></el-icon>
            保存
          </el-button>
        </div>
      </template>

      <el-form
        ref="formRef"
        :model="activityForm"
        :rules="rules"
        label-width="120px"
        size="default"
        v-loading="loading"
      >
        <el-row :gutter="24">
          <el-col :span="24">
            <el-form-item label="活动名称" prop="name">
              <el-input v-model="activityForm.name" placeholder="请输入活动名称" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="开始时间" prop="startTime">
              <el-date-picker
                v-model="activityForm.startTime"
                type="datetime"
                placeholder="请选择开始时间"
                format="YYYY-MM-DD HH:mm"
                value-format="YYYY-MM-DD HH:mm:ss"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="结束时间" prop="endTime">
              <el-date-picker
                v-model="activityForm.endTime"
                type="datetime"
                placeholder="请选择结束时间"
                format="YYYY-MM-DD HH:mm"
                value-format="YYYY-MM-DD HH:mm:ss"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="活动地点" prop="location">
              <el-input v-model="activityForm.location" placeholder="请输入活动地点" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="联系电话" prop="contactPhone">
              <el-input v-model="activityForm.contactPhone" placeholder="请输入联系电话" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="主办单位" prop="organizer">
              <el-input v-model="activityForm.organizer" placeholder="请输入主办单位" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="承办单位" prop="coOrganizer">
              <el-input v-model="activityForm.coOrganizer" placeholder="请输入承办单位" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="24">
          <el-col :span="24">
            <el-form-item label="活动介绍" prop="description">
              <el-input
                v-model="activityForm.description"
                type="textarea"
                :rows="4"
                placeholder="请输入活动介绍"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="24">
          <el-col :span="24">
            <el-form-item label="交通说明" prop="trafficInfo">
              <el-input
                v-model="activityForm.trafficInfo"
                type="textarea"
                :rows="3"
                placeholder="请输入交通说明"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="24">
          <el-col :span="24">
            <el-form-item label="地图图片" prop="mapImage">
              <el-upload
                class="map-uploader"
                :action="uploadAction"
                :headers="uploadHeaders"
                :show-file-list="false"
                :on-success="handleMapUploadSuccess"
                :before-upload="beforeMapUpload"
              >
                <img v-if="activityForm.mapImage" :src="activityForm.mapImage" class="map-preview" />
                <el-icon v-else class="map-uploader-icon"><Plus /></el-icon>
              </el-upload>
              <div class="upload-tip">支持 jpg/png 格式，大小不超过 5MB</div>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, Plus } from '@element-plus/icons-vue'
import { getActivity, updateActivity } from '../api'

// 表单引用
const formRef = ref(null)
// 加载状态
const loading = ref(false)
// 保存状态
const saving = ref(false)

// 上传接口地址
const uploadAction = `${import.meta.env.VITE_API_BASE_URL || '/api'}/admin/upload`
// 上传请求头（带 token）
const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}`
}))

// 活动表单数据
const activityForm = reactive({
  name: '',
  startTime: '',
  endTime: '',
  location: '',
  organizer: '',
  coOrganizer: '',
  description: '',
  trafficInfo: '',
  contactPhone: '',
  mapImage: '',
  mapFileId: ''
})

// 表单校验规则
const rules = {
  name: [
    { required: true, message: '请输入活动名称', trigger: 'blur' }
  ],
  startTime: [
    { required: true, message: '请选择开始时间', trigger: 'change' }
  ],
  endTime: [
    { required: true, message: '请选择结束时间', trigger: 'change' }
  ],
  location: [
    { required: true, message: '请输入活动地点', trigger: 'blur' }
  ]
}

// 获取活动信息
const fetchActivity = async () => {
  loading.value = true
  try {
    const res = await getActivity()
    const data = res.data || res || {}
    Object.keys(activityForm).forEach((key) => {
      if (data[key] !== undefined && data[key] !== null) {
        activityForm[key] = data[key]
      }
    })
  } catch (error) {
    console.error('获取活动信息失败:', error)
  } finally {
    loading.value = false
  }
}

// 保存活动信息
const handleSave = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid) => {
    if (!valid) return

    saving.value = true
    try {
      await updateActivity({ ...activityForm })
      ElMessage.success('保存成功')
    } catch (error) {
      console.error('保存失败:', error)
    } finally {
      saving.value = false
    }
  })
}

// 图片上传前校验
const beforeMapUpload = (file) => {
  const isImage = file.type === 'image/jpeg' || file.type === 'image/png'
  const isLt5M = file.size / 1024 / 1024 < 5

  if (!isImage) {
    ElMessage.error('地图图片只能是 JPG/PNG 格式')
    return false
  }
  if (!isLt5M) {
    ElMessage.error('地图图片大小不能超过 5MB')
    return false
  }
  return true
}

// 图片上传成功
const handleMapUploadSuccess = (response) => {
  const url = response.url || response.data?.url
  if (url) {
    activityForm.mapImage = url
    activityForm.mapFileId = response.fileId || response.data?.fileId || ''
    ElMessage.success('图片上传成功')
  }
}

onMounted(() => {
  fetchActivity()
})
</script>

<style scoped>
.activity-manage {
  min-height: 100%;
}

.form-card {
  border-radius: 8px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.map-uploader {
  width: 360px;
  height: 240px;
  border: 1px dashed #d9d9d9;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.3s;
}

.map-uploader:hover {
  border-color: #409eff;
}

.map-uploader-icon {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 28px;
  color: #8c939d;
}

.map-preview {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.upload-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 8px;
}
</style>
