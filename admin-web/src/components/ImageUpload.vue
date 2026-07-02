<template>
  <div class="image-upload">
    <el-upload
      :action="uploadUrl"
      :headers="uploadHeaders"
      :data="{ folder }"
      :show-file-list="false"
      accept="image/jpeg,image/png,image/webp,image/gif"
      :before-upload="beforeUpload"
      :on-success="onSuccess"
      :on-error="onError"
    >
      <el-button :loading="uploading" size="small">
        {{ modelValue ? '重新上传' : '上传图片' }}
      </el-button>
    </el-upload>
    <template v-if="modelValue">
      <el-image
        v-if="url"
        class="image-preview"
        :src="url"
        :preview-src-list="[url]"
        fit="cover"
      />
      <el-button type="danger" size="small" link @click="remove">删除</el-button>
    </template>
    <span class="file-hint" v-if="tip">{{ tip }}</span>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: { type: String, default: '' },
  url: { type: String, default: '' },
  folder: { type: String, default: 'module-bgs' },
  tip: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'update:url'])

const uploading = ref(false)
const uploadUrl = `${import.meta.env.VITE_API_BASE_URL || '/api'}/admin/upload`
const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}`,
  'X-Activity-Id': localStorage.getItem('current_activity_id') || ''
}))

const beforeUpload = (file) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)
  if (!allowed) {
    ElMessage.error('仅支持 JPG、PNG、WebP 或 GIF 图片')
    return false
  }
  if (file.size > 10 * 1024 * 1024) {
    ElMessage.error('图片不能超过 10MB')
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
  emit('update:url', res.imageUrl || '')
  ElMessage.success('图片上传成功，请点击保存')
}

const onError = () => {
  uploading.value = false
  ElMessage.error('图片上传失败')
}

const remove = () => {
  emit('update:modelValue', '')
  emit('update:url', '')
  ElMessage.success('已删除，请点击保存')
}
</script>

<style scoped>
.image-upload {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.image-preview {
  width: 80px;
  height: 56px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
}
.file-hint {
  font-size: 12px;
  color: #667085;
}
</style>
