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
  } catch (err) {
    console.error('Database migration error:', err)
    throw err
  }
}

module.exports = { db, migrate }
