<template>
  <div class="attendee-manage">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span class="card-title">参会人员管理</span>
          <div class="header-actions">
            <el-upload
              :action="importUrl"
              :headers="uploadHeaders"
              :show-file-list="false"
              :on-success="handleImportSuccess"
              :on-error="handleImportError"
              :before-upload="beforeImport"
              accept=".xlsx,.xls"
            >
              <el-button type="success">
                <el-icon><Upload /></el-icon>
                Excel 导入
              </el-button>
            </el-upload>
            <el-button type="warning" @click="handleExport">
              <el-icon><Download /></el-icon>
              导出 Excel
            </el-button>
          </div>
        </div>
      </template>

      <!-- 搜索栏 -->
      <div class="search-bar">
        <el-form :inline="true" :model="searchParams">
          <el-form-item label="关键词">
            <el-input
              v-model="searchParams.keyword"
              placeholder="姓名/手机号/单位"
              clearable
              @keyup.enter="handleSearch"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleSearch">
              <el-icon><Search /></el-icon>
              搜索
            </el-button>
            <el-button @click="handleReset">
              <el-icon><Refresh /></el-icon>
              重置
            </el-button>
          </el-form-item>
        </el-form>
      </div>

      <!-- 参会人员列表 -->
      <el-table
        :data="attendeeList"
        stripe
        v-loading="loading"
        border
        style="width: 100%"
      >
        <el-table-column prop="attendeeCode" label="参会码" min-width="120" />
        <el-table-column prop="name" label="姓名" min-width="100" />
        <el-table-column label="手机号" min-width="120">
          <template #default="{ row }">
            {{ maskPhone(row.phone) }}
          </template>
        </el-table-column>
        <el-table-column prop="organization" label="单位" min-width="160" show-overflow-tooltip />
        <el-table-column prop="identityType" label="身份类型" min-width="100" />
        <el-table-column prop="seatNo" label="座位号" width="90" align="center" />
        <el-table-column prop="tableNo" label="餐桌号" width="90" align="center" />
        <el-table-column prop="hotel" label="酒店" min-width="120" show-overflow-tooltip />
        <el-table-column prop="roomNo" label="房间号" width="90" align="center" />
        <el-table-column label="操作" width="160" fixed="right" align="center">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleEdit(row)">
              <el-icon><Edit /></el-icon>
              编辑
            </el-button>
            <el-popconfirm
              title="确定要删除该参会人员吗？"
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

      <!-- 分页 -->
      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>

    <!-- 编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      title="编辑参会人员"
      width="650px"
      destroy-on-close
      @closed="resetForm"
    >
      <el-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        label-width="100px"
      >
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="姓名" prop="name">
              <el-input v-model="formData.name" placeholder="请输入姓名" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="手机号" prop="phone">
              <el-input v-model="formData.phone" placeholder="请输入手机号" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="单位" prop="organization">
              <el-input v-model="formData.organization" placeholder="请输入单位" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="身份类型" prop="identityType">
              <el-input v-model="formData.identityType" placeholder="请输入身份类型" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="座位号" prop="seatNo">
              <el-input v-model="formData.seatNo" placeholder="请输入座位号" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="餐桌号" prop="tableNo">
              <el-input v-model="formData.tableNo" placeholder="请输入餐桌号" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="酒店" prop="hotel">
              <el-input v-model="formData.hotel" placeholder="请输入酒店" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="房间号" prop="roomNo">
              <el-input v-model="formData.roomNo" placeholder="请输入房间号" />
            </el-form-item>
          </el-col>
        </el-row>
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
import { Upload, Download, Search, Refresh, Edit, Delete } from '@element-plus/icons-vue'
import { getAttendees, importAttendees, updateAttendee, deleteAttendee, exportAttendees } from '../api'

// 导入接口地址
const importUrl = `${import.meta.env.VITE_API_BASE_URL || '/api'}/admin/attendees/import`
// 上传请求头
const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}`
}))

// 列表数据
const attendeeList = ref([])
// 加载状态
const loading = ref(false)
// 提交状态
const submitLoading = ref(false)
// 弹窗是否显示
const dialogVisible = ref(false)
// 编辑的行 id
const editId = ref(null)

// 搜索参数
const searchParams = reactive({
  keyword: ''
})

// 分页参数
const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

// 表单引用
const formRef = ref(null)

// 编辑表单数据
const formData = reactive({
  name: '',
  phone: '',
  organization: '',
  identityType: '',
  seatNo: '',
  tableNo: '',
  hotel: '',
  roomNo: ''
})

// 表单校验规则
const rules = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { min: 6, message: '手机号至少6位', trigger: 'blur' }
  ]
}

// 手机号脱敏显示（支持国际手机号）
const maskPhone = (phone) => {
  if (!phone) return '-'
  // 处理带+号的国际手机号
  const prefix = phone.startsWith('+') ? '+' : ''
  const digits = phone.replace(/^\+/, '')
  if (digits.length >= 7) {
    return prefix + digits.substring(0, 3) + '****' + digits.substring(digits.length - 4)
  }
  return phone
}

// 获取参会人员列表
const fetchAttendees = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      ...searchParams
    }
    // 移除空参数
    Object.keys(params).forEach((key) => {
      if (params[key] === '' || params[key] === null || params[key] === undefined) {
        delete params[key]
      }
    })
    const res = await getAttendees(params)
    // API 返回格式: { code: 200, data: { list: [...], total: 10 } }
    const data = res.data || res
    attendeeList.value = Array.isArray(data) ? data : (data.list || data.items || [])
    pagination.total = data.total || 0
  } catch (error) {
    console.error('获取参会人员列表失败:', error)
  } finally {
    loading.value = false
  }
}

// 搜索
const handleSearch = () => {
  pagination.page = 1
  fetchAttendees()
}

// 重置搜索
const handleReset = () => {
  searchParams.keyword = ''
  pagination.page = 1
  fetchAttendees()
}

// 分页大小变化
const handleSizeChange = (val) => {
  pagination.pageSize = val
  pagination.page = 1
  fetchAttendees()
}

// 页码变化
const handlePageChange = (val) => {
  pagination.page = val
  fetchAttendees()
}

// 编辑
const handleEdit = (row) => {
  editId.value = row._id || row.id
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
    await deleteAttendee(id)
    ElMessage.success('删除成功')
    fetchAttendees()
  } catch (error) {
    console.error('删除失败:', error)
  }
}

// 提交编辑
const handleSubmit = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid) => {
    if (!valid) return

    submitLoading.value = true
    try {
      const data = { ...formData }
      await updateAttendee(editId.value, data)
      ElMessage.success('更新成功')
      dialogVisible.value = false
      fetchAttendees()
    } catch (error) {
      console.error('更新失败:', error)
    } finally {
      submitLoading.value = false
    }
  })
}

// 重置表单
const resetForm = () => {
  Object.keys(formData).forEach((key) => {
    formData[key] = ''
  })
  editId.value = null
}

// 导入前校验
const beforeImport = (file) => {
  const isExcel =
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel' ||
    file.name.endsWith('.xlsx') ||
    file.name.endsWith('.xls')
  if (!isExcel) {
    ElMessage.error('只能上传 Excel 文件 (.xlsx, .xls)')
    return false
  }
  return true
}

// 导入成功
const handleImportSuccess = (response) => {
  const message = response.message || response.data?.message || '导入成功'
  ElMessage.success(message)
  fetchAttendees()
}

// 导入失败
const handleImportError = () => {
  ElMessage.error('导入失败，请检查文件格式')
}

// 导出 Excel
const handleExport = async () => {
  try {
    const params = { ...searchParams }
    // 移除空参数
    Object.keys(params).forEach((key) => {
      if (params[key] === '' || params[key] === null || params[key] === undefined) {
        delete params[key]
      }
    })
    const res = await exportAttendees(params)

    // 创建 blob 下载
    const blob = new Blob([res], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `参会人员_${new Date().toLocaleDateString()}.xlsx`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch (error) {
    console.error('导出失败:', error)
  }
}

onMounted(() => {
  fetchAttendees()
})
</script>

<style scoped>
.attendee-manage {
  min-height: 100%;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.search-bar {
  margin-bottom: 16px;
}

.search-bar .el-form-item {
  margin-bottom: 12px;
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  padding: 8px 0;
}
</style>
