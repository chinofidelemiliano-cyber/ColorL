CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE, name TEXT, password TEXT, role TEXT DEFAULT 'laboratorista', theme TEXT DEFAULT 'dark');
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), expires INTEGER);
CREATE TABLE IF NOT EXISTS resets(token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), expires INTEGER);
CREATE TABLE IF NOT EXISTS records(id INTEGER PRIMARY KEY, owner INTEGER REFERENCES users(id), kind TEXT, title TEXT, value TEXT, status TEXT, updated TEXT);
CREATE TABLE IF NOT EXISTS drafts(owner INTEGER REFERENCES users(id), kind TEXT, content TEXT, PRIMARY KEY(owner,kind));
CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY, actor INTEGER, record_id INTEGER, snapshot TEXT, created TEXT);
