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
