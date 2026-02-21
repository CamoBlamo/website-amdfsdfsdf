async function fetchMe(){
  try{
    const r = await fetch('/me')
    const data = await r.json()
    return data
  }catch(e){ return { success:false } }
}

function setLoading(el, busy){ el.disabled = !!busy }

document.addEventListener('DOMContentLoaded', async ()=>{
  const resp = await fetchMe()
  if (!resp.success) {
    // Not logged in — redirect to login
    // keep on page but clear fields
    document.getElementById('username').value = ''
    document.getElementById('email').value = ''
    return
  }

  const user = resp.user
  document.getElementById('username').value = user.username || ''
  document.getElementById('email').value = user.email || ''
  // preference
  const pref = !!user.notify_announcements
  document.getElementById('prefNotify').checked = pref

  // Save profile
  document.getElementById('saveProfile').addEventListener('click', async ()=>{
    const btn = document.getElementById('saveProfile')
    setLoading(btn, true)
    const username = document.getElementById('username').value.trim()
    try{
      const res = await fetch('/me/update', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username }) })
      const j = await res.json()
      if (!j.success) return alert('Failed to save: ' + (j.errors||[]).join(', '))
      alert('Saved')
    }catch(e){ alert('Network error') }
    setLoading(btn, false)
  })

  document.getElementById('changePassword').addEventListener('click', async ()=>{
    const btn = document.getElementById('changePassword')
    setLoading(btn, true)
    const current = document.getElementById('currentPassword').value
    const n1 = document.getElementById('newPassword').value
    const n2 = document.getElementById('repeatPassword').value
    if (!n1 || n1.length < 8) { alert('New password must be at least 8 characters'); setLoading(btn,false); return }
    if (n1 !== n2) { alert('Passwords do not match'); setLoading(btn,false); return }
    try{
      const res = await fetch('/me/password', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ currentPassword: current, newPassword: n1 }) })
      const j = await res.json()
      if (!j.success) return alert('Failed to change password: ' + (j.errors||[]).join(', '))
      alert('Password changed')
      document.getElementById('currentPassword').value = ''
      document.getElementById('newPassword').value = ''
      document.getElementById('repeatPassword').value = ''
    }catch(e){ alert('Network error') }
    setLoading(btn, false)
  })

  document.getElementById('savePrefs').addEventListener('click', async ()=>{
    const btn = document.getElementById('savePrefs')
    setLoading(btn, true)
    const notify = !!document.getElementById('prefNotify').checked
    try{
      const res = await fetch('/me/preferences', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ notify_announcements: notify }) })
      const j = await res.json()
      if (!j.success) return alert('Failed to save preferences: ' + (j.errors||[]).join(', '))
      alert('Preferences saved')
    }catch(e){ alert('Network error') }
    setLoading(btn, false)
  })
})
