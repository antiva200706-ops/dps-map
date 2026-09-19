import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';

const API = '';

function makeIcon(emoji, color, pinned) {
  const ring = pinned ? '3px solid #facc15' : '2px solid white';
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background:${color};
      width:36px;height:36px;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      display:flex;align-items:center;justify-content:center;
      border:${ring};
      box-shadow:0 2px 6px rgba(0,0,0,0.4);
    ">
      <span style="transform:rotate(45deg);font-size:18px;">${emoji}</span>
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });
}

const BASE_ICONS = {
  dps:      makeIcon('🚓', '#e11d48', false),
  camera:   makeIcon('📷', '#f59e0b', false),
  accident: makeIcon('💥', '#dc2626', false),
  roadwork: makeIcon('🚧', '#2563eb', false),
};

const PINNED_ICONS = {
  dps:      makeIcon('🚓', '#e11d48', true),
  camera:   makeIcon('📷', '#f59e0b', true),
  accident: makeIcon('💥', '#dc2626', true),
  roadwork: makeIcon('🚧', '#2563eb', true),
};

const TYPES = [
  { key: 'dps',      label: '🚓 ДПС' },
  { key: 'camera',   label: '📷 Камера' },
  { key: 'accident', label: '💥 Авария' },
  { key: 'roadwork', label: '🚧 Ремонт' },
];

const MY_ICON = L.divIcon({
  className: '',
  html: `<div style="position:relative;">
    <div style="
      position:absolute;
      width:36px;height:36px;
      margin-left:-18px;margin-top:-18px;
      border-radius:50%;
      background:rgba(220,38,38,0.25);
      animation:pulse 1.8s infinite;
    "></div>
    <div style="
      position:absolute;
      width:14px;height:14px;
      margin-left:-7px;margin-top:-7px;
      border-radius:50%;
      background:#dc2626;
      border:3px solid white;
      box-shadow:0 2px 6px rgba(0,0,0,0.4);
    "></div>
  </div>`,
  iconSize: [36, 36],
  iconAnchor: [0, 0],
});

function getDeviceId() {
  let id = localStorage.getItem('device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('device_id', id);
  }
  return id;
}

const api = axios.create({ baseURL: API });
api.interceptors.request.use(cfg => {
  cfg.headers['X-Device-Id'] = getDeviceId();
  return cfg;
});

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff} сек назад`;
  const min = Math.floor(diff / 60);
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  return `${h} ч назад`;
}

function MapRef({ onReady }) {
  const map = useMap();
  useEffect(() => { onReady(map); }, [map, onReady]);
  return null;
}

function ClickHandler({ pendingType, onAdd }) {
  useMapEvents({
    click(e) {
      if (!pendingType) return;
      const comment = window.prompt('Комментарий (необязательно)', '') || '';
      onAdd({ lat: e.latlng.lat, lng: e.latlng.lng, type: pendingType, comment });
    },
  });
  return null;
}

function Recenter({ pos }) {
  const map = useMap();
  useEffect(() => {
    if (pos) map.setView([pos.lat, pos.lng], 13);
  }, [pos, map]);
  return null;
}

function MapMoveHandler({ onMove }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => {
      const c = map.getCenter();
      onMove({ lat: c.lat, lng: c.lng });
    };
    map.on('moveend', handler);
    return () => map.off('moveend', handler);
  }, [map, onMove]);
  return null;
}

export default function App() {
  const [center] = useState({ lat: 55.751244, lng: 37.618423 });
  const [markers, setMarkers] = useState([]);
  const [me, setMe] = useState(null);
  const [pendingType, setPendingType] = useState(null);

  const [profileName, setProfileName] = useState('Аноним');
  const [showProfile, setShowProfile] = useState(false);
  const [nameInput, setNameInput] = useState('');

  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPass, setAdminPass] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const mapRef = useRef(null);
  const lastCenterRef = useRef(center);

  async function loadMarkers(pos) {
    const p = pos || lastCenterRef.current;
    try {
      const { data } = await api.get('/markers', {
        params: { lat: p.lat, lng: p.lng, radius: 50000 },
      });
      setMarkers(data);
    } catch (e) { console.error(e); }
  }

  function handleMapMove(pos) {
    lastCenterRef.current = pos;
    loadMarkers(pos);
  }

  async function addMarker(m) {
    try {
      await api.post('/markers', m);
      setPendingType(null);
      loadMarkers();
    } catch (e) {
      alert(e.response?.data?.error || 'Ошибка при добавлении');
    }
  }

  async function vote(id, value) {
    try {
      const headers = isAdmin && adminPassword
        ? { 'X-Admin-Password': adminPassword }
        : {};
      await api.post(`/markers/${id}/vote`, { value }, { headers });
      loadMarkers();
    } catch (e) {
      alert(e.response?.data?.error || 'Ошибка при голосовании');
    }
  }

  async function saveName() {
    if (!nameInput.trim()) return;
    try {
      await api.post('/me', { name: nameInput.trim() });
      setProfileName(nameInput.trim());
      setNameInput('');
      loadMarkers();
    } catch (e) { alert('Ошибка сохранения'); }
  }

  async function adminLogin() {
    try {
      const { data } = await api.post('/admin/login', { password: adminPass });
      if (data.ok) {
        setIsAdmin(true);
        setAdminPassword(adminPass);
        setAdminPass('');
        alert('Добро пожаловать, админ');
      }
    } catch (e) {
      alert('Неверный пароль');
    }
  }

  async function adminDeleteAll() {
    if (!confirm('Удалить ВСЕ метки? Это необратимо.')) return;
    try {
      await api.post('/admin/delete-all', {}, {
        headers: { 'X-Admin-Password': adminPassword }
      });
      loadMarkers();
      alert('Все метки удалены');
    } catch (e) {
      alert('Ошибка: ' + (e.response?.data?.error || e.message));
    }
  }

  async function adminDeleteOne(id) {
    if (!confirm('Удалить эту метку?')) return;
    try {
      await api.post(`/admin/delete/${id}`, {}, {
        headers: { 'X-Admin-Password': adminPassword }
      });
      loadMarkers();
    } catch (e) {
      alert('Ошибка: ' + (e.response?.data?.error || e.message));
    }
  }

  async function adminPin(id, pinned) {
    try {
      await api.post(`/admin/pin/${id}`, { pinned }, {
        headers: { 'X-Admin-Password': adminPassword }
      });
      loadMarkers();
    } catch (e) {
      alert('Ошибка: ' + (e.response?.data?.error || e.message));
    }
  }

  useEffect(() => {
    api.get('/me').then(r => {
      if (r.data.name) setProfileName(r.data.name);
    }).catch(() => {});

    navigator.geolocation.getCurrentPosition(
      pos => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMe(p);
        lastCenterRef.current = p;
        loadMarkers(p);
      },
      () => loadMarkers(center)
    );

    const refresh = setInterval(() => loadMarkers(), 20000);
    return () => clearInterval(refresh);
  }, []);

  return (
    <div style={{ height: '100vh', width: '100%', position: 'relative' }}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapRef onReady={m => (mapRef.current = m)} />
        <ClickHandler pendingType={pendingType} onAdd={addMarker} />
        <Recenter pos={me} />
        <MapMoveHandler onMove={handleMapMove} />

        {me && <Marker position={[me.lat, me.lng]} icon={MY_ICON} />}

        {markers.map(m => (
          <Marker
            key={m.id}
            position={[m.lat, m.lng]}
            icon={m.pinned ? PINNED_ICONS[m.type] : (BASE_ICONS[m.type] || BASE_ICONS.dps)}
          >
            <Popup>
              <div style={{ minWidth: 220 }}>
                <b>{TYPES.find(t => t.key === m.type)?.label || m.type}</b>
                <br />
                <small style={{ color: '#555' }}>
                  от: {m.author_name || 'Аноним'}
                </small>
                <br />
                {m.comment && <><i>{m.comment}</i><br /></>}
                <small style={{ color: '#888' }}>
                  {m.pinned ? '📌 закреплено' : timeAgo(m.created_at)}
                </small>
                <br />
                <div style={{ margin: '6px 0' }}>
                  👍 {m.confirm_votes} &nbsp; 👎 {m.reject_votes}
                </div>

                {!m.pinned && (
                  <>
                    <button
                      onClick={() => vote(m.id, 1)}
                      style={{ marginRight: 6, padding: '4px 10px', cursor: 'pointer' }}
                    >Подтвердить</button>
                    <button
                      onClick={() => vote(m.id, -1)}
                      style={{ padding: '4px 10px', cursor: 'pointer' }}
                    >Опровергнуть</button>
                  </>
                )}

                {m.pinned && (
                  <div style={{ margin: '6px 0', color: '#dc2626', fontWeight: 600 }}>
                    📌 Закреплено (голосование отключено)
                  </div>
                )}

                {isAdmin && (
                  <div style={{ marginTop: 8 }}>
                    <button
                      onClick={() => adminPin(m.id, !m.pinned)}
                      style={{
                        padding: '4px 10px',
                        marginRight: 6,
                        cursor: 'pointer',
                        background: m.pinned ? '#6b7280' : '#16a34a',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                      }}
                    >{m.pinned ? 'Открепить' : '📌 Закрепить'}</button>
                    <button
                      onClick={() => adminDeleteOne(m.id)}
                      style={{
                        padding: '4px 10px',
                        cursor: 'pointer',
                        background: '#dc2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                      }}
                    >Удалить</button>
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Кнопка меню */}
      <div
        onClick={() => setShowProfile(true)}
        style={{
          position: 'absolute',
          top: 12, right: 12,
          background: 'white',
          padding: '8px 14px',
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          cursor: 'pointer',
          fontSize: 16,
          zIndex: 1000,
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ fontWeight: 500 }}>Меню</span>
        <span style={{ fontSize: 20, lineHeight: 1 }}>⋮</span>
      </div>

      {showProfile && (
        <div style={{
          position: 'absolute',
          top: 0, right: 0, bottom: 0,
          width: 320,
          maxWidth: '90vw',
          background: 'white',
          boxShadow: '-2px 0 12px rgba(0,0,0,0.2)',
          padding: 20,
          zIndex: 1100,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <b style={{ fontSize: 18 }}>Профиль</b>
            <button
              onClick={() => setShowProfile(false)}
              style={{ border: 'none', background: 'transparent', fontSize: 22, cursor: 'pointer' }}
            >×</button>
          </div>

          {/* Кнопка Telegram */}
          <a
            href="https://t.me/policemap"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: 12,
              borderRadius: 8,
              background: '#229ED9',
              color: 'white',
              textDecoration: 'none',
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            <span style={{ fontSize: 18 }}>✈️</span> Мы в Telegram
          </a>

          <div style={{ padding: 10, background: '#f3f4f6', borderRadius: 8 }}>
            Имя: <b>{profileName}</b>
          </div>

          <input
            placeholder="Новое имя"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            style={{ padding: 10, borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 }}
          />

          <button
            onClick={saveName}
            style={{
              padding: 10,
              borderRadius: 8,
              border: 'none',
              background: '#111827',
              color: 'white',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >Сохранить имя</button>

          <hr style={{ margin: '12px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />

          <b>Админ-панель</b>

          {!isAdmin ? (
            <>
              <input
                type="password"
                placeholder="Пароль"
                value={adminPass}
                onChange={e => setAdminPass(e.target.value)}
                style={{ padding: 10, borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 }}
              />
              <button
                onClick={adminLogin}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  border: 'none',
                  background: '#dc2626',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >Войти как админ</button>
            </>
          ) : (
            <>
              <div style={{ color: '#16a34a', fontWeight: 600 }}>
                ✅ Вы вошли как админ
              </div>
              <button
                onClick={adminDeleteAll}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  border: 'none',
                  background: '#dc2626',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >Удалить ВСЕ метки</button>
              <button
                onClick={() => { setIsAdmin(false); setAdminPassword(''); }}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  background: 'white',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >Выйти из админа</button>
            </>
          )}
        </div>
      )}

      {/* Нижняя панель с кнопками */}
      <div style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        padding: '10px 12px',
        paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
        background: 'white',
        boxShadow: '0 -2px 10px rgba(0,0,0,0.15)',
        display: 'flex',
        gap: 8,
        justifyContent: 'center',
        zIndex: 1000,
        flexWrap: 'nowrap',
        overflowX: 'auto',
        overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
      }}>
        {pendingType ? (
          <>
            <div style={{
              padding: '8px 12px',
              background: '#fef3c7',
              borderRadius: 8,
              fontSize: 13,
              alignSelf: 'center',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>
              Кликните по карте
            </div>
            <button
              onClick={() => setPendingType(null)}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: 'none',
                background: '#e5e7eb',
                cursor: 'pointer',
                fontSize: 13,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >Отмена</button>
          </>
        ) : (
          TYPES.map(t => (
            <button
              key={t.key}
              onClick={() => setPendingType(t.key)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: 'none',
                background: '#111827',
                color: 'white',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >{t.label}</button>
          ))
        )}
      </div>
    </div>
  );
}