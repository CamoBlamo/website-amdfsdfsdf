const { db } = require('./db');

async function run() {
  try {
    const updated = await db('workspaces')
      .whereNot('html_file', 'like', 'workspaces/%')
      .update({ html_file: db.raw("'workspaces/' || html_file") });
    console.log('Updated rows:', updated);
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

run();
