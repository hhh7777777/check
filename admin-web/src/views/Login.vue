<template>
  <div class="login-page">
    <div class="login-card">
      <h1>内部活动参会服务系统</h1>
      <p>管理员后台</p>
      <el-form ref="formRef" :model="form" :rules="rules" @keyup.enter="handleSubmit">
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="用户名" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="form.password" type="password" show-password placeholder="密码" />
        </el-form-item>
        <el-button type="primary" class="submit-btn" :loading="loading" @click="handleSubmit">
          登录
        </el-button>
        <div class="register-link">还没有账号？<router-link to="/register">申请注册</router-link></div>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { adminLogin } from '../api'

const router = useRouter()
const formRef = ref()
const loading = ref(false)
const form = reactive({
  username: '',
  password: ''
})
const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

const handleSubmit = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    const res = await adminLogin(form)
    localStorage.setItem('admin_token', res.token)
    localStorage.setItem('admin_info', JSON.stringify(res.admin || {}))
    ElMessage.success('登录成功')
    router.push('/dashboard')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: linear-gradient(140deg, #f4efe6, #dce9f6);
}

.login-card {
  width: min(420px, calc(100vw - 32px));
  padding: 32px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 20px 60px rgba(32, 48, 68, 0.16);
}

h1 {
  margin: 0;
  font-size: 28px;
}

p {
  margin: 8px 0 24px;
  color: #667085;
}

.submit-btn {
  width: 100%;
}

.register-link {
  margin-top: 18px;
  text-align: center;
  color: #667085;
}
</style>
