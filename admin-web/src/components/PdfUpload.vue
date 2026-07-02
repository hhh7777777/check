<template>
  <div class="pdf-upload">
    <el-upload
      :action="uploadUrl"
      :headers="uploadHeaders"
      :show-file-list="false"
      accept=".pdf,application/pdf"
      :before-upload="beforeUpload"
      :on-success="onSuccess"
      :on-error="onError"
    >
      <el-button :loading="uploading" size="small">
        {{ modelValue ? '重新上传' : '上传PDF' }}
      </el-button>
    </el-upload>
    <template v-if="modelValue">
      <span class="file-name">
        <el-icon><Document /></el-icon>
        已上传PDF
      </span>
      <el-button type="danger" size="small" link @click="remove">删除</el-button>
    </template>
    <span class="file-hint">支持 PDF 格式，最大 20MB</span>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Document } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  url: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'update:url'])

const uploading = ref(false)
const uploadUrl = `${import.meta.env.VITE_API_BASE_URL || '/api'}/admin/upload-pdf`
const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}`,
  'X-Activity-Id': localStorage.getItem('current_activity_id') || ''
}))

const beforeUpload = (file) => {
  if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
    ElMessage.error('仅支持 PDF 格式文件')
    return false
  }
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.error('PDF 文件不能超过 20MB')
    return false
  }
  uploading.value = true
  return true
}

const onSuccess = (res) => {
  uploading.value = false
  if (!res?.fileID) {
    ElMessage.error(res?.error || '上传失败')
    return
  }
  emit('update:modelValue', res.fileID)
  emit('update:url', res.pdfUrl || '')
  ElMessage.success('PDF 上传成功，请点击保存')
}

const onError = () => {
  uploading.value = false
  ElMessage.error('PDF 上传失败')
}

const remove = () => {
  emit('update:modelValue', '')
  emit('update:url', '')
  ElMessage.success('已删除，请点击保存')
}
</script>

<style scoped>
.pdf-upload {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.file-name {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #3b82f6;
  font-size: 13px;
}
.file-hint {
  font-size: 12px;
  color: #667085;
}
</style>
