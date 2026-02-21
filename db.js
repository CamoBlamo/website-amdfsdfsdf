const path = require('path')
const knex = require('knex')

// Build Knex config: prefer DATABASE_URL (Postgres), otherwise use local SQLite
const client = process.env.DB_CLIENT || (process.env.DATABASE_URL ? 'pg' : 'sqlite3')
let config

if (client === 'pg' || client === 'postgres') {
  if (process.env.DATABASE_URL) {
    // Use connection string format
    config = {
      client: 'pg',
      connection: process.env.DATABASE_URL,
      pool: { min: 2, max: 10 }
    }
  } else {
    // Use individual connection parameters
    config = {
      client: 'pg',
      connection: {
        host: process.env.PG_HOST || 'localhost',
        port: process.env.PG_PORT || 5432,
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || '',
        database: process.env.PG_DATABASE || 'dev_mgmt'
      },
      pool: { min: 0, max: 10 }
    }
  }
} else {
  config = {
    client: 'sqlite3',
    connection: { filename: path.join(__dirname, 'users.db') },
    useNullAsDefault: true
  }
}

const db = knex(config)

async function migrate() {
  try {
    // Create users table if it doesn't exist
    const usersExists = await db.schema.hasTable('users')
    if (!usersExists) {
      await db.schema.createTable('users', table => {
        table.increments('id').primary()
        table.string('username')
        table.string('email').unique().notNullable()
        table.string('passwordHash').notNullable()
        table.timestamp('created_at').defaultTo(db.fn.now())
      })
      console.log('Created users table')
    }

    // Create sessions table for connect-session-knex (if used)
    const sessionsExists = await db.schema.hasTable('sessions')
    if (!sessionsExists) {
      await db.schema.createTable('sessions', table => {
        table.string('sid').notNullable().primary()
        table.json('sess').notNullable()
        table.datetime('expired').notNullable()
      })
      console.log('Created sessions table')
    }

    // Create workspaces table
    const workspacesExists = await db.schema.hasTable('workspaces')
    if (!workspacesExists) {
      await db.schema.createTable('workspaces', table => {
        table.increments('id').primary()
        table.integer('creator_id').unsigned().notNullable().references('id').inTable('users')
        table.string('name').notNullable().unique()
        table.string('description')
        table.string('html_file').notNullable()
        table.timestamp('created_at').defaultTo(db.fn.now())
      })
      console.log('Created workspaces table')
    }

    // Create workspace_members table
    const membersExists = await db.schema.hasTable('workspace_members')
    if (!membersExists) {
      await db.schema.createTable('workspace_members', table => {
        table.increments('id').primary()
        table.integer('workspace_id').unsigned().notNullable().references('id').inTable('workspaces')
        table.integer('user_id').unsigned().notNullable().references('id').inTable('users')
        table.string('role').notNullable().defaultTo('developer')
        table.timestamp('joined_at').defaultTo(db.fn.now())
        table.unique(['workspace_id', 'user_id'])
      })
      console.log('Created workspace_members table')
    }

    // Add admin and subscription columns to users if they don't exist
    const hasIsAdmin = await db.schema.hasColumn('users', 'is_admin')
    if (!hasIsAdmin) {
      await db.schema.table('users', table => {
        table.boolean('is_admin').defaultTo(false)
      })
      console.log('Added is_admin column to users table')
    }

    const hasSubscription = await db.schema.hasColumn('users', 'subscription_status')
    if (!hasSubscription) {
      await db.schema.table('users', table => {
        table.string('subscription_status').defaultTo('none')
      })
      console.log('Added subscription_status column to users table')
    }

    // Add user notification preference for site announcements
    const hasNotify = await db.schema.hasColumn('users', 'notify_announcements')
    if (!hasNotify) {
      await db.schema.table('users', table => {
        table.boolean('notify_announcements').defaultTo(true)
      })
      console.log('Added notify_announcements column to users table')
    }

    // Add role column to users if it doesn't exist
    const hasRole = await db.schema.hasColumn('users', 'role')
    if (!hasRole) {
      await db.schema.table('users', table => {
        table.string('role').defaultTo('user') // owner, co-owner, administrator, moderator, user
      })
      console.log('Added role column to users table')
    }

    // Set the owner email if specified
    const ownerEmail = 'camolid93@gmail.com'
    const ownerUser = await db('users').whereRaw('LOWER(email)=LOWER(?)', [ownerEmail]).first()
    if (ownerUser && ownerUser.role !== 'owner') {
      await db('users').where({ id: ownerUser.id }).update({ role: 'owner', is_admin: true })
      console.log(`Set ${ownerEmail} as owner`)
    }

    // Create reports table
    const reportsExists = await db.schema.hasTable('reports')
    if (!reportsExists) {
      await db.schema.createTable('reports', table => {
        table.increments('id').primary()
        table.integer('workspace_id').unsigned().notNullable().references('id').inTable('workspaces').onDelete('CASCADE')
        table.integer('reporter_id').unsigned().notNullable().references('id').inTable('users')
        table.string('reason').notNullable()
        table.text('description')
        table.string('status').notNullable().defaultTo('pending') // pending, reviewed, resolved, dismissed
        table.timestamp('created_at').defaultTo(db.fn.now())
        table.timestamp('resolved_at')
      })
      console.log('Created reports table')
    }

    // Create tasks table
    const tasksExists = await db.schema.hasTable('tasks')
    if (!tasksExists) {
      await db.schema.createTable('tasks', table => {
        table.increments('id').primary()
        table.integer('workspace_id').unsigned().notNullable().references('id').inTable('workspaces').onDelete('CASCADE')
        table.string('title').notNullable()
        table.text('description')
        table.date('due_date')
        table.string('priority').notNullable().defaultTo('medium')
        table.string('status').notNullable().defaultTo('open')
        table.timestamp('created_at').defaultTo(db.fn.now())
      })
      console.log('Created tasks table')
    }

    // Create task_assignments table
    const assignmentsExists = await db.schema.hasTable('task_assignments')
    if (!assignmentsExists) {
      await db.schema.createTable('task_assignments', table => {
        table.increments('id').primary()
        table.integer('task_id').unsigned().notNullable().references('id').inTable('tasks').onDelete('CASCADE')
        table.integer('user_id').unsigned().notNullable().references('id').inTable('users')
        table.timestamp('assigned_at').defaultTo(db.fn.now())
        table.unique(['task_id', 'user_id'])
      })
      console.log('Created task_assignments table')
    }

    // Create announcements table
    const announcementsExists = await db.schema.hasTable('announcements')
    if (!announcementsExists) {
      await db.schema.createTable('announcements', table => {
        table.increments('id').primary()
        table.integer('workspace_id').unsigned().notNullable().references('id').inTable('workspaces').onDelete('CASCADE')
        table.integer('author_id').unsigned().notNullable().references('id').inTable('users')
        table.text('message').notNullable()
        table.timestamp('created_at').defaultTo(db.fn.now())
      })
      console.log('Created announcements table')
    }

    // Create site-wide announcements table (nullable/workspace-independent)
    const siteAnnouncementsExists = await db.schema.hasTable('site_announcements')
    if (!siteAnnouncementsExists) {
      await db.schema.createTable('site_announcements', table => {
        table.increments('id').primary()
        table.integer('author_id').unsigned().notNullable().references('id').inTable('users')
        table.string('title')
        table.text('message').notNullable()
        table.string('level').defaultTo('info')
        table.timestamp('created_at').defaultTo(db.fn.now())
      })
      console.log('Created site_announcements table')
    }
    // Ensure site_announcements has expected columns (for existing installs)
    if (siteAnnouncementsExists) {
      const hasTitle = await db.schema.hasColumn('site_announcements', 'title')
      if (!hasTitle) {
        await db.schema.table('site_announcements', t => t.string('title'))
        console.log('Added title column to site_announcements')
      }
      const hasLevel = await db.schema.hasColumn('site_announcements', 'level')
      if (!hasLevel) {
        await db.schema.table('site_announcements', t => t.string('level').defaultTo('info'))
        console.log('Added level column to site_announcements')
      }
    }
    // Create site announcement views to track which users have seen which announcements
    const viewsExists = await db.schema.hasTable('site_announcement_views')
    if (!viewsExists) {
      await db.schema.createTable('site_announcement_views', table => {
        table.increments('id').primary()
        table.integer('announcement_id').unsigned().notNullable().references('id').inTable('site_announcements').onDelete('CASCADE')
        table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE')
        table.timestamp('seen_at').defaultTo(db.fn.now())
        table.unique(['announcement_id', 'user_id'])
      })
      console.log('Created site_announcement_views table')
    }
  } catch (err) {
    console.error('Database migration error:', err)
    throw err
  }
}

module.exports = { db, migrate }
