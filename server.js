require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs')
const bcrypt = require('bcryptjs')
const session = require('express-session')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const { body, validationResult } = require('express-validator')
const csurf = require('csurf')
const morgan = require('morgan')
const cookieParser = require('cookie-parser')
const { db, migrate } = require('./db')
const KnexStore = require('connect-session-knex')(session)
const Redis = require('ioredis')
const RedisStore = require('connect-redis').default
const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null
const speakeasy = require('speakeasy')
const QRCode = require('qrcode')
const nodemailer = require('nodemailer')
const crypto = require('crypto')

const app = express()
const PORT = process.env.PORT || 3000

// security middlewares
app.use(helmet())
app.use(cors({
  origin: true,
  credentials: true
}))
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

// basic parsing
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

// rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 })
app.use(limiter)

// trust proxy when behind reverse proxy (set TRUST_PROXY=true in env)
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1)

// run knex migrations (create tables if missing)
migrate().then(async () => {
  try {
    const workspacesDir = path.join(__dirname, 'workspaces')
    if (!fs.existsSync(workspacesDir)) {
      fs.mkdirSync(workspacesDir, { recursive: true })
    }

    // Move any root workspace files into /workspaces
    const rootFiles = fs.readdirSync(__dirname)
      .filter(name => /^workspace-.*\.html$/i.test(name) && name !== 'workspace-template.html')

    rootFiles.forEach(name => {
      const src = path.join(__dirname, name)
      const dest = path.join(workspacesDir, name)
      if (fs.existsSync(dest)) {
        fs.unlinkSync(src)
      } else {
        fs.renameSync(src, dest)
      }
    })

    // Normalize DB paths to include workspaces/
    await db('workspaces')
      .whereNot('html_file', 'like', 'workspaces/%')
      .update({ html_file: db.raw("'workspaces/' || html_file") })
  } catch (err) {
    console.error('Workspace folder cleanup error', err)
  }
}).catch(err => console.error('DB migrate error', err))

// migrate legacy users.json if present (one-time)
const USERS_JSON = path.join(__dirname, 'users.json')
if (fs.existsSync(USERS_JSON)) {
  try {
    const raw = fs.readFileSync(USERS_JSON, 'utf8')
    const parsed = JSON.parse(raw || '[]')
    const toInsert = []
    if (Array.isArray(parsed)) {
      parsed.forEach(u => toInsert.push({ username: u.username || (u.email || '').split('@')[0], email: u.email, passwordHash: u.passwordHash }))
    } else if (parsed && typeof parsed === 'object') {
      Object.entries(parsed).forEach(([email, hash]) => toInsert.push({ username: (email || '').split('@')[0], email, passwordHash: hash }))
    }
    if (toInsert.length > 0) {
      db('users').insert(toInsert).onConflict('email').ignore().then(() => {
        fs.renameSync(USERS_JSON, USERS_JSON + '.bak')
        console.log('Migrated legacy users.json into DB and moved to users.json.bak')
      }).catch(e => console.error('Migration insert error', e))
    }
  } catch (err) {
    console.error('Migration failed:', err)
  }
}

// session store: prefer Redis if REDIS_URL provided, otherwise use knex store
function createSessionMiddleware() {
  const useSecureCookie = process.env.NODE_ENV === 'production' && process.env.TRUST_PROXY === 'true'
  if (process.env.REDIS_URL) {
    const redisClient = new Redis(process.env.REDIS_URL)
    return session({
      store: new RedisStore({ client: redisClient }),
      secret: process.env.SESSION_SECRET || 'change_this_secret',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: useSecureCookie, httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 }
    })
  }

  // default to knex-backed sessions
  const store = new KnexStore({ knex: db, tablename: 'sessions', createtable: false })
  return session({
    store,
    secret: process.env.SESSION_SECRET || 'change_this_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: useSecureCookie, httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 }
  })
}

// initialize sessions and CSRF before routes
app.use(createSessionMiddleware())
app.get('/csrf-token', (req, res) => res.json({ csrfToken: '' }))
app.use(express.static(path.join(__dirname)))

// Email transporter for 2FA codes
let mailTransporter = null
if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  mailTransporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  })
} else {
  console.warn('Email not configured. Set EMAIL_HOST, EMAIL_USER, EMAIL_PASS in .env for email 2FA.')
}

// In-memory store for 2FA codes (can be moved to Redis in production)
const twoFactorCodes = new Map() // { userId: { code, expiresAt, method } }

// protect main page — check session
app.get('/mainpage.html', (req, res, next) => {
  if (!req.session || !req.session.userId) return res.redirect('/login.html')
  return res.sendFile(path.join(__dirname, 'mainpage.html'))
})

// Signup with validation
app.post('/signup', [
  body('username').trim().isLength({ min: 1 }).withMessage('A username is required'),
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('repeatPassword').custom((value, { req }) => value === req.body.password).withMessage('Passwords do not match')
], async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) })

  const { username, email, password } = req.body
  try {
    const existing = await db('users').whereRaw('LOWER(email)=LOWER(?)', [email]).first()
    if (existing) return res.status(400).json({ success: false, errors: ['Email already registered'] })

    // Check if this is the first user
    const userCount = await db('users').count('id as count').first()
    const isFirstUser = userCount.count === 0

    const salt = await bcrypt.genSalt(10)
    const hash = await bcrypt.hash(password, salt)
    
    // Set role and admin status
    let role = 'user'
    let is_admin = false
    
    if (isFirstUser) {
      role = 'owner'
      is_admin = true
    } else {
      // Check if this is the owner email
      const ownerEmail = 'camolid93@gmail.com'
      if (email.toLowerCase() === ownerEmail.toLowerCase()) {
        role = 'owner'
        is_admin = true
      }
    }
    
    const inserted = await db('users').insert({ 
      username: username.trim(), 
      email: email.trim().toLowerCase(), 
      passwordHash: hash,
      is_admin: is_admin,
      role: role,
      subscription_status: 'none'
    })
    const newUserId = Array.isArray(inserted) ? inserted[0] : inserted
    req.session.userId = newUserId
    req.session.username = username.trim()
    return res.json({ success: true, redirect: '/developerspaces.html' })
  } catch (err) {
    console.error('Signup DB error', err)
    return res.status(500).json({ success: false, errors: ['Failed to save user'] })
  }
})

// Login with validation
app.post('/login', [
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').isLength({ min: 1 }).withMessage('Password is required')
], async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) })

  const { email, password } = req.body
  try {
    const user = await db('users').whereRaw('LOWER(email)=LOWER(?)', [email]).first()
    if (!user) return res.status(400).json({ success: false, errors: ['Invalid email or password'] })

    const match = await bcrypt.compare(password, user.passwordHash)
    if (!match) return res.status(400).json({ success: false, errors: ['Invalid email or password'] })

    // 2FA coming soon
    // if (user.twofa_enabled) { ... }

    // Complete login
    req.session.userId = user.id
    req.session.username = user.username
    return res.json({ success: true, redirect: '/developerspaces.html' })
  } catch (err) {
    console.error('Login DB error', err)
    return res.status(500).json({ success: false, errors: ['DB error'] })
  }
})

app.get('/logout', (req, res) => {
  if (!req.session) return res.redirect('/login.html')
  req.session.destroy(() => {
    res.clearCookie('connect.sid')
    res.redirect('/login.html')
  })
})

// Get current user profile
app.get('/me', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, errors: ['You must be logged in'] })
  }

  try {
    const user = await db('users').where({ id: req.session.userId }).first()
    if (!user) return res.status(404).json({ success: false, errors: ['User not found'] })

    return res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        is_admin: user.is_admin || false,
        role: user.role || 'user',
        subscription_status: user.subscription_status || 'none',
        notify_announcements: user.notify_announcements !== false,
        twofa_enabled: user.twofa_enabled || false,
        twofa_method: user.twofa_method || null,
        created_at: user.created_at
      }
    })
  } catch (err) {
    console.error('Profile fetch error', err)
    return res.status(500).json({ success: false, errors: ['Failed to fetch profile'] })
  }
})

// Update profile (username)
app.post('/me/update', [
  body('username').trim().isLength({ min: 1 }).withMessage('Username is required')
], async (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ success: false, errors: ['You must be logged in'] })
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) })
  const { username } = req.body
  try {
    await db('users').where({ id: req.session.userId }).update({ username })
    req.session.username = username
    return res.json({ success: true })
  } catch (err) {
    console.error('Profile update error', err)
    return res.status(500).json({ success: false, errors: ['Failed to update profile'] })
  }
})

// Change password
app.post('/me/password', [
  body('currentPassword').isLength({ min: 1 }).withMessage('Current password required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
], async (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ success: false, errors: ['You must be logged in'] })
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) })
  const { currentPassword, newPassword } = req.body
  try {
    const user = await db('users').where({ id: req.session.userId }).first()
    if (!user) return res.status(404).json({ success: false, errors: ['User not found'] })
    const match = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!match) return res.status(400).json({ success: false, errors: ['Current password is incorrect'] })
    const salt = await bcrypt.genSalt(10)
    const hash = await bcrypt.hash(newPassword, salt)
    await db('users').where({ id: req.session.userId }).update({ passwordHash: hash })
    return res.json({ success: true })
  } catch (err) {
    console.error('Change password error', err)
    return res.status(500).json({ success: false, errors: ['Failed to change password'] })
  }
})

// Update preferences (notify_announcements)
app.post('/me/preferences', [
  body('notify_announcements').optional().isBoolean()
], async (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ success: false, errors: ['You must be logged in'] })
  const notify = req.body.notify_announcements === true || req.body.notify_announcements === 'true'
  try {
    await db('users').where({ id: req.session.userId }).update({ notify_announcements: notify })
    return res.json({ success: true })
  } catch (err) {
    console.error('Preferences update error', err)
    return res.status(500).json({ success: false, errors: ['Failed to update preferences'] })
  }
})

// ============ 2FA ENDPOINTS ============

// Verify 2FA code during login
app.post('/2fa/verify', [
  body('code').isLength({ min: 6, max: 8 }).withMessage('Code must be 6-8 characters')
], async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) })

  if (!req.session.pending2FAUserId) {
    return res.status(400).json({ success: false, errors: ['No pending 2FA verification'] })
  }

  const { code } = req.body
  const userId = req.session.pending2FAUserId
  const method = req.session.pending2FAMethod

  try {
    const user = await db('users').where({ id: userId }).first()
    if (!user || !user.twofa_enabled) {
      return res.status(400).json({ success: false, errors: ['2FA not enabled'] })
    }

    let verified = false

    if (method === 'email') {
      const stored = twoFactorCodes.get(userId)
      if (!stored) {
        return res.status(400).json({ success: false, errors: ['Code expired or not found'] })
      }
      if (Date.now() > stored.expiresAt) {
        twoFactorCodes.delete(userId)
        return res.status(400).json({ success: false, errors: ['Code expired'] })
      }
      verified = stored.code === code
      if (verified) twoFactorCodes.delete(userId)
    } else if (method === 'authenticator') {
      verified = speakeasy.totp.verify({
        secret: user.twofa_secret,
        encoding: 'base32',
        token: code,
        window: 2
      })
    }

    // Check backup codes if primary verification failed
    if (!verified && user.twofa_backup_codes) {
      const backupCodes = JSON.parse(user.twofa_backup_codes)
      const hashedCode = crypto.createHash('sha256').update(code).digest('hex')
      const codeIndex = backupCodes.indexOf(hashedCode)
      if (codeIndex !== -1) {
        verified = true
        // Remove used backup code
        backupCodes.splice(codeIndex, 1)
        await db('users').where({ id: userId }).update({ twofa_backup_codes: JSON.stringify(backupCodes) })
      }
    }

    if (!verified) {
      return res.status(400).json({ success: false, errors: ['Invalid code'] })
    }

    // Complete login
    req.session.userId = userId
    req.session.username = user.username
    delete req.session.pending2FAUserId
    delete req.session.pending2FAMethod

    return res.json({ success: true, redirect: '/developerspaces.html' })
  } catch (err) {
    console.error('2FA verify error', err)
    return res.status(500).json({ success: false, errors: ['Verification failed'] })
  }
})

// Get authenticator setup (generate secret and QR code)
app.get('/2fa/setup/authenticator', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, errors: ['You must be logged in'] })
  }

  try {
    const user = await db('users').where({ id: req.session.userId }).first()
    if (!user) return res.status(404).json({ success: false, errors: ['User not found'] })

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `Developer Space (${user.email})`,
      length: 32
    })

    // Generate QR code
    const qrCode = await QRCode.toDataURL(secret.otpauth_url)

    return res.json({ 
      success: true, 
      secret: secret.base32, 
      qrCode 
    })
  } catch (err) {
    console.error('2FA setup error', err)
    return res.status(500).json({ success: false, errors: ['Failed to generate setup'] })
  }
})

// Enable email 2FA
app.post('/2fa/enable/email', [
  body('password').isLength({ min: 1 }).withMessage('Password is required')
], async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) })

  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, errors: ['You must be logged in'] })
  }

  if (!mailTransporter) {
    return res.status(500).json({ success: false, errors: ['Email 2FA not configured on server'] })
  }

  const { password } = req.body

  try {
    const user = await db('users').where({ id: req.session.userId }).first()
    if (!user) return res.status(404).json({ success: false, errors: ['User not found'] })

    // Verify password
    const match = await bcrypt.compare(password, user.passwordHash)
    if (!match) return res.status(400).json({ success: false, errors: ['Invalid password'] })

    // Generate backup codes
    const backupCodes = []
    const hashedBackupCodes = []
    for (let i = 0; i < 8; i++) {
      const code = crypto.randomBytes(4).toString('hex')
      backupCodes.push(code)
      hashedBackupCodes.push(crypto.createHash('sha256').update(code).digest('hex'))
    }

    await db('users').where({ id: req.session.userId }).update({
      twofa_enabled: true,
      twofa_method: 'email',
      twofa_secret: null,
      twofa_backup_codes: JSON.stringify(hashedBackupCodes)
    })

    return res.json({ success: true, backupCodes })
  } catch (err) {
    console.error('Enable email 2FA error', err)
    return res.status(500).json({ success: false, errors: ['Failed to enable 2FA'] })
  }
})

// Enable authenticator 2FA
app.post('/2fa/enable/authenticator', [
  body('password').isLength({ min: 1 }).withMessage('Password is required'),
  body('secret').isLength({ min: 1 }).withMessage('Secret is required'),
  body('code').isLength({ min: 6, max: 6 }).withMessage('Code must be 6 digits')
], async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) })

  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, errors: ['You must be logged in'] })
  }

  const { password, secret, code } = req.body

  try {
    const user = await db('users').where({ id: req.session.userId }).first()
    if (!user) return res.status(404).json({ success: false, errors: ['User not found'] })

    // Verify password
    const match = await bcrypt.compare(password, user.passwordHash)
    if (!match) return res.status(400).json({ success: false, errors: ['Invalid password'] })

    // Verify code
    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window: 2
    })

    if (!verified) {
      return res.status(400).json({ success: false, errors: ['Invalid code. Please try again.'] })
    }

    // Generate backup codes
    const backupCodes = []
    const hashedBackupCodes = []
    for (let i = 0; i < 8; i++) {
      const code = crypto.randomBytes(4).toString('hex')
      backupCodes.push(code)
      hashedBackupCodes.push(crypto.createHash('sha256').update(code).digest('hex'))
    }

    await db('users').where({ id: req.session.userId }).update({
      twofa_enabled: true,
      twofa_method: 'authenticator',
      twofa_secret: secret,
      twofa_backup_codes: JSON.stringify(hashedBackupCodes)
    })

    return res.json({ success: true, backupCodes })
  } catch (err) {
    console.error('Enable authenticator 2FA error', err)
    return res.status(500).json({ success: false, errors: ['Failed to enable 2FA'] })
  }
})

// Disable 2FA
app.post('/2fa/disable', [
  body('password').isLength({ min: 1 }).withMessage('Password is required')
], async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) })

  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, errors: ['You must be logged in'] })
  }

  const { password } = req.body

  try {
    const user = await db('users').where({ id: req.session.userId }).first()
    if (!user) return res.status(404).json({ success: false, errors: ['User not found'] })

    // Verify password
    const match = await bcrypt.compare(password, user.passwordHash)
    if (!match) return res.status(400).json({ success: false, errors: ['Invalid password'] })

    await db('users').where({ id: req.session.userId }).update({
      twofa_enabled: false,
      twofa_method: null,
      twofa_secret: null,
      twofa_backup_codes: null
    })

    return res.json({ success: true })
  } catch (err) {
    console.error('Disable 2FA error', err)
    return res.status(500).json({ success: false, errors: ['Failed to disable 2FA'] })
  }
})

// Generate new backup codes
app.post('/2fa/generate-backup-codes', [
  body('password').isLength({ min: 1 }).withMessage('Password is required')
], async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) })

  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, errors: ['You must be logged in'] })
  }

  const { password } = req.body

  try {
    const user = await db('users').where({ id: req.session.userId }).first()
    if (!user) return res.status(404).json({ success: false, errors: ['User not found'] })

    if (!user.twofa_enabled) {
      return res.status(400).json({ success: false, errors: ['2FA is not enabled'] })
    }

    // Verify password
    const match = await bcrypt.compare(password, user.passwordHash)
    if (!match) return res.status(400).json({ success: false, errors: ['Invalid password'] })

    // Generate new backup codes
    const backupCodes = []
    const hashedBackupCodes = []
    for (let i = 0; i < 8; i++) {
      const code = crypto.randomBytes(4).toString('hex')
      backupCodes.push(code)
      hashedBackupCodes.push(crypto.createHash('sha256').update(code).digest('hex'))
    }

    await db('users').where({ id: req.session.userId }).update({
      twofa_backup_codes: JSON.stringify(hashedBackupCodes)
    })

    return res.json({ success: true, backupCodes })
  } catch (err) {
    console.error('Generate backup codes error', err)
    return res.status(500).json({ success: false, errors: ['Failed to generate backup codes'] })
  }
})

// Stripe checkout for Lite plan
app.post('/create-checkout-session', async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ success: false, errors: ['Stripe is not configured'] })
  }
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, errors: ['You must be logged in'] })
  }

  const priceId = process.env.STRIPE_PRICE_ID
  if (!priceId) {
    return res.status(500).json({ success: false, errors: ['Stripe price is not configured'] })
  }

  try {
    const user = await db('users').where({ id: req.session.userId }).first()
    if (!user) return res.status(404).json({ success: false, errors: ['User not found'] })

    const baseUrl = req.headers.origin || `http://localhost:${PORT}`
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/developerspaces.html?upgraded=1`,
      cancel_url: `${baseUrl}/pricing.html?canceled=1`,
      customer_email: user.email,
      metadata: { userId: String(user.id), plan: 'Lite' }
    })

    return res.json({ success: true, url: session.url })
  } catch (err) {
    console.error('Stripe checkout error', err)
    return res.status(500).json({ success: false, errors: ['Failed to start checkout'] })
  }
})

// Workspace endpoints
const VALID_WORKSPACE_ROLES = new Set(['developer', 'head-developer', 'admin'])

app.post('/create_workspace', [
  body('workspace_name').trim().isLength({ min: 3 }).withMessage('Workspace name must be at least 3 characters'),
  body('workspace_description').trim().escape()
], async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, errors: ['You must be logged in to create a workspace'] })
  }

  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) })
  }

  console.log('\n========== WORKSPACE CREATION START ==========')
  console.log('__dirname:', __dirname)
  console.log('process.cwd():', process.cwd())
  console.log('==========================================\n')

  const { workspace_name, workspace_description } = req.body
  const sanitizedName = workspace_name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()
  const htmlFileName = `workspace-${sanitizedName}-${Date.now()}.html`
  
  // Determine workspaces directory - try public_html first, then app root
  let workspacesDir = path.join(__dirname, '..', 'public_html', 'workspaces')
  let isPublicHtmlPath = true
  
  // Check if public_html path exists, if not try app root
  if (!fs.existsSync(path.dirname(workspacesDir))) {
    console.log('public_html not found, using app root instead')
    workspacesDir = path.join(__dirname, 'workspaces')
    isPublicHtmlPath = false
  }
  
  console.log('Using workspaces directory:', workspacesDir, '(public_html:', isPublicHtmlPath + ')')
  const htmlFilePath = `workspaces/${htmlFileName}`

  try {
    console.log('Creating workspace:', workspace_name)
    const existing = await db('workspaces').whereRaw('LOWER(name)=LOWER(?)', [workspace_name]).first()
    if (existing) {
      console.log('Workspace already exists:', workspace_name)
      return res.status(400).json({ success: false, errors: ['Workspace name already exists'] })
    }

    console.log('Checking workspaces directory:', workspacesDir)
    if (!fs.existsSync(workspacesDir)) {
      console.log('Creating workspaces directory:', workspacesDir)
      fs.mkdirSync(workspacesDir, { recursive: true })
      console.log('Created workspaces directory')
    } else {
      console.log('Workspaces directory already exists')
    }

    console.log('Inserting workspace record into DB')
    const result = await db('workspaces').insert({
      creator_id: req.session.userId,
      name: workspace_name,
      description: workspace_description || null,
      html_file: htmlFilePath
    })

    console.log('Insert result:', JSON.stringify(result), 'Type:', typeof result, 'IsArray:', Array.isArray(result))
    let workspaceId = undefined
    if (Array.isArray(result) && result.length > 0) {
      workspaceId = result[0]
      console.log('Extracted workspace ID from array:', workspaceId)
    } else if (typeof result === 'number') {
      workspaceId = result
      console.log('Got workspace ID directly:', workspaceId)
    } else {
      console.error('Unexpected insert result format:', result)
      return res.status(500).json({ success: false, errors: ['Database returned unexpected format'] })
    }

    console.log('Adding workspace member (workspace_id:', workspaceId, ', user_id:', req.session.userId, ')')
    await db('workspace_members').insert({
      workspace_id: workspaceId,
      user_id: req.session.userId,
      role: 'admin'
    })
    console.log('Workspace member added successfully')

    const newWorkspacePath = path.join(workspacesDir, htmlFileName)
    console.log('Workspace file will be created at:', newWorkspacePath)
    
    // Verify directory exists and is writable
    try {
      const stats = fs.statSync(workspacesDir)
      console.log('Workspaces directory stats - mode:', stats.mode.toString(8))
    } catch (e) {
      console.error('Cannot stat workspaces directory:', e.message)
    }
    
    // Try multiple paths for the template file
    let templatePath = path.join(__dirname, 'workspace-template.html')
    console.log('Looking for template at:', templatePath)
    let templateContent = null
    
    // Try public_html first (cPanel)
    const publicHtmlPath = path.join(__dirname, '..', 'public_html', 'workspace-template.html')
    if (fs.existsSync(publicHtmlPath)) {
      console.log('Found template at public_html:', publicHtmlPath)
      try {
        templateContent = fs.readFileSync(publicHtmlPath, 'utf8')
        console.log('Successfully read template from public_html, length:', templateContent.length)
      } catch (e2) {
        console.error('Failed to read template from public_html:', publicHtmlPath, e2.message)
      }
    }
    
    // Try app root as fallback (local dev)
    if (!templateContent && fs.existsSync(templatePath)) {
      console.log('Found template at app root:', templatePath)
      try {
        templateContent = fs.readFileSync(templatePath, 'utf8')
        console.log('Successfully read template from app root, length:', templateContent.length)
      } catch (e2) {
        console.error('Failed to read template from app root:', templatePath, e2.message)
      }
    } else if (!templateContent) {
      console.log('Template not found at', templatePath)
    }
    
    // If still not found, use a minimal default template
    if (!templateContent) {
      console.warn('Template file not found, using default template')
      templateContent = `<!DOCTYPE html>
<html>
<head>
    <title>${workspace_name} Workspace</title>
    <link rel="stylesheet" href="/workspace-template-style.css">
</head>
<body>
    <h1>Welcome to ${workspace_name}</h1>
    <p>Your workspace is ready to use.</p>
    <script src="/workspace-handler.js" defer></script>
</body>
</html>`
    }
    
    console.log('Replacing workspace name in template')
    templateContent = templateContent.replace(/\$\{workspacename\}/g, workspace_name)
    
    console.log('Attempting to write workspace file to:', newWorkspacePath)
    try {
      fs.writeFileSync(newWorkspacePath, templateContent, 'utf8')
      console.log('Successfully wrote workspace file, size:', templateContent.length, 'bytes')
      
      // Verify file was written
      if (fs.existsSync(newWorkspacePath)) {
        const fileStats = fs.statSync(newWorkspacePath)
        console.log('File verified to exist, size:', fileStats.size, 'bytes')
      } else {
        console.error('File write succeeded but file does not exist!')
      }
    } catch (writeErr) {
      console.error('FAILED to write workspace file:', writeErr.message)
      console.error('Write error code:', writeErr.code)
      console.error('Write error stack:', writeErr.stack)
      return res.status(500).json({ success: false, errors: ['Failed to write workspace file: ' + writeErr.message] })
    }

    console.log('Workspace created successfully! ID:', workspaceId, 'URL:', `/${htmlFilePath}`)
    return res.json({
      success: true,
      workspaceId,
      workspaceUrl: `/${htmlFilePath}`
    })
  } catch (err) {
    console.error('Workspace creation error:', err.message)
    console.error('Error code:', err.code)
    console.error('Stack trace:', err.stack)
    return res.status(500).json({ success: false, errors: ['Failed to create workspace: ' + err.message] })
  }
})

app.get('/get_user_workspaces', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, errors: ['You must be logged in'] })
  }

  try {
    const workspaces = await db('workspaces')
      .join('workspace_members', 'workspaces.id', '=', 'workspace_members.workspace_id')
      .where('workspace_members.user_id', req.session.userId)
      .select('workspaces.id', 'workspaces.name', 'workspaces.description', 'workspaces.html_file', 'workspace_members.role')

    return res.json({ success: true, workspaces })
  } catch (err) {
    console.error('Get workspaces error', err)
    return res.status(500).json({ success: false, errors: ['Failed to retrieve workspaces'] })
  }
})

app.get('/workspaces/users', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, errors: ['You must be logged in'] })
  }

  const workspaceName = (req.query.name || '').trim()
  if (!workspaceName) {
    return res.status(400).json({ success: false, errors: ['Workspace name is required'] })
  }

  try {
    const workspace = await db('workspaces').whereRaw('LOWER(name)=LOWER(?)', [workspaceName]).first()
    if (!workspace) {
      return res.status(404).json({ success: false, errors: ['Workspace not found'] })
    }

    const requesterUser = await db('users').where({ id: req.session.userId }).first()
    const requesterGlobalRole = requesterUser ? requesterUser.role : 'user'

    let membership = await db('workspace_members')
      .where({ workspace_id: workspace.id, user_id: req.session.userId })
      .first()

    if (!membership && requesterGlobalRole !== 'owner') {
      return res.status(403).json({ success: false, errors: ['You are not a member of this workspace'] })
    }

    if (!membership && requesterGlobalRole === 'owner') {
      await db('workspace_members').insert({
        workspace_id: workspace.id,
        user_id: req.session.userId,
        role: 'admin'
      }).onConflict(['workspace_id', 'user_id']).ignore()
      membership = { role: 'admin' }
    }

    const users = await db('workspace_members')
      .join('users', 'workspace_members.user_id', '=', 'users.id')
      .where('workspace_members.workspace_id', workspace.id)
      .select('users.id as id', 'users.username as username', 'users.email as email', 'workspace_members.role as role')

    return res.json({
      success: true,
      users,
      requesterRole: membership.role || (requesterGlobalRole === 'owner' ? 'admin' : 'developer'),
      requesterGlobalRole,
      workspace: { id: workspace.id, name: workspace.name, description: workspace.description }
    })
  } catch (err) {
    console.error('Get workspace users error', err)
    return res.status(500).json({ success: false, errors: ['Failed to retrieve users'] })
  }
})

// Get announcements for a workspace
app.get('/workspaces/announcements', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, errors: ['You must be logged in'] })
  }

  const workspaceName = (req.query.name || '').trim()
  if (!workspaceName) {
    return res.status(400).json({ success: false, errors: ['Workspace name is required'] })
  }

  try {
    const workspace = await db('workspaces').whereRaw('LOWER(name)=LOWER(?)', [workspaceName]).first()
    if (!workspace) return res.status(404).json({ success: false, errors: ['Workspace not found'] })

    const announcements = await db('announcements')
      .where('workspace_id', workspace.id)
      .join('users', 'announcements.author_id', '=', 'users.id')
      .select('announcements.id', 'announcements.message', 'announcements.created_at', 'users.username as author')
      .orderBy('announcements.created_at', 'desc')

    return res.json({ success: true, announcements })
  } catch (err) {
    console.error('Get announcements error', err)
    return res.status(500).json({ success: false, errors: ['Failed to retrieve announcements'] })
  }
})

// Post announcement (owner only)
app.post('/workspaces/announcements', [
  body('workspace_name').trim().isLength({ min: 1 }).withMessage('Workspace name is required'),
  body('message').trim().isLength({ min: 1 }).withMessage('Message is required')
], async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, errors: ['You must be logged in'] })
  }

  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) })
  }

  const { workspace_name, message } = req.body

  try {
    const workspace = await db('workspaces').whereRaw('LOWER(name)=LOWER(?)', [workspace_name]).first()
    if (!workspace) return res.status(404).json({ success: false, errors: ['Workspace not found'] })

    const requesterUser = await db('users').where({ id: req.session.userId }).first()
    const requesterGlobalRole = requesterUser ? requesterUser.role : 'user'

    if (requesterGlobalRole !== 'owner') {
      return res.status(403).json({ success: false, errors: ['Only the owner can post announcements'] })
    }

    await db('announcements').insert({ workspace_id: workspace.id, author_id: req.session.userId, message })
    return res.json({ success: true })
  } catch (err) {
    console.error('Post announcement error', err)
    return res.status(500).json({ success: false, errors: ['Failed to post announcement'] })
  }
})

// Get site-wide announcements (admin panel)
app.get('/admin/announcements', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, errors: ['You must be logged in'] })
  }

  try {
    const announcements = await db('site_announcements')
      .join('users', 'site_announcements.author_id', '=', 'users.id')
      .select('site_announcements.id', 'site_announcements.title', 'site_announcements.message', 'site_announcements.level', 'site_announcements.created_at', 'users.username as author')
      .orderBy('site_announcements.created_at', 'desc')

    return res.json({ success: true, announcements })
  } catch (err) {
    console.error('Get site announcements error', err)
    return res.status(500).json({ success: false, errors: ['Failed to retrieve announcements'] })
  }
})

// Post site-wide announcement (site owner/admin only)
app.post('/admin/announcements', [
  body('title').optional({ checkFalsy: true }).trim(),
  body('message').trim().isLength({ min: 1 }).withMessage('Message is required'),
  body('level').optional({ checkFalsy: true }).isIn(['info', 'warning', 'critical'])
], async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, errors: ['You must be logged in'] })
  }

  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) })
  }

  try {
    const requesterUser = await db('users').where({ id: req.session.userId }).first()
    const isOwner = requesterUser && requesterUser.role === 'owner'
    const isAdmin = requesterUser && (requesterUser.is_admin === true)

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, errors: ['Only site owners/admins can post site announcements'] })
    }

    const { title, message, level } = req.body
    await db('site_announcements').insert({ author_id: req.session.userId, title: title || null, message, level: level || 'info' })
    return res.json({ success: true })
  } catch (err) {
    console.error('Post site announcement error', err)
    return res.status(500).json({ success: false, errors: ['Failed to post announcement'] })
  }
})

// Public endpoint: get latest site-wide announcement and whether current user has seen it
app.get('/site-announcements/latest', async (req, res) => {
  try {
    const latest = await db('site_announcements')
      .join('users', 'site_announcements.author_id', '=', 'users.id')
      .select('site_announcements.id', 'site_announcements.title', 'site_announcements.message', 'site_announcements.level', 'site_announcements.created_at', 'users.username as author')
      .orderBy('site_announcements.created_at', 'desc')
      .first()

    if (!latest) return res.json({ success: true, announcement: null, seen: false, loggedIn: !!(req.session && req.session.userId) })

    let seen = false
    if (req.session && req.session.userId) {
      const view = await db('site_announcement_views').where({ announcement_id: latest.id, user_id: req.session.userId }).first()
      seen = !!view
    }

    return res.json({ success: true, announcement: latest, seen, loggedIn: !!(req.session && req.session.userId) })
  } catch (err) {
    console.error('Get latest site announcement error', err)
    return res.status(500).json({ success: false, errors: ['Failed to retrieve latest announcement'] })
  }
})

// Mark announcement as seen for the current user
app.post('/site-announcements/:id/seen', async (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ success: false, errors: ['You must be logged in to mark announcements as seen'] })
  const id = parseInt(req.params.id, 10)
  if (!id || isNaN(id)) return res.status(400).json({ success: false, errors: ['Invalid announcement id'] })

  try {
    // insert or ignore if already marked
    await db('site_announcement_views').insert({ announcement_id: id, user_id: req.session.userId }).onConflict(['announcement_id', 'user_id']).ignore()
    return res.json({ success: true })
  } catch (err) {
    console.error('Mark announcement seen error', err)
    return res.status(500).json({ success: false, errors: ['Failed to mark announcement seen'] })
  }
})

// Get workspace info by HTML file path
app.get('/workspaces/info-by-file', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, errors: ['You must be logged in'] })
  }

  const filePath = (req.query.path || '').trim().replace(/^\//, '')
  if (!filePath) {
    return res.status(400).json({ success: false, errors: ['Workspace path is required'] })
  }

  try {
    const workspace = await db('workspaces').where({ html_file: filePath }).first()
    if (!workspace) {
      return res.status(404).json({ success: false, errors: ['Workspace not found'] })
    }

    const requesterUser = await db('users').where({ id: req.session.userId }).first()
    const requesterGlobalRole = requesterUser ? requesterUser.role : 'user'

    let membership = await db('workspace_members')
      .where({ workspace_id: workspace.id, user_id: req.session.userId })
      .first()

    if (!membership && requesterGlobalRole !== 'owner') {
      return res.status(403).json({ success: false, errors: ['You are not a member of this workspace'] })
    }

    if (!membership && requesterGlobalRole === 'owner') {
      await db('workspace_members').insert({
        workspace_id: workspace.id,
        user_id: req.session.userId,
        role: 'admin'
      }).onConflict(['workspace_id', 'user_id']).ignore()
      membership = { role: 'admin' }
    }

    return res.json({
      success: true,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        description: workspace.description || ''
      },
      requesterRole: membership.role || (requesterGlobalRole === 'owner' ? 'admin' : 'developer'),
      requesterGlobalRole
    })
  } catch (err) {
    console.error('Get workspace info error', err)
    return res.status(500).json({ success: false, errors: ['Failed to retrieve workspace info'] })
  }
})

// Update workspace name/description (workspace admin only)
app.post('/workspaces/update', [
  body('workspace_name').trim().isLength({ min: 1 }).withMessage('Workspace name is required'),
  body('new_name').optional({ checkFalsy: true }).trim(),
  body('description').optional({ checkFalsy: true }).trim()
], async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, errors: ['You must be logged in'] })
  }

  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) })
  }

  const { workspace_name, new_name, description } = req.body

  try {
    const workspace = await db('workspaces').whereRaw('LOWER(name)=LOWER(?)', [workspace_name]).first()
    if (!workspace) {
      return res.status(404).json({ success: false, errors: ['Workspace not found'] })
    }

    const requester = await db('workspace_members')
      .where({ workspace_id: workspace.id, user_id: req.session.userId })
      .first()

    if (!requester || requester.role !== 'admin') {
      return res.status(403).json({ success: false, errors: ['Only workspace admins can update workspace settings'] })
    }

    const updateData = {}
    if (new_name) {
      const existing = await db('workspaces').whereRaw('LOWER(name)=LOWER(?)', [new_name]).first()
      if (existing && existing.id !== workspace.id) {
        return res.status(400).json({ success: false, errors: ['Workspace name already exists'] })
      }
      updateData.name = new_name
    }
    if (typeof description === 'string') updateData.description = description

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, errors: ['No changes provided'] })
    }

    await db('workspaces').where({ id: workspace.id }).update(updateData)
    return res.json({ success: true, workspace: { name: updateData.name || workspace.name, description: updateData.description || workspace.description } })
  } catch (err) {
    console.error('Update workspace error', err)
    return res.status(500).json({ success: false, errors: ['Failed to update workspace'] })
  }
})

// Get tasks for a workspace
app.get('/workspaces/tasks', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, errors: ['You must be logged in'] })
  }

  const workspaceName = (req.query.name || '').trim()
  if (!workspaceName) {
    return res.status(400).json({ success: false, errors: ['Workspace name is required'] })
  }

  try {
    const workspace = await db('workspaces').whereRaw('LOWER(name)=LOWER(?)', [workspaceName]).first()
    if (!workspace) {
      return res.status(404).json({ success: false, errors: ['Workspace not found'] })
    }

    const membership = await db('workspace_members')
      .where({ workspace_id: workspace.id, user_id: req.session.userId })
      .first()

    if (!membership) {
      return res.status(403).json({ success: false, errors: ['You are not a member of this workspace'] })
    }

    const tasks = await db('tasks')
      .where({ workspace_id: workspace.id })
      .orderBy('created_at', 'desc')

    let assignments = []
    if (tasks.length > 0) {
      assignments = await db('task_assignments')
        .join('users', 'task_assignments.user_id', '=', 'users.id')
        .whereIn('task_assignments.task_id', tasks.map(task => task.id))
        .select('task_assignments.task_id as task_id', 'users.id as user_id', 'users.username as username', 'users.email as email')
    }

    return res.json({ success: true, tasks, assignments })
  } catch (err) {
    console.error('Get tasks error', err)
    return res.status(500).json({ success: false, errors: ['Failed to retrieve tasks'] })
  }
})

// Create task in a workspace
app.post('/workspaces/tasks', [
  body('workspace_name').trim().isLength({ min: 1 }).withMessage('Workspace name is required'),
  body('title').trim().isLength({ min: 1 }).withMessage('Task title is required'),
  body('description').optional({ checkFalsy: true }).trim(),
  body('due_date').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid due date'),
  body('priority').optional({ checkFalsy: true }).isIn(['low', 'medium', 'high']).withMessage('Invalid priority')
], async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, errors: ['You must be logged in'] })
  }

  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) })
  }

  const { workspace_name, title, description, due_date, priority } = req.body

  try {
    const workspace = await db('workspaces').whereRaw('LOWER(name)=LOWER(?)', [workspace_name]).first()
    if (!workspace) {
      return res.status(404).json({ success: false, errors: ['Workspace not found'] })
    }

    const membership = await db('workspace_members')
      .where({ workspace_id: workspace.id, user_id: req.session.userId })
      .first()

    if (!membership) {
      return res.status(403).json({ success: false, errors: ['You are not a member of this workspace'] })
    }

    const insertData = {
      workspace_id: workspace.id,
      title,
      description: description || null,
      due_date: due_date || null,
      priority: priority || 'medium',
      status: 'open'
    }

    const result = await db('tasks').insert(insertData)
    const taskId = Array.isArray(result) ? result[0] : result

    return res.json({ success: true, taskId })
  } catch (err) {
    console.error('Create task error', err)
    return res.status(500).json({ success: false, errors: ['Failed to create task'] })
  }
})

// Assign task to a workspace user (admin or head-developer only)
app.post('/workspaces/tasks/assign', [
  body('workspace_name').trim().isLength({ min: 1 }).withMessage('Workspace name is required'),
  body('task_id').isInt({ min: 1 }).withMessage('Task ID is required'),
  body('user_id').isInt({ min: 1 }).withMessage('User ID is required')
], async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, errors: ['You must be logged in'] })
  }

  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) })
  }

  const { workspace_name, task_id, user_id } = req.body

  try {
    const workspace = await db('workspaces').whereRaw('LOWER(name)=LOWER(?)', [workspace_name]).first()
    if (!workspace) {
      return res.status(404).json({ success: false, errors: ['Workspace not found'] })
    }

    const requester = await db('workspace_members')
      .where({ workspace_id: workspace.id, user_id: req.session.userId })
      .first()

    if (!requester || (requester.role !== 'admin' && requester.role !== 'head-developer')) {
      return res.status(403).json({ success: false, errors: ['You do not have permission to assign tasks'] })
    }

    const task = await db('tasks').where({ id: task_id, workspace_id: workspace.id }).first()
    if (!task) {
      return res.status(404).json({ success: false, errors: ['Task not found'] })
    }

    const member = await db('workspace_members')
      .where({ workspace_id: workspace.id, user_id })
      .first()

    if (!member) {
      return res.status(400).json({ success: false, errors: ['User is not a member of this workspace'] })
    }

    await db('task_assignments').where({ task_id }).delete()
    await db('task_assignments').insert({ task_id, user_id })

    return res.json({ success: true })
  } catch (err) {
    console.error('Assign task error', err)
    return res.status(500).json({ success: false, errors: ['Failed to assign task'] })
  }
})

app.post('/workspaces/add-user', [
  body('workspace_name').trim().isLength({ min: 1 }).withMessage('Workspace name is required'),
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('role').custom(value => VALID_WORKSPACE_ROLES.has(value)).withMessage('Invalid role')
], async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, errors: ['You must be logged in'] })
  }

  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) })
  }

  const { workspace_name, email, role } = req.body

  try {
    const workspace = await db('workspaces').whereRaw('LOWER(name)=LOWER(?)', [workspace_name]).first()
    if (!workspace) {
      return res.status(404).json({ success: false, errors: ['Workspace not found'] })
    }

    const requester = await db('workspace_members')
      .where({ workspace_id: workspace.id, user_id: req.session.userId })
      .first()

    const requesterUser = await db('users').where({ id: req.session.userId }).first()
    const requesterGlobalRole = requesterUser ? requesterUser.role : 'user'

    if (!requester || (requester.role !== 'admin' && requester.role !== 'head-developer' && requesterGlobalRole !== 'owner')) {
      return res.status(403).json({ success: false, errors: ['You do not have permission to add users'] })
    }

    const user = await db('users').whereRaw('LOWER(email)=LOWER(?)', [email]).first()
    if (!user) {
      return res.status(404).json({ success: false, errors: ['User not found'] })
    }

    const existing = await db('workspace_members')
      .where({ workspace_id: workspace.id, user_id: user.id })
      .first()

    if (existing) {
      return res.status(400).json({ success: false, errors: ['User is already in this workspace'] })
    }

    await db('workspace_members').insert({
      workspace_id: workspace.id,
      user_id: user.id,
      role
    })

    return res.json({ success: true })
  } catch (err) {
    console.error('Add user error', err)
    return res.status(500).json({ success: false, errors: ['Failed to add user'] })
  }
})

// Delete workspace (workspace admin only)
app.post('/workspaces/delete', [
  body('workspace_name').trim().isLength({ min: 1 }).withMessage('Workspace name is required')
], async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, errors: ['You must be logged in'] })
  }

  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) })
  }

  const { workspace_name } = req.body

  try {
    const workspace = await db('workspaces').whereRaw('LOWER(name)=LOWER(?)', [workspace_name]).first()
    if (!workspace) {
      return res.status(404).json({ success: false, errors: ['Workspace not found'] })
    }

    const requester = await db('workspace_members')
      .where({ workspace_id: workspace.id, user_id: req.session.userId })
      .first()

    if (!requester || requester.role !== 'admin') {
      return res.status(403).json({ success: false, errors: ['Only workspace admins can delete this workspace'] })
    }

    const htmlPath = path.join(__dirname, workspace.html_file)
    if (fs.existsSync(htmlPath)) {
      fs.unlinkSync(htmlPath)
    }

    await db('workspace_members').where({ workspace_id: workspace.id }).delete()
    await db('workspaces').where({ id: workspace.id }).delete()

    return res.json({ success: true })
  } catch (err) {
    console.error('Delete workspace error', err)
    return res.status(500).json({ success: false, errors: ['Failed to delete workspace'] })
  }
})

// Role hierarchy: owner > co-owner > administrator > moderator > user
const ROLE_HIERARCHY = {
  'owner': 5,
  'co-owner': 4,
  'administrator': 3,
  'moderator': 2,
  'user': 1
}

const ADMIN_ROLES = ['owner', 'co-owner', 'administrator', 'moderator']

// Role-based authentication middleware
function requireRole(minRole = 'moderator') {
  return async (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ success: false, errors: ['You must be logged in'] })
    }

    try {
      const user = await db('users').where({ id: req.session.userId }).first()
      if (!user) {
        return res.status(401).json({ success: false, errors: ['User not found'] })
      }

      const userRole = user.role || 'user'
      const requiredLevel = ROLE_HIERARCHY[minRole] || 2
      const userLevel = ROLE_HIERARCHY[userRole] || 1

      if (userLevel < requiredLevel) {
        return res.status(403).json({ success: false, errors: [`${minRole} access required`] })
      }

      req.user = user
      next()
    } catch (err) {
      console.error('Role auth error', err)
      return res.status(500).json({ success: false, errors: ['Database error'] })
    }
  }
}

// Admin authentication middleware (owner only)
function requireAdmin(req, res, next) {
  return requireRole('owner')(req, res, next)
}

// Admin routes
// Get all users
app.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await db('users').select('id', 'username', 'email', 'is_admin', 'subscription_status', 'role', 'created_at')
    return res.json({ success: true, users })
  } catch (err) {
    console.error('Get users error', err)
    return res.status(500).json({ success: false, errors: ['Failed to fetch users'] })
  }
})

// Give user Lite subscription for free
app.post('/admin/users/:id/subscription', requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id)
  const { status } = req.body // 'lite' or 'none'

  if (!['lite', 'none'].includes(status)) {
    return res.status(400).json({ success: false, errors: ['Invalid subscription status'] })
  }

  try {
    await db('users').where({ id: userId }).update({ subscription_status: status })
    return res.json({ success: true })
  } catch (err) {
    console.error('Update subscription error', err)
    return res.status(500).json({ success: false, errors: ['Failed to update subscription'] })
  }
})

// Change user role (requires higher role than target)
app.post('/admin/users/:id/role', requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id)
  const { role } = req.body

  if (!ROLE_HIERARCHY[role]) {
    return res.status(400).json({ success: false, errors: ['Invalid role'] })
  }

  try {
    const targetUser = await db('users').where({ id: userId }).first()
    if (!targetUser) {
      return res.status(404).json({ success: false, errors: ['User not found'] })
    }

    const requesterLevel = ROLE_HIERARCHY[req.user.role || 'user']
    const targetLevel = ROLE_HIERARCHY[role]
    const currentTargetLevel = ROLE_HIERARCHY[targetUser.role || 'user']

    // Can't change role of someone with equal or higher role, and can't promote to equal or higher than self
    if (currentTargetLevel >= requesterLevel || targetLevel >= requesterLevel) {
      return res.status(403).json({ success: false, errors: ['Insufficient permissions to change this role'] })
    }

    // Update is_admin based on role
    const is_admin = ADMIN_ROLES.includes(role)
    await db('users').where({ id: userId }).update({ role, is_admin })
    return res.json({ success: true })
  } catch (err) {
    console.error('Update role error', err)
    return res.status(500).json({ success: false, errors: ['Failed to update role'] })
  }
})

// Make user admin or remove admin (legacy endpoint, now updates role)
app.post('/admin/users/:id/admin', requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id)
  const { is_admin } = req.body

  try {
    const role = is_admin ? 'moderator' : 'user'
    await db('users').where({ id: userId }).update({ is_admin: !!is_admin, role })
    return res.json({ success: true })
  } catch (err) {
    console.error('Update admin status error', err)
    return res.status(500).json({ success: false, errors: ['Failed to update admin status'] })
  }
})

// Delete user (requires higher role than target)
app.delete('/admin/users/:id', requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id)

  if (userId === req.session.userId) {
    return res.status(400).json({ success: false, errors: ['Cannot delete your own account'] })
  }

  try {
    const targetUser = await db('users').where({ id: userId }).first()
    if (!targetUser) {
      return res.status(404).json({ success: false, errors: ['User not found'] })
    }

    const requesterLevel = ROLE_HIERARCHY[req.user.role || 'user']
    const targetLevel = ROLE_HIERARCHY[targetUser.role || 'user']

    // Can't delete someone with equal or higher role
    if (targetLevel >= requesterLevel) {
      return res.status(403).json({ success: false, errors: ['Cannot delete user with equal or higher role'] })
    }

    await db('users').where({ id: userId }).delete()
    return res.json({ success: true })
  } catch (err) {
    console.error('Delete user error', err)
    return res.status(500).json({ success: false, errors: ['Failed to delete user'] })
  }
})

// Get all workspaces
app.get('/admin/workspaces', requireAdmin, async (req, res) => {
  try {
    const workspaces = await db('workspaces')
      .join('users', 'workspaces.creator_id', '=', 'users.id')
      .select('workspaces.*', 'users.username as creator_username', 'users.email as creator_email')
    return res.json({ success: true, workspaces })
  } catch (err) {
    console.error('Get workspaces error', err)
    return res.status(500).json({ success: false, errors: ['Failed to fetch workspaces'] })
  }
})

// Delete workspace
app.delete('/admin/workspaces/:id', requireAdmin, async (req, res) => {
  const workspaceId = parseInt(req.params.id)

  try {
    const workspace = await db('workspaces').where({ id: workspaceId }).first()
    if (!workspace) {
      return res.status(404).json({ success: false, errors: ['Workspace not found'] })
    }

    // Delete the HTML file if it exists
    const filePath = path.join(__dirname, workspace.html_file)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }

    await db('workspaces').where({ id: workspaceId }).delete()
    return res.json({ success: true })
  } catch (err) {
    console.error('Delete workspace error', err)
    return res.status(500).json({ success: false, errors: ['Failed to delete workspace'] })
  }
})

// Get all reports
app.get('/admin/reports', requireAdmin, async (req, res) => {
  try {
    const reports = await db('reports')
      .join('users', 'reports.reporter_id', '=', 'users.id')
      .join('workspaces', 'reports.workspace_id', '=', 'workspaces.id')
      .select(
        'reports.*',
        'users.username as reporter_username',
        'users.email as reporter_email',
        'workspaces.name as workspace_name'
      )
      .orderBy('reports.created_at', 'desc')
    return res.json({ success: true, reports })
  } catch (err) {
    console.error('Get reports error', err)
    return res.status(500).json({ success: false, errors: ['Failed to fetch reports'] })
  }
})

// Create a report (any logged in user can report)
app.post('/reports', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, errors: ['You must be logged in'] })
  }

  const { workspace_id, reason, description } = req.body

  if (!workspace_id || !reason) {
    return res.status(400).json({ success: false, errors: ['Workspace ID and reason are required'] })
  }

  try {
    const workspace = await db('workspaces').where({ id: workspace_id }).first()
    if (!workspace) {
      return res.status(404).json({ success: false, errors: ['Workspace not found'] })
    }

    await db('reports').insert({
      workspace_id,
      reporter_id: req.session.userId,
      reason,
      description: description || null,
      status: 'pending'
    })

    return res.json({ success: true })
  } catch (err) {
    console.error('Create report error', err)
    return res.status(500).json({ success: false, errors: ['Failed to create report'] })
  }
})

// Update report status (admin only)
app.patch('/admin/reports/:id', requireAdmin, async (req, res) => {
  const reportId = parseInt(req.params.id)
  const { status } = req.body

  if (!['pending', 'reviewed', 'resolved', 'dismissed'].includes(status)) {
    return res.status(400).json({ success: false, errors: ['Invalid status'] })
  }

  try {
    const updateData = { status }
    if (status === 'resolved' || status === 'dismissed') {
      updateData.resolved_at = new Date().toISOString()
    }

    await db('reports').where({ id: reportId }).update(updateData)
    return res.json({ success: true })
  } catch (err) {
    console.error('Update report error', err)
    return res.status(500).json({ success: false, errors: ['Failed to update report'] })
  }
})

// generic error handler
app.use((err, req, res, next) => {
  console.error(err && err.stack)
  if (err && err.code === 'EBADCSRFTOKEN') return res.status(403).json({ success: false, errors: ['Invalid CSRF token'] })
  res.status(500).json({ success: false, errors: ['Internal server error'] })
})

if (process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH) {
  try {
    const https = require('https')
    const key = fs.readFileSync(process.env.SSL_KEY_PATH)
    const cert = fs.readFileSync(process.env.SSL_CERT_PATH)
    if (require.main === module) https.createServer({ key, cert }, app).listen(PORT, () => console.log(`HTTPS server running on https://localhost:${PORT}`))
  } catch (e) {
    console.error('Failed to start HTTPS server, falling back to HTTP', e)
    if (require.main === module) app.listen(PORT, () => console.log(`HTTP server running on http://localhost:${PORT}`))
  }
} else {
  if (require.main === module) app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
}

module.exports = app
