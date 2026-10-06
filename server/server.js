import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import path from 'path';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const db = new Pool({ connectionString: process.env.DATABASE_URL });

const ADMIN_PASSWORD = 'Anton2104kill';
const ADMIN_NAME = 'Администратор';
const MODERATOR_NAME = 'Модератор';

const ORS_API_KEY = process.env.ORS_API_KEY;

function decodePolyline(encoded) {
  if (!encoded) return [];
  let index = 0, len = encoded.length;
  let lat = 0, lng = 0;
  const coordinates = [];

  while (index < len) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    coordinates.push([lat * 1e-5, lng * 1e-5]);
  }

  return coordinates;
}

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
    `INSERT INTO users (device_id, last_seen) VALUES ($1, now())
     ON CONFLICT (device_id) DO UPDATE SET device_id = EXCLUDED.device_id, last_seen = now()
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

app.get('/stats', requireDevice, async (req, res) => {
  try {
    const total = await db.query(`SELECT COUNT(*)::int AS c FROM users`);
    const online = await db.query(
      `SELECT COUNT(*)::int AS c FROM users WHERE last_seen > now() - interval '5 minutes'`
    );
    res.json({
      users_total: total.rows[0].c,
      users_online: online.rows[0].c,
    });
  } catch (e) {
    console.error('Stats error:', e);
    res.status(500).json({ error: 'stats failed' });
  }
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
     WHERE (
             m.type = 'camera'
             OR (m.status IN ('pending','active') AND m.expires_at > now())
             OR m.pinned = true
           )
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

  const expiresAtSql = type === 'camera'
    ? "now() + interval '100 years'"
    : "now() + interval '2 hours'";

  const { rows } = await db.query(
    `INSERT INTO markers (user_id, type, location, comment, author_name, author_public_id, author_is_moderator, expires_at)
     VALUES ($1, $2, ST_MakePoint($3,$4)::geography, $5, $6, $7, $8, ${expiresAtSql})
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

  const check = await db.query(`SELECT pinned, type FROM markers WHERE id = $1`, [req.params.id]);
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
     RETURNING confirm_votes, reject_votes, pinned, type`,
    [value, req.params.id]
  );

  const m = rows[0];
  let status = null;
  const isCamera = m.type === 'camera';
  if (!m.pinned && !isCamera) {
    if (m.confirm_votes >= 3 && m.confirm_votes > m.reject_votes) status = 'active';
    if (m.reject_votes >= 3) status = 'rejected';
  }
  if (status) {
    await db.query(`UPDATE markers SET status = $1 WHERE id = $2`, [status, req.params.id]);
  }
  res.json({ ...m, status });
});

app.get('/geocode', requireDevice, async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 3) return res.status(400).json({ error: 'query too short' });
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}&accept-language=ru`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'GdeDPS/1.0 (dps-map)' }
    });
    const data = await r.json();
    const results = (data || []).map(item => ({
      name: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
    }));
    res.json(results);
  } catch (e) {
    console.error('Geocode error:', e);
    res.status(500).json({ error: 'geocode failed' });
  }
});

app.post('/route', requireDevice, async (req, res) => {
  const { from, to, profile = 'driving-car' } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'from/to required' });
  if (!ORS_API_KEY) return res.status(500).json({ error: 'no ORS key configured' });

  try {
    const url = `https://api.heigit.org/openrouteservice/v2/directions/${profile}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': ORS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json, application/geo+json',
      },
      body: JSON.stringify({
        coordinates: [
          [from.lng, from.lat],
          [to.lng, to.lat],
        ],
        instructions: false,
        geometry: true,
      }),
    });

    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }

    if (!r.ok) {
      console.error('ORS error:', r.status, data);
      return res.status(r.status).json({ error: 'route failed', details: data });
    }

    if (data && data.features && data.features[0]) {
      const feat = data.features[0];
      const summary = feat.properties?.summary || {};
      const coords = feat.geometry?.coordinates || [];
      const polyline = coords.map(c => [c[1], c[0]]);
      return res.json({
        distance: summary.distance,
        duration: summary.duration,
        polyline,
      });
    }

    if (data && data.routes && data.routes[0]) {
      const route = data.routes[0];
      const summary = route.summary || {};
      const encoded = route.geometry;
      const polyline = decodePolyline(encoded);
      return res.json({
        distance: summary.distance,
        duration: summary.duration,
        polyline,
      });
    }

    res.status(500).json({ error: 'unknown route format' });
  } catch (e) {
    console.error('Route error:', e);
    res.status(500).json({ error: 'route error' });
  }
});

// === ЧАТ (общий) ===

app.get('/chat/history', requireDevice, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, author_name, author_public_id, message, created_at
       FROM (
         SELECT m.id, m.author_name, u.public_id AS author_public_id, m.message, m.created_at
         FROM chat_messages m
         LEFT JOIN users u ON u.id = m.user_id
         ORDER BY m.created_at DESC
         LIMIT 200
       ) t
       ORDER BY created_at ASC`
    );
    res.json(rows);
  } catch (e) {
    console.error('Chat history error:', e);
    res.status(500).json({ error: 'chat history failed' });
  }
});

app.post('/chat/delete/:id', requireDevice, async (req, res) => {
  const role = isAdminOrModerator(req);
  if (!role) return res.status(401).json({ error: 'unauthorized' });
  try {
    await db.query(`DELETE FROM chat_messages WHERE id = $1`, [req.params.id]);
    io.emit('chat:deleted', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('Chat delete error:', e);
    res.status(500).json({ error: 'delete failed' });
  }
});

// === ТИКЕТЫ (личка с админом) ===

// Получить мой открытый тикет (или null)
app.get('/tickets/my', requireDevice, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, status, created_at, closed_at
       FROM tickets
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.user.id]
    );
    if (!rows.length) return res.json(null);

    const ticket = rows[0];
    const msgs = await db.query(
      `SELECT id, author_name, author_is_admin, message, created_at
       FROM ticket_messages
       WHERE ticket_id = $1
       ORDER BY created_at ASC`,
      [ticket.id]
    );
    res.json({ ...ticket, messages: msgs.rows });
  } catch (e) {
    console.error('Tickets my error:', e);
    res.status(500).json({ error: 'tickets my failed' });
  }
});

// Создать новый тикет (или использовать открытый)
app.post('/tickets/open', requireDevice, async (req, res) => {
  try {
    // Если есть открытый — вернём его
    const existing = await db.query(
      `SELECT id FROM tickets WHERE user_id = $1 AND status = 'open' ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );
    if (existing.rows.length) {
      return res.json({ id: existing.rows[0].id, created: false });
    }
    const { rows } = await db.query(
      `INSERT INTO tickets (user_id, status) VALUES ($1, 'open') RETURNING id`,
      [req.user.id]
    );
    res.json({ id: rows[0].id, created: true });
  } catch (e) {
    console.error('Tickets open error:', e);
    res.status(500).json({ error: 'tickets open failed' });
  }
});

// === АДМИНСКИЕ РОУТЫ ===

// Список всех тикетов (для админа)
app.get('/admin/tickets', requireDevice, async (req, res) => {
  const role = isAdminOrModerator(req);
  if (!role) return res.status(401).json({ error: 'unauthorized' });
  try {
    const { rows } = await db.query(
      `SELECT t.id, t.status, t.created_at, t.closed_at,
              u.public_id AS user_public_id, u.name AS user_name,
              (SELECT COUNT(*)::int FROM ticket_messages WHERE ticket_id = t.id) AS messages_count,
              (SELECT message FROM ticket_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_message,
              (SELECT created_at FROM ticket_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_message_at
       FROM tickets t
       LEFT JOIN users u ON u.id = t.user_id
       ORDER BY 
         CASE WHEN t.status = 'open' THEN 0 ELSE 1 END,
         COALESCE((SELECT created_at FROM ticket_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1), t.created_at) DESC`
    );
    res.json(rows);
  } catch (e) {
    console.error('Admin tickets error:', e);
    res.status(500).json({ error: 'admin tickets failed' });
  }
});

// Получить сообщения конкретного тикета
app.get('/admin/tickets/:id', requireDevice, async (req, res) => {
  const role = isAdminOrModerator(req);
  if (!role) return res.status(401).json({ error: 'unauthorized' });
  try {
    const ticket = await db.query(
      `SELECT t.id, t.status, t.created_at, t.closed_at,
              u.public_id AS user_public_id, u.name AS user_name
       FROM tickets t
       LEFT JOIN users u ON u.id = t.user_id
       WHERE t.id = $1`,
      [req.params.id]
    );
    if (!ticket.rows.length) return res.status(404).json({ error: 'not found' });
    const msgs = await db.query(
      `SELECT id, author_name, author_is_admin, message, created_at
       FROM ticket_messages
       WHERE ticket_id = $1
       ORDER BY created_at ASC`,
      [req.params.id]
    );
    res.json({ ...ticket.rows[0], messages: msgs.rows });
  } catch (e) {
    console.error('Admin ticket detail error:', e);
    res.status(500).json({ error: 'admin ticket failed' });
  }
});

// Закрыть тикет
app.post('/admin/tickets/:id/close', requireDevice, async (req, res) => {
  const role = isAdminOrModerator(req);
  if (!role) return res.status(401).json({ error: 'unauthorized' });
  try {
    await db.query(
      `UPDATE tickets SET status = 'closed', closed_at = now(), closed_by = $1 WHERE id = $2`,
      [role === 'admin' ? 'Администратор' : 'Модератор', req.params.id]
    );
    io.to(`ticket-${req.params.id}`).emit('ticket:closed', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('Close ticket error:', e);
    res.status(500).json({ error: 'close failed' });
  }
});

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
    // ничего
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

// === HTTP + Socket.IO ===
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: '*' },
});

const chatOnline = new Map();

function broadcastOnline() {
  const users = Array.from(chatOnline.values());
  io.emit('chat:online', {
    count: users.length,
    users,
  });
}

io.on('connection', (socket) => {
  const deviceId = socket.handshake.auth?.deviceId;
  const userName = socket.handshake.auth?.name || 'Аноним';
  const publicId = socket.handshake.auth?.publicId;
  const isAdmin = socket.handshake.auth?.isAdmin;
  const isModerator = socket.handshake.auth?.isModerator;

  if (deviceId) {
    chatOnline.set(socket.id, {
      deviceId,
      name: userName,
      public_id: publicId,
    });
    broadcastOnline();
  }

  // === ОБЩИЙ ЧАТ ===
  socket.on('chat:send', async (payload) => {
    try {
      const deviceId = socket.handshake.auth?.deviceId;
      if (!deviceId) return;

      const { message } = payload || {};
      if (!message || !message.trim()) return;
      if (message.length > 1000) return;

      const userRes = await db.query(
        `SELECT id, name, public_id, is_banned FROM users WHERE device_id = $1`,
        [deviceId]
      );
      if (!userRes.rows.length) return;
      const user = userRes.rows[0];
      if (user.is_banned) {
        socket.emit('chat:error', { error: 'Вы заблокированы' });
        return;
      }

      const authorName = user.name || 'Аноним';
      const authorPublicId = user.public_id;

      const { rows } = await db.query(
        `INSERT INTO chat_messages (user_id, author_name, message)
         VALUES ($1, $2, $3)
         RETURNING id, author_name, message, created_at`,
        [user.id, authorName, message.trim()]
      );

      const msg = rows[0];

      await db.query(
        `DELETE FROM chat_messages
         WHERE id IN (
           SELECT id FROM chat_messages
           ORDER BY created_at DESC
           OFFSET 200
         )`
      );

      io.emit('chat:message', {
        id: msg.id,
        author_name: msg.author_name,
        author_public_id: authorPublicId,
        message: msg.message,
        created_at: msg.created_at,
      });
    } catch (e) {
      console.error('chat:send error:', e);
      socket.emit('chat:error', { error: 'Ошибка отправки' });
    }
  });

  // === ТИКЕТЫ ===
  socket.on('ticket:join', (ticketId) => {
    if (ticketId) {
      socket.join(`ticket-${ticketId}`);
    }
  });

  socket.on('ticket:send', async (payload) => {
    try {
      const deviceId = socket.handshake.auth?.deviceId;
      if (!deviceId) return;

      const { ticketId, message, asAdmin } = payload || {};
      if (!ticketId || !message || !message.trim()) return;
      if (message.length > 1000) return;

      // Проверяем, что юзер имеет право писать в этот тикет
      const userRes = await db.query(
        `SELECT id, name, public_id, is_banned, is_moderator FROM users WHERE device_id = $1`,
        [deviceId]
      );
      if (!userRes.rows.length) return;
      const user = userRes.rows[0];
      if (user.is_banned) {
        socket.emit('ticket:error', { error: 'Вы заблокированы' });
        return;
      }

      // Если не админ — проверяем что тикет его
      const isAdminPass = socket.handshake.auth?.isAdmin;
      const isMod = user.is_moderator;
      const isAdminRole = !!isAdminPass || !!isMod;

      const ticketCheck = await db.query(
        `SELECT id, user_id, status FROM tickets WHERE id = $1`,
        [ticketId]
      );
      if (!ticketCheck.rows.length) return;
      const ticket = ticketCheck.rows[0];

      // Юзер может писать только в свой тикет
      if (!isAdminRole && ticket.user_id !== user.id) return;
      if (ticket.status === 'closed' && !isAdminRole) {
        socket.emit('ticket:error', { error: 'Обращение закрыто' });
        return;
      }

      const authorName = user.name || (isAdminRole ? 'Администратор' : 'Аноним');
      const authorIsAdmin = isAdminRole;

      const { rows } = await db.query(
        `INSERT INTO ticket_messages (ticket_id, user_id, author_name, author_is_admin, message)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, author_name, author_is_admin, message, created_at`,
        [ticketId, user.id, authorName, authorIsAdmin, message.trim()]
      );

      const msg = rows[0];

      io.to(`ticket-${ticketId}`).emit('ticket:message', {
        ticket_id: ticketId,
        id: msg.id,
        author_name: msg.author_name,
        author_is_admin: msg.author_is_admin,
        message: msg.message,
        created_at: msg.created_at,
      });
    } catch (e) {
      console.error('ticket:send error:', e);
      socket.emit('ticket:error', { error: 'Ошибка отправки' });
    }
  });

  socket.on('disconnect', () => {
    chatOnline.delete(socket.id);
    broadcastOnline();
  });
});

server.listen(3000, () => console.log('server on http://localhost:3000'));