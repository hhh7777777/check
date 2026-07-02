<template>
  <div class="settings-page">
    <el-card>
      <template #header>
        <div class="header-row">
          <span>小程序界面配置</span>
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
        </div>
      </template>

      <el-alert type="info" :closable="false" style="margin-bottom: 20px;">
        <template #title>
          <div>
            <p style="margin: 0 0 4px 0; font-weight: 600;">图片尺寸规格</p>
            <p style="margin: 0; font-size: 12px; color: #667085;">
              全局背景: 750×1334px | 会议介绍: 694×260px | 会议日程: 380×300px |
              会议手册: 380×200px | 电子参会证: 284×200px | 参会路线: 284×200px | 图文直播: 284×200px
            </p>
          </div>
        </template>
      </el-alert>

      <el-form label-width="120px" v-loading="loading">
        <el-divider content-position="left">全局背景</el-divider>
        <el-form-item label="背景图片">
          <ImageUpload
            v-model="form.globalBgImageFileID"
            v-model:url="form.globalBgImageUrl"
            folder="miniapp-bg"
            tip="建议尺寸 750×1334px，PNG/WebP格式"
          />
        </el-form-item>

        <el-divider content-position="left">模块卡片背景</el-divider>

        <el-form-item label="会议介绍">
          <ImageUpload
            v-model="form.introBgImageFileID"
            v-model:url="form.introBgImageUrl"
            folder="module-bgs"
            tip="建议尺寸 694×260px，宽幅横图"
          />
        </el-form-item>

        <el-form-item label="会议日程">
          <ImageUpload
            v-model="form.scheduleBgImageFileID"
            v-model:url="form.scheduleBgImageUrl"
            folder="module-bgs"
            tip="建议尺寸 380×300px"
          />
        </el-form-item>

        <el-form-item label="电子参会证">
          <ImageUpload
            v-model="form.badgeBgImageFileID"
            v-model:url="form.badgeBgImageUrl"
            folder="module-bgs"
            tip="建议尺寸 284×200px"
          />
        </el-form-item>

        <el-form-item label="会议手册">
          <ImageUpload
            v-model="form.seatingBgImageFileID"
            v-model:url="form.seatingBgImageUrl"
            folder="module-bgs"
            tip="建议尺寸 380×200px"
          />
        </el-form-item>

        <el-form-item label="参会路线">
          <ImageUpload
            v-model="form.routeBgImageFileID"
            v-model:url="form.routeBgImageUrl"
            folder="module-bgs"
            tip="建议尺寸 284×200px"
          />
        </el-form-item>

        <el-form-item label="图文直播">
          <ImageUpload
            v-model="form.liveBgImageFileID"
            v-model:url="form.liveBgImageUrl"
            folder="module-bgs"
            tip="建议尺寸 284×200px"
          />
        </el-form-item>

        <el-divider content-position="left">会议手册PDF</el-divider>
        <el-form-item label="手册PDF">
          <PdfUpload
            v-model="form.routePdfFileID"
            v-model:url="form.routePdfUrl"
          />
        </el-form-item>

        <el-divider content-position="left">文字颜色配置</el-divider>
        <el-alert type="warning" :closable="false" style="margin-bottom: 16px;">
          <template #title>
            <span style="font-size: 12px;">留空则使用默认颜色。修改后需点击保存生效。</span>
          </template>
        </el-alert>

        <el-form-item label="全局文字颜色">
          <el-color-picker v-model="form.globalTextColor" show-alpha />
          <span class="color-hint">默认: #ffffff（白色）</span>
        </el-form-item>

        <el-form-item label="卡片标题颜色">
          <el-color-picker v-model="form.cardTitleColor" show-alpha />
          <span class="color-hint">默认: #ffffff（白色）</span>
        </el-form-item>

        <el-form-item label="卡片副标题颜色">
          <el-color-picker v-model="form.cardSubtitleColor" show-alpha />
          <span class="color-hint">默认: rgba(255,255,255,0.6)</span>
        </el-form-item>

        <el-form-item label="主色调">
          <el-color-picker v-model="form.primaryColor" show-alpha />
          <span class="color-hint">默认: #3a8aee（蓝色）</span>
        </el-form-item>

        <el-form-item label="强调色">
          <el-color-picker v-model="form.accentColor" show-alpha />
          <span class="color-hint">默认: #f59e0b（琥珀色）</span>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getActivity, updateActivity } from '../api'
import ImageUpload from '../components/ImageUpload.vue'
import PdfUpload from '../components/PdfUpload.vue'

const loading = ref(false)
const saving = ref(false)
const form = reactive({
  globalBgImageFileID: '',
  globalBgImageUrl: '',
  introBgImageFileID: '',
  introBgImageUrl: '',
  scheduleBgImageFileID: '',
  scheduleBgImageUrl: '',
  badgeBgImageFileID: '',
  badgeBgImageUrl: '',
  seatingBgImageFileID: '',
  seatingBgImageUrl: '',
  routeBgImageFileID: '',
  routeBgImageUrl: '',
  liveBgImageFileID: '',
  liveBgImageUrl: '',
  routePdfFileID: '',
  routePdfUrl: '',
  globalTextColor: '',
  cardTitleColor: '',
  cardSubtitleColor: '',
  primaryColor: '',
  accentColor: '',
})

const load = async () => {
  loading.value = true
  try {
    const data = await getActivity()
    if (data) {
      Object.keys(form).forEach(key => {
        if (data[key] !== undefined) form[key] = data[key]
      })
    }
  } finally {
    loading.value = false
  }
}

const save = async () => {
  saving.value = true
  try {
    const payload = {}
    Object.keys(form).forEach(key => {
      payload[key] = form[key]
    })
    await updateActivity(payload)
    ElMessage.success('保存成功')
  } finally {
    saving.value = false
  }
}

load()
</script>

<style scoped>
.settings-page {
  max-width: 800px;
}
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.color-hint {
  margin-left: 12px;
  font-size: 12px;
  color: #667085;
}
</style>
