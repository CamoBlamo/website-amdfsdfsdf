async function fetchMe(){
  try{
    const r = await fetchWithAuth('/api/me')
    if (!r) return { success:false }
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
  const role = window.normalizeGlobalRole
    ? window.normalizeGlobalRole(user && user.role)
    : String((user && user.role) || 'user').toLowerCase()
  if (window.applyOwnerOnlyVisibility) {
    window.applyOwnerOnlyVisibility(role)
  }

  document.getElementById('username').value = user.username || user.name || ''
  document.getElementById('email').value = user.email || ''
  // preference
  const prefNotify = document.getElementById('prefNotify')
  if (prefNotify) prefNotify.checked = false

  // 2FA status
  if (document.getElementById('twofa-disabled')) {
    document.getElementById('twofa-disabled').style.display = 'block'
  }
  if (document.getElementById('twofa-enabled')) {
    document.getElementById('twofa-enabled').style.display = 'none'
  }

  // Save profile
  document.getElementById('saveProfile').addEventListener('click', async ()=>{
    const btn = document.getElementById('saveProfile')
    setLoading(btn, true)
    const username = document.getElementById('username').value.trim()
    try{
      alert('Username edits are not enabled for OAuth accounts yet.')
    }catch(e){ alert('Network error') }
    setLoading(btn, false)
  })

  const changePassword = document.getElementById('changePassword')
  if (changePassword) {
    changePassword.addEventListener('click', async ()=>{
      alert('Password changes are not available for OAuth accounts.')
    })
  }

  const savePrefs = document.getElementById('savePrefs')
  if (savePrefs) {
    savePrefs.addEventListener('click', async ()=>{
      alert('Preferences are not available for OAuth accounts yet.')
    })
  }

  // ============ 2FA UI Logic ============

  // Enable Email 2FA
  document.getElementById('enableEmail2FA').addEventListener('click', ()=>{
    window.location.href = '/coming-soon.html'
  })

  document.getElementById('cancelEmail2FA').addEventListener('click', ()=>{
    document.getElementById('emailSetupModal').style.display = 'none'
  })

  document.getElementById('confirmEmail2FA').addEventListener('click', async ()=>{
    const password = document.getElementById('email2faPassword').value
    if (!password) { alert('Please enter your password'); return }
    
    const btn = document.getElementById('confirmEmail2FA')
    setLoading(btn, true)
    try {
      const res = await fetch('/2fa/enable/email', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ password })
      })
      const data = await res.json()
      if (!data.success) {
        alert('Failed: ' + (data.errors||[]).join(', '))
        setLoading(btn, false)
        return
      }
      // Show backup codes
      document.getElementById('emailSetupModal').style.display = 'none'
      showBackupCodes(data.backupCodes)
      // Refresh page after closing modal
      setTimeout(() => location.reload(), 500)
    } catch(e) {
      alert('Network error')
    }
    setLoading(btn, false)
  })

  // Enable Authenticator 2FA
  document.getElementById('enableAuth2FA').addEventListener('click', ()=>{
    window.location.href = '/coming-soon.html'
  })

  document.getElementById('cancelAuth1').addEventListener('click', ()=>{
    document.getElementById('authSetupModal').style.display = 'none'
  })

  document.getElementById('nextAuthStep').addEventListener('click', ()=>{
    document.getElementById('authSetupStep1').style.display = 'none'
    document.getElementById('authSetupStep2').style.display = 'block'
    document.getElementById('authCode').value = ''
    document.getElementById('auth2faPassword').value = ''
  })

  document.getElementById('cancelAuth2').addEventListener('click', ()=>{
    document.getElementById('authSetupModal').style.display = 'none'
  })

  document.getElementById('confirmAuth2FA').addEventListener('click', async ()=>{
    const code = document.getElementById('authCode').value
    const password = document.getElementById('auth2faPassword').value
    
    if (!code || code.length !== 6) { alert('Please enter the 6-digit code'); return }
    if (!password) { alert('Please enter your password'); return }
    
    const btn = document.getElementById('confirmAuth2FA')
    setLoading(btn, true)
    try {
      const res = await fetch('/2fa/enable/authenticator', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ password, secret: tempSecret, code })
      })
      const data = await res.json()
      if (!data.success) {
        alert('Failed: ' + (data.errors||[]).join(', '))
        setLoading(btn, false)
        return
      }
      // Show backup codes
      document.getElementById('authSetupModal').style.display = 'none'
      showBackupCodes(data.backupCodes)
      // Refresh page after closing modal
      setTimeout(() => location.reload(), 500)
    } catch(e) {
      alert('Network error')
    }
    setLoading(btn, false)
  })

  // Regenerate backup codes
  document.getElementById('regenerateBackup').addEventListener('click', async ()=>{
    const password = prompt('Enter your password to generate new backup codes:')
    if (!password) return
    
    try {
      const res = await fetch('/2fa/generate-backup-codes', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ password })
      })
      const data = await res.json()
      if (!data.success) {
        alert('Failed: ' + (data.errors||[]).join(', '))
        return
      }
      showBackupCodes(data.backupCodes)
    } catch(e) {
      alert('Network error')
    }
  })

  // Disable 2FA
  document.getElementById('disable2FA').addEventListener('click', ()=>{
    window.location.href = '/coming-soon.html'
  })

  // Backup codes modal
  document.getElementById('closeBackupCodes').addEventListener('click', ()=>{
    document.getElementById('backupCodesModal').style.display = 'none'
  })

  function showBackupCodes(codes) {
    const list = document.getElementById('backupCodesList')
    list.innerHTML = codes.map(c => `<div style="padding:4px;font-size:14px">${c}</div>`).join('')
    document.getElementById('backupCodesModal').style.display = 'flex'
  }
})

