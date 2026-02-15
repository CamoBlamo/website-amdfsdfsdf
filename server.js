require('dotenv').config()
const express = require('express')
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

const app = express()
const PORT = process.env.PORT || 3000

// security middlewares
app.use(helmet())
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
migrate().catch(err => console.error('DB migrate error', err))

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
async function createSessionMiddleware() {
  if (process.env.REDIS_URL) {
    const redisClient = new Redis(process.env.REDIS_URL)
    return session({
      store: new RedisStore({ client: redisClient }),
      secret: process.env.SESSION_SECRET || 'change_this_secret',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 }
    })
  }

  // default to knex-backed sessions
  const store = new KnexStore({ knex: db, tablename: 'sessions', createtable: false })
  return session({
    store,
    secret: process.env.SESSION_SECRET || 'change_this_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 }
  })
}

// expose CSRF token to client via a small endpoint (client can fetch)
app.get('/csrf-token', (req, res) => {
  // csrf middleware will be added after session middleware is created
  res.status(501).json({ error: 'CSRF not initialized yet' })
})

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

    const salt = await bcrypt.genSalt(10)
    const hash = await bcrypt.hash(password, salt)
    await db('users').insert({ username: username.trim(), email: email.trim().toLowerCase(), passwordHash: hash })
    return res.json({ success: true, redirect: '/login.html' })
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

    req.session.userId = user.id
    req.session.username = user.username
    return res.json({ success: true, redirect: '/mainpage.html' })
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

  const { workspace_name, workspace_description } = req.body
  const sanitizedName = workspace_name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()
  const htmlFileName = `workspace-${sanitizedName}-${Date.now()}.html`

  try {
    const existing = await db('workspaces').whereRaw('LOWER(name)=LOWER(?)', [workspace_name]).first()
    if (existing) {
      return res.status(400).json({ success: false, errors: ['Workspace name already exists'] })
    }

    const result = await db('workspaces').insert({
      creator_id: req.session.userId,
      name: workspace_name,
      description: workspace_description || null,
      html_file: htmlFileName
    })

    const workspaceId = result[0]

    await db('workspace_members').insert({
      workspace_id: workspaceId,
      user_id: req.session.userId,
      role: 'admin'
    })

    const templatePath = path.join(__dirname, 'workspace-template.html')
    const newWorkspacePath = path.join(__dirname, htmlFileName)
    let templateContent = fs.readFileSync(templatePath, 'utf8')
    templateContent = templateContent.replace(/\$\{workspacename\}/g, workspace_name)
    fs.writeFileSync(newWorkspacePath, templateContent, 'utf8')

    return res.json({
      success: true,
      workspaceId,
      workspaceUrl: `/${htmlFileName}`
    })
  } catch (err) {
    console.error('Workspace creation error', err)
    return res.status(500).json({ success: false, errors: ['Failed to create workspace'] })
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

    const membership = await db('workspace_members')
      .where({ workspace_id: workspace.id, user_id: req.session.userId })
      .first()

    if (!membership) {
      return res.status(403).json({ success: false, errors: ['You are not a member of this workspace'] })
    }

    const users = await db('workspace_members')
      .join('users', 'workspace_members.user_id', '=', 'users.id')
      .where('workspace_members.workspace_id', workspace.id)
      .select('users.email as email', 'workspace_members.role as role')

    return res.json({ success: true, users })
  } catch (err) {
    console.error('Get workspace users error', err)
    return res.status(500).json({ success: false, errors: ['Failed to retrieve users'] })
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

    if (!requester || (requester.role !== 'admin' && requester.role !== 'head-developer')) {
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

// Create session middleware and initialize CSRF and static serving
createSessionMiddleware().then(sessMid => {
  app.use(sessMid)
  app.use(csurf())
  // expose CSRF token after csrf middleware is present
  app.get('/csrf-token', (req, res) => res.json({ csrfToken: req.csrfToken() }))
  app.use(express.static(path.join(__dirname)))
}).catch(err => {
  console.error('Failed to create session middleware', err)
  process.exit(1)
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
