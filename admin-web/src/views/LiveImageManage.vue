<template>
  <div class="live-image-manage">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span class="card-title">图文直播管理</span>
          <el-upload
            :action="uploadUrl"
            :headers="uploadHeaders"
            :show-file-list="false"
            :on-success="handleUploadSuccess"
            :on-error="handleUploadError"
            :before-upload="beforeUpload"
          >
            <el-button type="primary">
              <el-icon><Upload /></el-icon>
              上传图片
            </el-button>
          </el-upload>
        </div>
      </template>

      <!-- 图片列表 -->
      <div class="image-list" v-loading="loading">
        <el-empty v-if="imageList.length === 0 && !loading" description="暂无图片" />

        <el-row :gutter="16" v-else>
          <el-col
            v-for="item in imageList"
            :key="item._id || item.id"
            :xs="24"
            :sm="12"
            :md="8"
            :lg="6"
          >
            <el-card class="image-card" shadow="hover">
              <!-- 图片预览 -->
              <div class="image-wrapper">
                <el-image
                  :src="item.url || item.imageUrl"
                  fit="cover"
                  class="preview-image"
                  :preview-src-list="[item.url || item.imageUrl]"
                  preview-teleported
                />
              </div>

              <!-- 图片信息 -->
              <div class="image-info">
                <el-form size="small" label-width="60px">
                  <el-form-item label="标题">
                    <el-input
                      v-model="item.title"
                      placeholder="请输入标题"
                      @blur="handleUpdate(item)"
                    />
                  </el-form-item>
                  <el-form-item label="排序">
                    <el-input-number
                      v-model="item.sortOrder"
                      :min="0"
                      :max="999"
                      size="small"
                      controls-position="right"
                      @change="handleUpdate(item)"
                    />
                  </el-form-item>
                  <el-form-item label="显示">
                    <el-switch
                      v-model="item.visible"
                      :active-value="true"
                      :inactive-value="false"
                      @change="handleUpdate(item)"
                    />
                  </el-form-item>
                </el-form>
              </div>

              <!-- 删除按钮 -->
              <div class="image-actions">
                <el-popconfirm
                  title="确定要删除这张图片吗？"
                  confirm-button-text="确定"
                  cancel-button-text="取消"
                  @confirm="handleDelete(item._id || item.id)"
                >
                  <template #reference>
                    <el-button type="danger" size="small" text>
                      <el-icon><Delete /></el-icon>
                      删除
                    </el-button>
                  </template>
                </el-popconfirm>
              </div>
            </el-card>
          </el-col>
        </el-row>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Upload, Delete } from '@element-plus/icons-vue'
import { getLiveImages, uploadLiveImage, updateLiveImage, deleteLiveImage } from '../api'

// 上传接口地址
const uploadUrl = `${import.meta.env.VITE_API_BASE_URL || '/api'}/admin/live-images`
// 上传请求头
const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}`
}))

// 图片列表
const imageList = ref([])
// 加载状态
const loading = ref(false)

// 获取图片列表
const fetchImages = async () => {
  loading.value = true
  try {
    const res = await getLiveImages()
    const data = res.data || res
    imageList.value = Array.isArray(data) ? data : (data.list || data.items || [])
  } catch (error) {
    console.error('获取图片列表失败:', error)
  } finally {
    loading.value = false
  }
}

// 上传前校验
const beforeUpload = (file) => {
  const isImage = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)
  const isLt10M = file.size / 1024 / 1024 < 10

  if (!isImage) {
    ElMessage.error('只能上传图片文件 (jpg/png/gif/webp)')
    return false
  }
  if (!isLt10M) {
    ElMessage.error('图片大小不能超过 10MB')
    return false
  }
  return true
}

// 上传成功
const handleUploadSuccess = (response) => {
  ElMessage.success('图片上传成功')
  fetchImages()
}

// 上传失败
const handleUploadError = () => {
  ElMessage.error('图片上传失败')
}

// 更新图片信息（标题、排序、是否显示）
const handleUpdate = async (item) => {
  try {
    await updateLiveImage(item._id || item.id, {
      title: item.title,
      sortOrder: item.sortOrder,
      visible: item.visible
    })
    ElMessage.success('更新成功')
  } catch (error) {
    console.error('更新失败:', error)
    fetchImages()
  }
}

// 删除图片
const handleDelete = async (id) => {
  try {
    await deleteLiveImage(id)
    ElMessage.success('删除成功')
    fetchImages()
  } catch (error) {
    console.error('删除失败:', error)
  }
}

onMounted(() => {
  fetchImages()
})
</script>

<style scoped>
.live-image-manage {
  min-height: 100%;
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

.image-list {
  min-height: 200px;
}

.image-card {
  margin-bottom: 16px;
  border-radius: 8px;
  overflow: hidden;
}

.image-card :deep(.el-card__body) {
  padding: 0;
}

.image-wrapper {
  width: 100%;
  height: 180px;
  overflow: hidden;
  background: #f5f7fa;
}

.preview-image {
  width: 100%;
  height: 100%;
}

.image-info {
  padding: 12px 16px 0;
}

.image-info .el-form-item {
  margin-bottom: 8px;
}

.image-actions {
  padding: 8px 16px 12px;
  text-align: right;
}
</style>
