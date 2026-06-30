<template>
  <div class="register-page">
    <div class="register-card">
      <h1>申请后台账号</h1>
      <p>提交后由超级管理员审核，审核通过后即可登录。</p>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @keyup.enter="submit">
        <el-form-item label="姓名" prop="name"><el-input v-model="form.name" maxlength="50" placeholder="请输入真实姓名" /></el-form-item>
        <el-form-item label="所属部门" prop="department"><el-input v-model="form.department" maxlength="50" placeholder="例如：市场部" /></el-form-item>
        <el-form-item label="用户名" prop="username"><el-input v-model="form.username" maxlength="32" placeholder="3-32 位字母、数字或 _ . -" /></el-form-item>
        <el-form-item label="密码" prop="password"><el-input v-model="form.password" type="password" show-password placeholder="至少 8 位，包含字母和数字" /></el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword"><el-input v-model="form.confirmPassword" type="password" show-password placeholder="请再次输入密码" /></el-form-item>
        <el-button type="primary" class="submit-btn" :loading="loading" @click="submit">提交注册</el-button>
        <div class="login-link">已有账号？<router-link to="/login">返回登录</router-link></div>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { adminRegister } from '../api'

const router = useRouter()
const formRef = ref()
const loading = ref(false)
const form = reactive({ name: '', department: '', username: '', password: '', confirmPassword: '' })
const rules = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  department: [{ required: true, message: '请输入所属部门', trigger: 'blur' }],
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { pattern: /^[A-Za-z0-9_.-]{3,32}$/, message: '用户名格式不正确', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { pattern: /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/, message: '至少 8 位，且包含字母和数字', trigger: 'blur' }
  ],
  confirmPassword: [{
    validator: (_rule, value, callback) => value === form.password ? callback() : callback(new Error('两次密码不一致')),
    trigger: 'blur'
  }]
}

const submit = async () => {
  if (!await formRef.value.validate().catch(() => false)) return
  loading.value = true
  try {
    await adminRegister(form)
    ElMessage.success('注册申请已提交，请等待超级管理员审核')
    router.push('/login')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.register-page { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: linear-gradient(140deg, #f4efe6, #dce9f6); }
.register-card { width: min(480px, calc(100vw - 32px)); padding: 32px; border-radius: 20px; background: rgba(255,255,255,.94); box-shadow: 0 20px 60px rgba(32,48,68,.16); }
h1 { margin: 0; font-size: 28px; }
p { margin: 8px 0 24px; color: #667085; }
.submit-btn { width: 100%; }
.login-link { margin-top: 18px; text-align: center; color: #667085; }
</style>
