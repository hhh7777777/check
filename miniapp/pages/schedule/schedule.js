const api = require('../../utils/api')

Page({
  data: {
    groupedSchedules: [],
    loading: true,
    statusBarHeight: 0
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo()
    this.setData({ statusBarHeight: sysInfo.statusBarHeight || 20 })
    this.getSchedules()
  },

  async getSchedules() {
    try {
      const res = await api.getSchedules()
      if (res && res.data && res.data.length > 0) {
        const grouped = this.groupByDateWithConcurrency(res.data)
        this.setData({ groupedSchedules: grouped, loading: false })
      } else {
        this.setData({ loading: false })
      }
    } catch (err) {
      console.error('获取日程失败', err)
      this.setData({ loading: false })
    }
  },

  groupByDateWithConcurrency(list) {
    const dateMap = {}
    list.forEach(item => {
      const date = item.date || '未分组'
      if (!dateMap[date]) dateMap[date] = []
      dateMap[date].push(item)
    })

    const padTime = (t) => {
      const s = String(t || '').trim()
      const m = s.match(/^(\d{1,2}):(\d{2})$/)
      return m ? m[1].padStart(2, '0') + ':' + m[2] : s
    }

    return Object.keys(dateMap).map(date => {
      const dayList = dateMap[date]
      const sorted = dayList.slice().sort((a, b) => {
        const cmp = padTime(a.startTime).localeCompare(padTime(b.startTime))
        return cmp !== 0 ? cmp : (a.sortOrder || 0) - (b.sortOrder || 0)
      })

      const rows = []
      let i = 0
      while (i < sorted.length) {
        const group = [sorted[i]]
        const endA = padTime(sorted[i].endTime || sorted[i].startTime || '')
        let j = i + 1
        while (j < sorted.length) {
          const startB = padTime(sorted[j].startTime || '')
          if (startB && endA && startB < endA) {
            group.push(sorted[j])
            const endB = padTime(sorted[j].endTime || sorted[j].startTime || '')
            if (endB > endA) {
              group[0] = { ...group[0], _rowEnd: endB }
            }
            j++
          } else {
            break
          }
        }
        rows.push({ items: group, concurrent: group.length > 1 })
        i = j
      }

      return { date, rows }
    })
  },

  goBack() {
    wx.navigateBack({ delta: 1 })
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  }
})
