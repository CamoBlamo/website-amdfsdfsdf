const { db } = require('../db')

async function main() {
  try {
    // find an owner user
    let owner = await db('users').where({ role: 'owner' }).first()
    if (!owner) {
      // fallback: take any user
      owner = await db('users').first()
    }

    if (!owner) {
      // create a minimal owner user if none exist
      const inserted = await db('users').insert({ username: 'site-admin', email: 'site-admin@local', passwordHash: '', is_admin: true, role: 'owner' })
      const id = Array.isArray(inserted) ? inserted[0] : inserted
      owner = await db('users').where({ id }).first()
      console.log('Created owner user:', owner.email)
    }

    const [id] = await db('site_announcements').insert({ author_id: owner.id, message: 'This is a test announcement inserted by seed script.' })
    console.log('Inserted site announcement id=', id)
    process.exit(0)
  } catch (err) {
    console.error('Seed error', err)
    process.exit(1)
  }
}

main()
