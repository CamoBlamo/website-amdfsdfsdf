// Load the latest site announcement and show popup on page load
async function loadLatestSiteAnnouncementAndShow() {
  try {
    const res = await fetch('/api/announcements/latest')
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
  return showSiteAnnouncementToast(a, { loggedIn: false })
}

async function markSiteAnnouncementSeen(a, opts) {
  opts = opts || {}
  if (!a || !a.id) return

  if (opts.loggedIn) {
    try {
      await fetch('/api/announcements/' + encodeURIComponent(a.id) + '/seen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (e) {
      // ignore server errors
    }
    return
  }

  try {
    const shownKey = 'siteAnnouncementShownIds'
    const raw = localStorage.getItem(shownKey) || '[]'
    const arr = JSON.parse(raw)
    if (Array.isArray(arr) && !arr.includes(a.id)) {
      arr.push(a.id)
      localStorage.setItem(shownKey, JSON.stringify(arr))
    }
  } catch (e) {
    // ignore client storage errors
  }
}

function showSiteAnnouncementToast(a, opts) {
  try {
    const existing = document.getElementById('siteAnnouncementPopup')
    if (existing) existing.remove()

    const wrap = document.createElement('div')
    wrap.id = 'siteAnnouncementPopup'
    wrap.className = 'announcement-popup'
    wrap.setAttribute('role', 'status')
    wrap.setAttribute('aria-live', 'polite')
    wrap.innerHTML = `
      <div class="popup-header">${escapeHtml(a.title || 'Announcement')} — <small>${escapeHtml(a.author || 'Admin')}</small></div>
      <div class="popup-body">${escapeHtml(a.message)}</div>
      <div class="popup-meta">${new Date(a.created_at).toLocaleString()}</div>
      <div><button class="popup-close">Close</button></div>`

    document.body.appendChild(wrap)

    let marked = false
    const markSeenOnce = async () => {
      if (marked) return
      marked = true
      await markSiteAnnouncementSeen(a, opts)
    }

    let closed = false
    const closePopup = () => {
      if (closed) return
      closed = true

      markSeenOnce()
      wrap.classList.add('is-closing')
      setTimeout(() => {
        if (wrap.parentNode) wrap.remove()
      }, 170)
    }

    const closeButton = wrap.querySelector('.popup-close')
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        closePopup()
      })
    }

    markSeenOnce()
    setTimeout(() => {
      if (wrap.parentNode) {
        closePopup()
      }
    }, 12000)
  } catch (e) {
    console.debug('Failed to show announcement toast', e)
  }
}

function showSiteAnnouncementModal(a, opts) {
  showSiteAnnouncementToast(a, opts)
}

