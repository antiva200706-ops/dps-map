import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const db = new Pool({ connectionString: process.env.DATABASE_URL });

const ADMIN_PASSWORD = 'Anton2104kill';

const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

async function getOrCreateUser(deviceId) {
  const { rows } = await db.query(
    `INSERT INTO users (device_id) VALUES ($1)
     ON CONFLICT (device_id) DO UPDATE SET device_id = EXCLUDED.device_id
     RETURNING *`,
    [deviceId]
  );
  return rows[0];
}

const requireDevice = async (req, res, next) => {
  const deviceId = req.header('X-Device-Id');
  if (!deviceId) return res.status(400).json({ error: 'no device id' });
  req.user = await getOrCreateUser(deviceId);
  next();
};

app.get('/me', requireDevice, (req, res) => {
  res.json({ id: req.user.id, name: req.user.name });
});

app.post('/me', requireDevice, async (req, res) => {
  const { name } = req.body;
  if (!name || name.length > 40) return res.status(400).json({ error: 'bad name' });
  const { rows } = await db.query(
    `UPDATE users SET name = $1 WHERE id = $2 RETURNING id, name`,
    [name, req.user.id]
  );
  res.json(rows[0]);
});

app.get('/markers', requireDevice, async (req, res) => {
  const { lat, lng, radius = 5000 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat/lng required' });
  const { rows } = await db.query(
    `SELECT m.id, m.type, ST_Y(m.location::geometry) AS lat,
            ST_X(m.location::geometry) AS lng, m.comment,
            m.confirm_votes, m.reject_votes, m.status, m.created_at,
            m.pinned, m.expires_at,
            u.name AS author_name
     FROM markers m
     LEFT JOIN users u ON u.id = m.user_id
     WHERE (m.status IN ('pending','active') AND m.expires_at > now() OR m.pinned = true)
       AND ST_DWithin(m.location, ST_MakePoint($1,$2)::geography, $3)`,
    [lng, lat, radius]
  );
  res.json(rows);
});

app.post('/markers', requireDevice, async (req, res) => {
  const { lat, lng, type, comment } = req.body;
  if (!['dps','camera','accident','roadwork'].includes(type))
    return res.status(400).json({ error: 'bad type' });
  const { rows } = await db.query(
    `INSERT INTO markers (user_id, type, location, comment)
     VALUES ($1, $2, ST_MakePoint($3,$4)::geography, $5)
     RETURNING id, type, comment, confirm_votes, reject_votes, status, created_at`,
    [req.user.id, type, lng, lat, comment || null]
  );
  res.json(rows[0]);
});

app.post('/markers/:id/vote', requireDevice, async (req, res) => {
  const { value } = req.body;
  if (![1, -1].includes(value))
    return res.status(400).json({ error: 'bad vote' });

  const isAdmin = req.header('X-Admin-Password') === ADMIN_PASSWORD;

  const check = await db.query(`SELECT pinned FROM markers WHERE id = $1`, [req.params.id]);
  if (!check.rows.length) return res.status(404).json({ error: 'not found' });
  if (check.rows[0].pinned && !isAdmin) {
    return res.status(403).json({ error: 'pinned marker, voting disabled' });
  }

  if (!isAdmin) {
    try {
      await db.query(
        `INSERT INTO votes (marker_id, user_id, value) VALUES ($1,$2,$3)`,
        [req.params.id, req.user.id, value]
      );
    } catch (e) {
      return res.status(409).json({ error: 'already voted' });
    }
  }

  const { rows } = await db.query(
    `UPDATE markers SET
       confirm_votes = confirm_votes + CASE WHEN $1 = 1 THEN 1 ELSE 0 END,
       reject_votes  = reject_votes  + CASE WHEN $1 = -1 THEN 1 ELSE 0 END
     WHERE id = $2
     RETURNING confirm_votes, reject_votes, pinned`,
    [value, req.params.id]
  );

  const m = rows[0];
  let status = null;
  if (!m.pinned) {
    if (m.confirm_votes >= 3 && m.confirm_votes > m.reject_votes) status = 'active';
    if (m.reject_votes >= 3) status = 'rejected';
  }
  if (status) {
    await db.query(`UPDATE markers SET status = $1 WHERE id = $2`, [status, req.params.id]);
  }
  res.json({ ...m, status });
});

app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) return res.json({ ok: true });
  res.status(401).json({ ok: false });
});

app.post('/admin/delete-all', async (req, res) => {
  const pass = req.header('X-Admin-Password');
  if (pass !== ADMIN_PASSWORD) return res.status(401).json({ error: 'unauthorized' });
  await db.query(`DELETE FROM markers`);
  res.json({ ok: true });
});

app.post('/admin/delete/:id', async (req, res) => {
  const pass = req.header('X-Admin-Password');
  if (pass !== ADMIN_PASSWORD) return res.status(401).json({ error: 'unauthorized' });
  await db.query(`DELETE FROM markers WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

app.post('/admin/pin/:id', async (req, res) => {
  const pass = req.header('X-Admin-Password');
  if (pass !== ADMIN_PASSWORD) return res.status(401).json({ error: 'unauthorized' });
  const { pinned } = req.body;
  await db.query(`UPDATE markers SET pinned = $1 WHERE id = $2`, [!!pinned, req.params.id]);
  res.json({ ok: true });
});

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(3000, () => console.log('server on http://localhost:3000'));