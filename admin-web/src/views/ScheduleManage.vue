<template>
  <div class="schedule-manage">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span class="card-title">会议日程管理</span>
          <el-button type="primary" @click="handleAdd">
            <el-icon><Plus /></el-icon>
            新增日程
          </el-button>
        </div>
      </template>

      <!-- 日程列表表格 -->
      <el-table
        :data="scheduleList"
        stripe
        v-loading="loading"
        border
        style="width: 100%"
      >
        <el-table-column prop="date" label="日期" min-width="120" />
        <el-table-column prop="startTime" label="开始时间" min-width="100" />
        <el-table-column prop="endTime" label="结束时间" min-width="100" />
        <el-table-column prop="title" label="主题" min-width="180" show-overflow-tooltip />
        <el-table-column prop="location" label="地点" min-width="140" show-overflow-tooltip />
        <el-table-column prop="speaker" label="主讲人" min-width="120" />
        <el-table-column prop="remark" label="备注" min-width="140" show-overflow-tooltip />
        <el-table-column prop="sortOrder" label="排序号" width="90" align="center" />
        <el-table-column label="操作" width="160" fixed="right" align="center">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleEdit(row)">
              <el-icon><Edit /></el-icon>
              编辑
            </el-button>
            <el-popconfirm
              title="确定要删除这条日程吗？"
              confirm-button-text="确定"
              cancel-button-text="取消"
              @confirm="handleDelete(row.id)"
            >
              <template #reference>
                <el-button type="danger" link size="small">
                  <el-icon><Delete /></el-icon>
                  删除
                </el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="600px"
      destroy-on-close
      @closed="resetForm"
    >
      <el-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        label-width="100px"
      >
        <el-form-item label="日期" prop="date">
          <el-date-picker
            v-model="formData.date"
            type="date"
            placeholder="请选择日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="开始时间" prop="startTime">
              <el-time-picker
                v-model="formData.startTime"
                placeholder="开始时间"
                format="HH:mm"
                value-format="HH:mm"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="结束时间" prop="endTime">
              <el-time-picker
                v-model="formData.endTime"
                placeholder="结束时间"
                format="HH:mm"
                value-format="HH:mm"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="主题" prop="title">
          <el-input v-model="formData.title" placeholder="请输入主题" />
        </el-form-item>
        <el-form-item label="地点" prop="location">
          <el-input v-model="formData.location" placeholder="请输入地点" />
        </el-form-item>
        <el-form-item label="主讲人" prop="speaker">
          <el-input v-model="formData.speaker" placeholder="请输入主讲人" />
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input v-model="formData.remark" type="textarea" :rows="2" placeholder="请输入备注" />
        </el-form-item>
        <el-form-item label="排序号" prop="sortOrder">
          <el-input-number v-model="formData.sortOrder" :min="0" :max="999" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取 消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">
          确 定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import { getSchedules, addSchedule, updateSchedule, deleteSchedule } from '../api'

// 日程列表
const scheduleList = ref([])
// 加载状态
const loading = ref(false)
// 提交状态
const submitLoading = ref(false)
// 弹窗是否显示
const dialogVisible = ref(false)
// 是否为编辑模式
const isEdit = ref(false)
// 编辑的行 id
const editId = ref(null)

// 弹窗标题
const dialogTitle = computed(() => (isEdit.value ? '编辑日程' : '新增日程'))

// 表单引用
const formRef = ref(null)

// 表单数据
const formData = reactive({
  date: '',
  startTime: '',
  endTime: '',
  title: '',
  location: '',
  speaker: '',
  remark: '',
  sortOrder: 0
})

// 表单校验规则
const rules = {
  date: [{ required: true, message: '请选择日期', trigger: 'change' }],
  startTime: [{ required: true, message: '请选择开始时间', trigger: 'change' }],
  endTime: [{ required: true, message: '请选择结束时间', trigger: 'change' }],
  title: [{ required: true, message: '请输入主题', trigger: 'blur' }]
}

// 获取日程列表
const fetchSchedules = async () => {
  loading.value = true
  try {
    const res = await getSchedules()
    const data = res.data || res
    scheduleList.value = Array.isArray(data) ? data : (data.list || data.items || [])
  } catch (error) {
    console.error('获取日程列表失败:', error)
  } finally {
    loading.value = false
  }
}

// 新增
const handleAdd = () => {
  isEdit.value = false
  editId.value = null
  dialogVisible.value = true
}

// 编辑
const handleEdit = (row) => {
  isEdit.value = true
  editId.value = row.id
  Object.keys(formData).forEach((key) => {
    if (row[key] !== undefined && row[key] !== null) {
      formData[key] = row[key]
    }
  })
  dialogVisible.value = true
}

// 删除
const handleDelete = async (id) => {
  try {
    await deleteSchedule(id)
    ElMessage.success('删除成功')
    fetchSchedules()
  } catch (error) {
    console.error('删除失败:', error)
  }
}

// 提交表单
const handleSubmit = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid) => {
    if (!valid) return

    submitLoading.value = true
    try {
      const data = { ...formData }
      if (isEdit.value && editId.value) {
        await updateSchedule(editId.value, data)
        ElMessage.success('更新成功')
      } else {
        await addSchedule(data)
        ElMessage.success('新增成功')
      }
      dialogVisible.value = false
      fetchSchedules()
    } catch (error) {
      console.error('提交失败:', error)
    } finally {
      submitLoading.value = false
    }
  })
}

// 重置表单
const resetForm = () => {
  Object.keys(formData).forEach((key) => {
    if (key === 'sortOrder') {
      formData[key] = 0
    } else {
      formData[key] = ''
    }
  })
  editId.value = null
  isEdit.value = false
}

onMounted(() => {
  fetchSchedules()
})
</script>

<style scoped>
.schedule-manage {
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
</style>
