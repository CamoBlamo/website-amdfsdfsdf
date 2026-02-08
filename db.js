const knex = require('knex')

const isPg = !!process.env.DATABASE_URL

const config = isPg ? {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: { min: 2, max: 10 }
} : {
  client: 'sqlite3',
  connection: { filename: './dev.sqlite3' },
  useNullAsDefault: true
}

const db = knex(config)

async function migrate() {
  // create a minimal users table if it doesn't exist
  const exists = await db.schema.hasTable('users')
  if (!exists) {
    await db.schema.createTable('users', (t) => {
      t.increments('id').primary()
      t.string('username')
      t.string('email').unique()
      t.string('passwordHash')
      t.timestamp('created_at').defaultTo(db.fn.now())
    })
  }
}

module.exports = { db, migrate }
const path = require('path')
const knex = require('knex')

// Build Knex config: prefer DATABASE_URL (Postgres), otherwise use local SQLite
function createKnex() {
  if (process.env.DATABASE_URL) {
    return knex({
      client: 'pg',
      connection: process.env.DATABASE_URL,
      pool: { min: 2, max: 10 }
    })
  }

  const dbFile = path.join(__dirname, 'users.sqlite')
  return knex({
    client: 'sqlite3',
    connection: { filename: dbFile },
    useNullAsDefault: true
  })
}

module.exports = createKnex()
const path = require('path')
const knex = require('knex')

const client = process.env.DB_CLIENT || 'sqlite3'
let config
if (client === 'pg' || client === 'postgres') {
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
} else {
  config = {
    client: 'sqlite3',
    connection: { filename: path.join(__dirname, 'users.db') },
    useNullAsDefault: true
  }
}

const db = knex(config)

async function migrate() {
  const exists = await db.schema.hasTable('users')
  if (!exists) {
    await db.schema.createTable('users', table => {
      table.increments('id').primary()
      table.string('username')
      table.string('email').unique().notNullable()
      table.string('passwordHash').notNullable()
    })
    console.log('Created users table')
  }

  // sessions table for connect-session-knex (if used)
  const sessExists = await db.schema.hasTable('sessions')
  if (!sessExists) {
    await db.schema.createTable('sessions', table => {
      table.string('sid').notNullable().primary()
      table.json('sess').notNullable()
      table.datetime('expired').notNullable()
    })
    console.log('Created sessions table')
  }
}

module.exports = { db, migrate }
