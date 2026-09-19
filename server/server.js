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
const ADMIN_NAME = 'Администратор';
const MODERATOR_NAME = 'Модератор';

const FORBIDDEN_NAMES = [
  'админ', 'администратор', 'создатель', 'владелец',
  'admin', 'administrator', 'owner', 'creator',
  'модератор', 'moderator', 'мод', 'mod',
  'официальный', 'official', 'support', 'саппорт',
];

function isForbiddenName(name) {
  if (!name) return false;
  const low = name.toLowerCase().trim();
  return FORBIDDEN_NAMES.some(f => low === f || low.includes(f));
}

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

function isAdminOrModerator(req) {
  const pass = req.header('X-Admin-Password');
  if (pass === ADMIN_PASSWORD) return 'admin';
  if (req.user && req.user.is_moderator) return 'moderator';
  return null;
}

app.get('/me', requireDevice, (req, res) => {
  res.json({
    id: req.user.id,
    public_id: req.user.public_id,
    name: req.user.name,
    is_moderator: req.user.is_moderator,
    is_banned: req.user.is_banned,
    can_post: req.user.can_post,
  });
});

app.post('/me', requireDevice, async (req, res) => {
  const { name } = req.body;
  if (!name || name.length > 40) return res.status(400).json({ error: 'bad name' });
  if (req.user.is_moderator) {
    return res.status(403).json({ error: 'Модератор не может менять имя' });
  }
  if (isForbiddenName(name)) {
    return res.status(403).json({ error: 'Это имя запрещено' });
  }
  const { rows } = await db.query(
    `UPDATE users SET name = $1 WHERE id = $2 RETURNING id, name, public_id`,
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
            m.pinned, m.expires_at, m.author_name, m.author_public_id,
            m.author_is_moderator
     FROM markers m
     WHERE (m.status IN ('pending','active') AND m.expires_at > now() OR m.pinned = true)
       AND ST_DWithin(m.location, ST_MakePoint($1,$2)::geography, $3)`,
    [lng, lat, radius]
  );
  res.json(rows);
});

app.post('/markers', requireDevice, async (req, res) => {
  const { lat, lng, type, comment } = req.body;

  if (req.user.is_banned) return res.status(403).json({ error: 'Вы заблокированы' });
  if (!req.user.can_post) return res.status(403).json({ error: 'Вам запрещено ставить метки' });

  const allowedTypes = ['dps','camera','accident','roadwork'];
  const adminTypes = ['trafficlight'];
  const isAdminPass = req.header('X-Admin-Password') === ADMIN_PASSWORD;
  const canPostAdminType = isAdminPass || req.user.is_moderator;

  if (adminTypes.includes(type) && !canPostAdminType) {
    return res.status(403).json({ error: 'Этот тип метки доступен только администрации' });
  }
  if (!allowedTypes.includes(type) && !adminTypes.includes(type)) {
    return res.status(400).json({ error: 'bad type' });
  }

  const authorName = req.user.name || 'Аноним';
  const authorPublicId = req.user.public_id;
  const authorIsModerator = !!req.user.is_moderator;

  const { rows } = await db.query(
    `INSERT INTO markers (user_id, type, location, comment, author_name, author_public_id, author_is_moderator)
     VALUES ($1, $2, ST_MakePoint($3,$4)::geography, $5, $6, $7, $8)
     RETURNING id, type, comment, confirm_votes, reject_votes, status, created_at`,
    [req.user.id, type, lng, lat, comment || null, authorName, authorPublicId, authorIsModerator]
  );
  res.json(rows[0]);
});

app.post('/markers/:id/vote', requireDevice, async (req, res) => {
  const { value } = req.body;
  if (![1, -1].includes(value))
    return res.status(400).json({ error: 'bad vote' });

  if (req.user.is_banned) return res.status(403).json({ error: 'Вы заблокированы' });

  const role = isAdminOrModerator(req);
  const isAdmin = !!role;

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

// --- Пин и удаление меток: админ ИЛИ модератор ---

app.post('/admin/pin/:id', requireDevice, async (req, res) => {
  const role = isAdminOrModerator(req);
  if (!role) return res.status(401).json({ error: 'unauthorized' });
  const { pinned } = req.body;
  await db.query(`UPDATE markers SET pinned = $1 WHERE id = $2`, [!!pinned, req.params.id]);
  res.json({ ok: true });
});

app.post('/admin/delete/:id', requireDevice, async (req, res) => {
  const role = isAdminOrModerator(req);
  if (!role) return res.status(401).json({ error: 'unauthorized' });
  await db.query(`DELETE FROM markers WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

// --- Только админ (по паролю) ---

app.post('/admin/login', async (req, res) => {
  const { password } = req.body;
  const deviceId = req.header('X-Device-Id');
  if (!deviceId) return res.status(400).json({ error: 'no device id' });
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ ok: false });

  const u = await getOrCreateUser(deviceId);
  await db.query(
    `UPDATE users SET name = $1, is_banned = false, can_post = true WHERE id = $2`,
    [ADMIN_NAME, u.id]
  );
  res.json({ ok: true, name: ADMIN_NAME });
});

app.post('/admin/logout', requireDevice, async (req, res) => {
  await db.query(`UPDATE users SET name = NULL WHERE id = $1`, [req.user.id]);
  res.json({ ok: true });
});

app.post('/admin/delete-all', async (req, res) => {
  const pass = req.header('X-Admin-Password');
  if (pass !== ADMIN_PASSWORD) return res.status(401).json({ error: 'unauthorized' });
  await db.query(`DELETE FROM markers`);
  res.json({ ok: true });
});

// Управление пользователем по public_id — одно действие за раз
app.post('/admin/user/:publicId/action', async (req, res) => {
  const pass = req.header('X-Admin-Password');
  if (pass !== ADMIN_PASSWORD) return res.status(401).json({ error: 'unauthorized' });

  const { action } = req.body;
  const publicId = parseInt(req.params.publicId, 10);
  if (!publicId) return res.status(400).json({ error: 'bad id' });

  const check = await db.query(`SELECT * FROM users WHERE public_id = $1`, [publicId]);
  if (!check.rows.length) return res.status(404).json({ error: 'Пользователь не найден' });

  if (action === 'ban') {
    await db.query(`UPDATE users SET is_banned = true WHERE public_id = $1`, [publicId]);
  } else if (action === 'unban') {
    await db.query(`UPDATE users SET is_banned = false WHERE public_id = $1`, [publicId]);
  } else if (action === 'deny_post') {
    await db.query(`UPDATE users SET can_post = false WHERE public_id = $1`, [publicId]);
  } else if (action === 'allow_post') {
    await db.query(`UPDATE users SET can_post = true WHERE public_id = $1`, [publicId]);
  } else if (action === 'make_moderator') {
    await db.query(
      `UPDATE users SET is_moderator = true, name = $1 WHERE public_id = $2`,
      [MODERATOR_NAME, publicId]
    );
  } else if (action === 'remove_moderator') {
    await db.query(
      `UPDATE users SET is_moderator = false, name = NULL WHERE public_id = $1`,
      [publicId]
    );
  } else if (action === 'search') {
    // ничего не делаем — просто возвращаем данные
  } else {
    return res.status(400).json({ error: 'unknown action' });
  }

  const updated = await db.query(
    `SELECT public_id, name, is_moderator, is_banned, can_post FROM users WHERE public_id = $1`,
    [publicId]
  );
  res.json({ ok: true, user: updated.rows[0] });
});

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(3000, () => console.log('server on http://localhost:3000'));