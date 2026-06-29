<template>
  <el-card>
    <template #header>
      <div class="header-row">
        <span>图文直播管理</span>
        <el-upload :action="uploadUrl" :headers="uploadHeaders" :show-file-list="false" :on-success="load">
          <el-button type="primary">上传图片</el-button>
        </el-upload>
      </div>
    </template>

    <div class="grid" v-loading="loading">
      <el-card v-for="item in list" :key="item._id" class="image-card">
        <img :src="item.imageUrl" class="preview" />
        <el-input v-model="item.title" placeholder="标题" @blur="saveItem(item)" />
        <div class="inline-row">
          <el-input-number v-model="item.sortOrder" :min="0" @change="saveItem(item)" />
          <el-switch v-model="item.isVisible" @change="saveItem(item)" />
        </div>
        <el-button link type="danger" @click="removeItem(item)">删除</el-button>
      </el-card>
    </div>
  </el-card>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { deleteLiveImage, getLiveImages, updateLiveImage } from '../api'

const loading = ref(false)
const list = ref([])
const uploadUrl = `${import.meta.env.VITE_API_BASE_URL || '/api'}/admin/live-images`
const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}`,
  'X-Activity-Id': localStorage.getItem('current_activity_id') || ''
}))

const load = async () => {
  loading.value = true
  try {
    list.value = await getLiveImages()
  } finally {
    loading.value = false
  }
}

const saveItem = async (item) => {
  await updateLiveImage(item._id, {
    title: item.title,
    sortOrder: item.sortOrder,
    isVisible: item.isVisible
  })
}

const removeItem = async (item) => {
  await ElMessageBox.confirm('确认删除这张图片吗？', '提示', { type: 'warning' })
  await deleteLiveImage(item._id)
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

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.image-card {
  display: grid;
  gap: 12px;
}

.preview {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 12px;
  background: #f3f4f6;
}

.inline-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
