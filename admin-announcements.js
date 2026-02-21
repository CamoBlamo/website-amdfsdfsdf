async function loadSiteAnnouncements() {
  try {
    const res = await fetch('/admin/announcements')
    const data = await res.json()
    if (!data.success) {
      console.error('Failed to load site announcements', data.errors)
      return
    }

    const list = document.getElementById('siteAnnouncementsList')
    list.innerHTML = ''
    const wrapper = document.createElement('div')
    wrapper.className = 'announcement-list'
    data.announcements.forEach(a => {
      const el = document.createElement('div')
      el.className = 'announcement-item card'
      const level = (a.level || 'info')
      el.innerHTML = `
        <div class="announcement-head">
          <div class="announcement-title">${escapeHtml(a.title || 'Announcement')}</div>
          <div class="announcement-meta"><span class="level level-${escapeHtml(level)}">${escapeHtml(level)}</span> <small>by ${escapeHtml(a.author)}</small></div>
        </div>
        <div class="announcement-body">${escapeHtml(a.message)}</div>
        <div class="announcement-footer">${new Date(a.created_at).toLocaleString()}</div>`
      wrapper.appendChild(el)
    })
    list.appendChild(wrapper)

    // show latest as popup
    if (data.announcements.length > 0) {
      const latest = data.announcements[0]
      showAnnouncementPopup(latest.title || 'Announcement', latest.message, latest.author, latest.created_at)
    }
  } catch (err) {
    console.error('Load site announcements error', err)
  }
}

async function postSiteAnnouncement(title, message, level='info') {
  try {
    const res = await fetch('/admin/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, message, level })
    })
    const data = await res.json()
    return data
  } catch (err) {
    console.error('Post site announcement error', err)
    return { success: false, errors: ['Network error'] }
  }
}

function escapeHtml(s) {
  if (!s) return ''
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c])
}

function showAnnouncementPopup(title, message, author, created_at) {
  // single popup element
  const existing = document.getElementById('siteAnnouncementPopup')
  if (existing) existing.remove()

  const wrap = document.createElement('div')
  wrap.id = 'siteAnnouncementPopup'
  wrap.className = 'announcement-popup'
  wrap.innerHTML = `
    <div class="popup-header">${escapeHtml(title || 'Announcement')} — <small>${escapeHtml(author || 'Admin')}</small></div>
    <div class="popup-body">${escapeHtml(message)}</div>
    <div class="popup-meta">${new Date(created_at).toLocaleString()}</div>
    <div><button class="popup-close">Close</button></div>`

  document.body.appendChild(wrap)
  wrap.querySelector('.popup-close').addEventListener('click', () => wrap.remove())

  // auto-dismiss in 12s
  setTimeout(() => { if (wrap.parentNode) wrap.remove() }, 12000)
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadSiteAnnouncements()

  // Check role to show/hide post form
  try {
    const me = await fetch('/me').then(r => r.json())
    const canPost = me.success && (me.user.role === 'owner' || me.user.is_admin === true)
    const formWrap = document.getElementById('adminPostWrap')
    if (!canPost && formWrap) formWrap.style.display = 'none'
  } catch (e) {
    console.warn('Failed to check user role', e)
  }

  const form = document.getElementById('siteAnnouncementForm')
  if (form) {
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault()
      const txt = document.getElementById('siteAnnouncementText')
      const titleEl = document.getElementById('siteAnnouncementTitle')
      const levelEl = document.getElementById('siteAnnouncementLevel')
      const title = titleEl ? titleEl.value.trim() : ''
      const level = levelEl ? levelEl.value : 'info'
      if (!txt || !txt.value.trim()) return alert('Please enter a message')
      const res = await postSiteAnnouncement(title, txt.value.trim(), level)
      if (!res.success) return alert('Failed to post: ' + (res.errors || []).join(', '))
      txt.value = ''
      if (titleEl) titleEl.value = ''
      if (levelEl) levelEl.value = 'info'
      await loadSiteAnnouncements()
      alert('Posted')
    })
  }

// Listen for site-wide loader events to show popup on other pages
window.addEventListener('siteAnnouncement:show', (e) => {
  const a = e.detail
  if (!a) return
  showAnnouncementPopup(a.title || 'Announcement', a.message, a.author, a.created_at)
})
})
