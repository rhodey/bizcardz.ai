// init tables
module.exports = async function init(pgPool) {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS fonts (
      name TEXT NOT NULL PRIMARY KEY,
      sort INT NOT NULL,
      created TIMESTAMPTZ DEFAULT NOW(),
      filename TEXT NOT NULL,
      key TEXT NOT NULL,
      tags TEXT
    )`
  )

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS text_batches (
      id TEXT NOT NULL PRIMARY KEY,
      user_id TEXT NOT NULL,
      created TIMESTAMPTZ DEFAULT NOW(),
      worker TEXT DEFAULT NULL,
      worker_alive TIMESTAMPTZ DEFAULT NULL,
      is_ready BOOLEAN DEFAULT FALSE,
      is_front BOOLEAN DEFAULT TRUE,
      timems INT DEFAULT 0,
      dimens TEXT NOT NULL,
      texts JSONB NOT NULL,
      fonts TEXT NOT NULL
    )`
  )

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS text_renders (
      id TEXT NOT NULL PRIMARY KEY,
      user_id TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      thread TEXT NOT NULL,
      created TIMESTAMPTZ DEFAULT NOW(),
      score REAL DEFAULT 0,
      total REAL DEFAULT 0,
      svg TEXT NOT NULL
    )`
  )

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS text_favorites (
      id TEXT NOT NULL PRIMARY KEY,
      user_id TEXT NOT NULL,
      text_render_id TEXT NOT NULL,
      created TIMESTAMPTZ DEFAULT NOW(),
      is_front BOOLEAN DEFAULT TRUE,
      is_deleted BOOLEAN DEFAULT FALSE,
      colors TEXT NOT NULL,
      fonts TEXT NOT NULL
    )`
  )

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS background_batches (
      id TEXT NOT NULL PRIMARY KEY,
      created TIMESTAMPTZ DEFAULT NOW(),
      dimens TEXT NOT NULL,
      colors TEXT NOT NULL,
      prompt JSONB NOT NULL,
      is_ready BOOLEAN DEFAULT FALSE,
      timems INT DEFAULT 0
    )`
  )

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS backgrounds (
      id TEXT NOT NULL PRIMARY KEY,
      batch_id TEXT NOT NULL,
      created TIMESTAMPTZ DEFAULT NOW(),
      score REAL DEFAULT 0,
      total REAL DEFAULT 0,
      dimens TEXT NOT NULL,
      colors TEXT NOT NULL,
      key TEXT NOT NULL
    )`
  )

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS background_favorites (
      id TEXT NOT NULL PRIMARY KEY,
      background_id TEXT NOT NULL,
      created TIMESTAMPTZ DEFAULT NOW(),
      colors TEXT NOT NULL,
      slide1 INT DEFAULT NULL,
      slide2 INT DEFAULT NULL,
      UNIQUE (background_id, colors)
    )`
  )

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS cart_items (
      id TEXT NOT NULL PRIMARY KEY,
      user_id TEXT NOT NULL,
      fav_id_front TEXT NOT NULL,
      fav_id_back TEXT NOT NULL,
      id_back TEXT NOT NULL,
      background_id TEXT NOT NULL,
      created TIMESTAMPTZ DEFAULT NOW(),
      is_deleted BOOLEAN DEFAULT FALSE,
      dimens TEXT NOT NULL,
      colors TEXT NOT NULL,
      fonts TEXT NOT NULL,
      slide1 INT NOT NULL,
      slide2 INT NOT NULL
    )`
  )

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS download_queue (
      id TEXT NOT NULL PRIMARY KEY,
      created TIMESTAMPTZ DEFAULT NOW(),
      worker TEXT DEFAULT NULL,
      worker_alive TIMESTAMPTZ DEFAULT NULL,
      is_ready BOOLEAN DEFAULT FALSE,
      user_id TEXT NOT NULL,
      cart_id TEXT NOT NULL,
      key_front TEXT NOT NULL,
      key_back TEXT NOT NULL,
      key_edge TEXT NOT NULL,
      UNIQUE (cart_id)
    )`
  )

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS downloads (
      id TEXT NOT NULL PRIMARY KEY,
      user_id TEXT NOT NULL,
      cart_id TEXT NOT NULL,
      key TEXT NOT NULL,
      UNIQUE (cart_id)
    )`
  )
}
