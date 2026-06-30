<template>
  <div class="shell">
    <header class="hero">
      <div>
        <p class="eyebrow">{{ t.heroEyebrow }}</p>
        <h1>{{ activity.title || t.heroTitle }}</h1>
        <p class="summary">{{ activity.description || t.heroSummary }}</p>
      </div>
      <div class="hero-actions">
        <button class="ghost" @click="toggleLang">{{ language === 'en' ? '中文' : 'English' }}</button>
        <div class="meta-card">
          <p>{{ activity.startTime || '--' }}</p>
          <p>{{ activity.location || '--' }}</p>
        </div>
      </div>
    </header>

    <nav class="nav">
      <button v-for="item in sections" :key="item" :class="{ active: current === item }" @click="current = item">
        {{ t[item] }}
      </button>
    </nav>

    <main class="content">
      <section v-if="current === 'overview'" class="card-grid">
        <article class="card">
          <h2>{{ t.overview }}</h2>
          <p>{{ activity.description || '-' }}</p>
        </article>
        <article class="card">
          <h2>{{ t.schedule }}</h2>
          <ul class="plain-list">
            <li v-for="item in schedules.slice(0, 4)" :key="item._id">{{ item.date }} {{ item.startTime }} {{ item.title }}</li>
          </ul>
        </article>
      </section>

      <section v-else-if="current === 'schedule'" class="card">
        <h2>{{ t.schedule }}</h2>
        <div v-for="item in schedules" :key="item._id" class="schedule-row">
          <div>{{ item.date }}</div>
          <div>{{ item.startTime }} - {{ item.endTime }}</div>
          <div>{{ item.title }}</div>
          <div>{{ item.location }}</div>
        </div>
      </section>

      <section v-else-if="current === 'badge' || current === 'services'" class="card">
        <h2>{{ current === 'badge' ? t.badge : t.services }}</h2>
        <div class="query-grid">
          <input v-model="query.phone" :placeholder="t.phonePlaceholder" maxlength="20" />
          <button class="primary" :disabled="loading" @click="search">{{ loading ? '...' : t.search }}</button>
        </div>
        <p v-if="error" class="error-text">{{ error }}</p>
        <div v-if="attendee" class="attendee-panel">
          <p><strong>{{ attendee.name }}</strong> · {{ attendee.organization || '-' }}</p>
          <p>{{ t.code }}: {{ attendee.attendeeCode }}</p>
          <p>{{ t.seat }}: {{ attendee.seatNo || '-' }}</p>
          <p>{{ t.table }}: {{ attendee.tableNo || '-' }}</p>
          <p>{{ t.dining }}: {{ attendee.diningPlace || '-' }}</p>
          <p>{{ t.hotel }}: {{ attendee.hotelName || '-' }}</p>
          <p>{{ t.room }}: {{ attendee.roomNo || '-' }}</p>
          <p>{{ t.voucher }}: {{ attendee.qrContent || '-' }}</p>
        </div>
      </section>

      <section v-else-if="current === 'route'" class="card">
        <h2>{{ t.route }}</h2>
        <p>{{ activity.location || '-' }}</p>
        <p>{{ activity.trafficInfo || '-' }}</p>
        <p>{{ t.contact }}: {{ activity.contactPhone || '-' }}</p>
      </section>

      <section v-else class="card">
        <h2>{{ t.contact }}</h2>
        <p>{{ activity.contactPerson || '-' }}</p>
        <p>{{ activity.contactPhone || '-' }}</p>
        <p>{{ activity.location || '-' }}</p>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'

const dictionaries = {
  en: {
    heroEyebrow: 'INTERNATIONAL GUEST ACCESS',
    heroTitle: 'Event Access Portal',
    heroSummary: 'Use this page to view agenda, attendee pass, seating, dining, hotel, route, and contact details.',
    overview: 'Overview',
    schedule: 'Agenda',
    badge: 'E-Pass',
    services: 'Seat / Dining / Hotel',
    route: 'Route',
    contact: 'Contact',
    phonePlaceholder: 'Phone number (e.g. +12025550123)',
    search: 'Search',
    code: 'Attendee Code',
    seat: 'Seat',
    table: 'Table',
    dining: 'Dining',
    hotel: 'Hotel',
    room: 'Room',
    voucher: 'Voucher Code',
    phoneRequired: 'Please enter your phone number',
    phoneInvalid: 'Invalid phone number format'
  },
  zh: {
    heroEyebrow: '国际参会入口',
    heroTitle: '内部活动参会服务',
    heroSummary: '可在此查询会议日程、电子参会证、座位餐序酒店、路线和联系方式。',
    overview: '会议介绍',
    schedule: '会议日程',
    badge: '电子参会证',
    services: '座位 / 餐序 / 酒店',
    route: '参会路线',
    contact: '联系方式',
    phonePlaceholder: '请输入中国大陆手机号或国际手机号（如 +12025550123）',
    search: '查询',
    code: '参会码',
    seat: '座位号',
    table: '餐桌号',
    dining: '用餐地点',
    hotel: '酒店名称',
    room: '房间号',
    voucher: '参会凭证',
    phoneRequired: '请输入手机号',
    phoneInvalid: '手机号格式不正确'
  }
}

const language = ref((() => { try { return localStorage.getItem('h5_language') || 'en' } catch (_) { return 'en' } })())
const current = ref('overview')
const sections = ['overview', 'schedule', 'badge', 'services', 'route', 'contact']
const activity = reactive({ title: '', description: '', startTime: '', location: '', trafficInfo: '', contactPhone: '', contactPerson: '' })
const schedules = ref([])
const attendee = ref(null)
const error = ref('')
const query = reactive({ phone: '' })
const loading = ref(false)
const t = computed(() => dictionaries[language.value])

const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

const load = async () => {
  try {
    const [activityRes, scheduleRes] = await Promise.all([
      fetch(`${apiBase}/activity`).then((res) => { if (!res.ok) throw new Error('Network error'); return res.json() }),
      fetch(`${apiBase}/schedules`).then((res) => { if (!res.ok) throw new Error('Network error'); return res.json() })
    ])
    Object.assign(activity, activityRes || {})
    schedules.value = Array.isArray(scheduleRes) ? scheduleRes : []
  } catch (e) {
    console.error('load failed', e)
  }
}

const toggleLang = () => {
  language.value = language.value === 'en' ? 'zh' : 'en'
  localStorage.setItem('h5_language', language.value)
}

const search = async () => {
  error.value = ''
  attendee.value = null
  const phone = query.phone.trim().replace(/[()\s-]/g, '').replace(/^00(\d+)/, '+$1')
  if (!phone) {
    error.value = t.value.phoneRequired || 'Please enter your phone number'
    return
  }
  if (!/^1[3-9]\d{9}$/.test(phone) && !/^\+[1-9]\d{5,19}$/.test(phone)) {
    error.value = t.value.phoneInvalid || 'Invalid phone number'
    return
  }
  loading.value = true
  try {
    const res = await fetch(`${apiBase}/attendee/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    })
    const data = await res.json()
    if (!res.ok) {
      error.value = data.error || 'Request failed'
      return
    }
    attendee.value = data
  } catch (e) {
    error.value = 'Network error, please try again'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>
