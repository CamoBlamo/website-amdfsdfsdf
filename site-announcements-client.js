// Load the latest site announcement and show popup on page load
async function loadLatestSiteAnnouncementAndShow() {
  try {
    const res = await fetch('/site-announcements/latest')
    const data = await res.json()
    if (!data.success) return
    const latest = data.announcement
    if (!latest) return

    // If server says user has already seen it, skip
    if (data.seen) return

    // Only show site-wide announcement popup on developerspaces.html
    const path = (window.location.pathname || '').toLowerCase()
    const isDevSpace = path.includes('developerspaces.html') || path.endsWith('/') || path === ''

    if (!isDevSpace) {
      if (typeof window.showAnnouncementPopup === 'function') {
        const ev = new CustomEvent('siteAnnouncement:show', { detail: latest })
        window.dispatchEvent(ev)
      }
      return
    }

    // If page has a handler, use it; otherwise render modal
    if (typeof window.showAnnouncementPopup === 'function') {
      const ev = new CustomEvent('siteAnnouncement:show', { detail: latest })
      window.dispatchEvent(ev)
      return
    }

    showSiteAnnouncementModal(latest, { loggedIn: !!data.loggedIn })
  } catch (err) {
    console.debug('No site announcement available', err)
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadLatestSiteAnnouncementAndShow()
})

function escapeHtml(s) {
  if (!s) return ''
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c])
}

function showSiteAnnouncementFallback(a) {
  try {
    const existing = document.getElementById('siteAnnouncementPopup')
    if (existing) existing.remove()
    const wrap = document.createElement('div')
    wrap.id = 'siteAnnouncementPopup'
    wrap.className = 'announcement-popup'
    wrap.innerHTML = `
      <div class="popup-header">${escapeHtml(a.title || 'Announcement')} — <small>${escapeHtml(a.author || 'Admin')}</small></div>
      <div class="popup-body">${escapeHtml(a.message)}</div>
      <div class="popup-meta">${new Date(a.created_at).toLocaleString()}</div>
      <div><button class="popup-close">Close</button></div>`
    document.body.appendChild(wrap)
    wrap.querySelector('.popup-close').addEventListener('click', () => wrap.remove())
    setTimeout(() => { if (wrap.parentNode) wrap.remove() }, 12000)
  } catch (e) {
    console.debug('Failed to show fallback announcement', e)
  }
}

function showSiteAnnouncementModal(a, opts) {
  opts = opts || {}
  // remove any existing
  const existingBackdrop = document.getElementById('siteAnnouncementBackdrop')
  if (existingBackdrop) existingBackdrop.remove()

  const backdrop = document.createElement('div')
  backdrop.id = 'siteAnnouncementBackdrop'
  backdrop.style.position = 'fixed'
  backdrop.style.inset = '0'
  backdrop.style.background = 'rgba(0,0,0,0.5)'
  backdrop.style.display = 'flex'
  backdrop.style.alignItems = 'center'
  backdrop.style.justifyContent = 'center'
  backdrop.style.zIndex = '10000'

  const box = document.createElement('div')
  box.style.maxWidth = '720px'
  box.style.width = 'min(94vw,720px)'
  box.style.background = '#0f1417'
  box.style.border = '1px solid rgba(255,255,255,0.06)'
  box.style.borderRadius = '12px'
  box.style.padding = '1.25rem'
  box.style.boxShadow = '0 18px 50px rgba(0,0,0,0.6)'
  box.style.color = '#fff'
  box.style.fontFamily = 'inherit'

  const title = document.createElement('div')
  title.style.fontSize = '1.25rem'
  title.style.fontWeight = '700'
  title.style.marginBottom = '0.5rem'
  title.innerHTML = `${escapeHtml(a.title || 'Announcement')} <span style="font-weight:400; font-size:0.9rem; color:#a8b3bb"> — ${escapeHtml(a.author || 'Admin')}</span>`

  const body = document.createElement('div')
  body.style.marginBottom = '0.75rem'
  body.style.fontSize = '1rem'
  body.innerHTML = escapeHtml(a.message)

  const meta = document.createElement('div')
  meta.style.fontSize = '0.85rem'
  meta.style.color = '#9aa6ad'
  meta.style.marginBottom = '0.75rem'
  meta.textContent = new Date(a.created_at).toLocaleString()

  const closeWrap = document.createElement('div')
  closeWrap.style.textAlign = 'right'
  const closeBtn = document.createElement('button')
  closeBtn.textContent = 'Close'
  closeBtn.style.padding = '0.5rem 0.75rem'
  closeBtn.style.border = 'none'
  closeBtn.style.borderRadius = '8px'
  closeBtn.style.cursor = 'pointer'
  closeBtn.style.background = 'var(--accent-clr)'
  closeBtn.style.color = '#111'
  closeBtn.addEventListener('click', () => backdrop.remove())

  // mark as shown when closed
  async function markShown() {
    // If user is logged in, mark server-side
    if (opts.loggedIn) {
      try {
        await fetch('/site-announcements/' + encodeURIComponent(a.id) + '/seen', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      } catch (e) {
        // ignore server errors
      }
    } else {
      // fallback to localStorage for anonymous users
      try {
        const shownKey = 'siteAnnouncementShownIds'
        const raw = localStorage.getItem(shownKey) || '[]'
        const arr = JSON.parse(raw)
        if (Array.isArray(arr) && a && a.id && !arr.includes(a.id)) {
          arr.push(a.id)
          localStorage.setItem(shownKey, JSON.stringify(arr))
        }
      } catch (e) { /* ignore */ }
    }
  }

  closeWrap.appendChild(closeBtn)

  box.appendChild(title)
  box.appendChild(body)
  box.appendChild(meta)
  box.appendChild(closeWrap)
  backdrop.appendChild(box)
  document.body.appendChild(backdrop)

  // dismiss on Escape
  function onKey(e) { if (e.key === 'Escape') { backdrop.remove(); markShown() } }
  window.addEventListener('keydown', onKey)
  backdrop.addEventListener('remove', () => window.removeEventListener('keydown', onKey))

  // ensure marking when clicking close
  closeBtn.addEventListener('click', markShown)

  // also mark when auto-dismiss fires
  setTimeout(() => { if (backdrop.parentNode) { markShown(); backdrop.remove() } }, 12000)
}
