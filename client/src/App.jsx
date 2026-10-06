import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';
import RoutePanel from './RoutePanel';
import ChatPanel from './ChatPanel';
import AdminTickets from './AdminTickets';

const API = '';
const ADMIN_NAME = 'Администратор';
const MODERATOR_NAME = 'Модератор';

const CITIES = [
  { name: 'Калининград', lat: 54.7104, lng: 20.4522 },
  { name: 'Москва',      lat: 55.7512, lng: 37.6184 },
  { name: 'Санкт-Петербург', lat: 59.9343, lng: 30.3351 },
  { name: 'Гданьск',     lat: 54.3520, lng: 18.6466 },
  { name: 'Варшава',     lat: 52.2297, lng: 21.0122 },
  { name: 'Вильнюс',     lat: 54.6872, lng: 25.2797 },
  { name: 'Рига',        lat: 56.9496, lng: 24.1052 },
];

const THEMES = {
  light: {
    bg: '#ffffff', text: '#111827', textMuted: '#6b7280',
    panel: '#ffffff', panelBorder: '#e5e7eb',
    input: '#ffffff', inputBorder: '#d1d5db',
    card: '#f9fafb', shadow: 'rgba(0,0,0,0.15)',
  },
  dark: {
    bg: '#1a1a1a', text: '#f9fafb', textMuted: '#9ca3af',
    panel: '#2a2a2a', panelBorder: '#3a3a3a',
    input: '#2a2a2a', inputBorder: '#3a3a3a',
    card: '#222222', shadow: 'rgba(0,0,0,0.5)',
  },
};

const TEXT_SIZES = {
  small: 0.85, normal: 1.0, large: 1.15, xlarge: 1.3,
};

function makeIcon(emoji, color, pinned) {
  const ring = pinned ? '3px solid #facc15' : '3px solid white';
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background:${color};
      width:38px;height:38px;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      display:flex;align-items:center;justify-content:center;
      border:${ring};
      box-shadow:0 3px 8px rgba(0,0,0,0.35);
    ">
      <span style="transform:rotate(45deg);font-size:20px;">${emoji}</span>
    </div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 38],
    popupAnchor: [0, -38],
  });
}

const BASE_ICONS = {
  dps:          makeIcon('🚓', '#e11d48', false),
  camera:       makeIcon('📷', '#f59e0b', false),
  accident:     makeIcon('💥', '#dc2626', false),
  roadwork:     makeIcon('🚧', '#2563eb', false),
  trafficlight: makeIcon('🚦', '#16a34a', false),
};

const PINNED_ICONS = {
  dps:          makeIcon('🚓', '#e11d48', true),
  camera:       makeIcon('📷', '#f59e0b', true),
  accident:     makeIcon('💥', '#dc2626', true),
  roadwork:     makeIcon('🚧', '#2563eb', true),
  trafficlight: makeIcon('🚦', '#16a34a', true),
};

const START_ICON = L.divIcon({
  className: '',
  html: `<div style="
    width:24px;height:24px;border-radius:50%;
    background:#16a34a;border:3px solid white;
    box-shadow:0 2px 8px rgba(0,0,0,0.4);
    display:flex;align-items:center;justify-content:center;
    color:white;font-weight:bold;font-size:12px;
  ">A</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const END_ICON = L.divIcon({
  className: '',
  html: `<div style="
    width:24px;height:24px;border-radius:50%;
    background:#dc2626;border:3px solid white;
    box-shadow:0 2px 8px rgba(0,0,0,0.4);
    display:flex;align-items:center;justify-content:center;
    color:white;font-weight:bold;font-size:12px;
  ">B</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const TYPES = [
  { key: 'dps',      emoji: '🚓', label: 'ДПС',      bg: 'linear-gradient(135deg, #e11d48, #be123c)' },
  { key: 'camera',   emoji: '📷', label: 'Камера',   bg: 'linear-gradient(135deg, #f59e0b, #d97706)' },
  { key: 'accident', emoji: '💥', label: 'Авария',   bg: 'linear-gradient(135deg, #dc2626, #b91c1c)' },
  { key: 'roadwork', emoji: '🚧', label: 'Ремонт',   bg: 'linear-gradient(135deg, #2563eb, #1d4ed8)' },
];

const ADMIN_TYPES = [
  { key: 'trafficlight', emoji: '🚦', label: 'Светофор', bg: 'linear-gradient(135deg, #16a34a, #15803d)' },
];

const TYPE_LABELS = {
  dps: '🚓 ДПС', camera: '📷 Камера', accident: '💥 Авария',
  roadwork: '🚧 Ремонт', trafficlight: '🚦 Светофор',
};

const RADIUS_OPTIONS = [
  { km: 1,  label: '1 км' },
  { km: 3,  label: '3 км' },
  { km: 5,  label: '5 км' },
  { km: 10, label: '10 км' },
];

const ALERT_RADIUS_OPTIONS = [
  { km: 0.5, label: '500 м' },
  { km: 1,   label: '1 км' },
  { km: 2,   label: '2 км' },
  { km: 3,   label: '3 км' },
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

const DEFAULT_SETTINGS = {
  theme: 'light',
  textSize: 'normal',
  city: '',
  dpsRadius: 3,
  alertsEnabled: false,
  alertRadius: 1,
  alertSound: true,
  alertVibration: true,
  speedometerEnabled: true,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem('app_settings');
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {}
  return DEFAULT_SETTINGS;
}

function saveSettings(s) {
  try {
    localStorage.setItem('app_settings', JSON.stringify(s));
  } catch (e) {}
}

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

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchSpeedLimit(lat, lng) {
  const query = `
    [out:json][timeout:10];
    way(around:30,${lat},${lng})["highway"];
    out tags 5;
  `;
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
    });
    const data = await res.json();
    if (!data.elements || !data.elements.length) return null;

    for (const el of data.elements) {
      const ms = el.tags?.maxspeed;
      if (!ms) continue;
      const s = String(ms).toLowerCase().trim();
      const numMatch = s.match(/(\d+)/);
      if (numMatch) {
        const n = parseInt(numMatch[1], 10);
        if (n >= 10 && n <= 150) return n;
      }
      if (s === 'urban' || s === 'city') return 60;
      if (s === 'rural') return 90;
      if (s === 'motorway') return 110;
    }
    return null;
  } catch (e) {
    return null;
  }
}

function playAlertSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [0, 0.22].forEach(offset => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0, now + offset);
      gain.gain.linearRampToValueAtTime(0.4, now + offset + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + offset + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.2);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch (e) {}
}

function vibrate(pattern = [200, 100, 200, 100, 200]) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) {}
}

function AuthorName({ name, theme }) {
  const displayName = name || 'Аноним';
  const isAdmin = displayName === ADMIN_NAME;
  const isModerator = displayName === MODERATOR_NAME;
  let color = theme.textMuted;
  let weight = 400;
  let badgeColor = null;
  if (isAdmin) { color = '#dc2626'; weight = 600; badgeColor = '#1d9bf0'; }
  if (isModerator) { color = '#1d9bf0'; weight = 600; badgeColor = '#1d9bf0'; }

  return (
    <span style={{
      color, fontWeight: weight,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      {displayName}
      {badgeColor && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="11" fill={badgeColor} />
          <path d="M7 12.5l3.2 3.2L17 9" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      )}
    </span>
  );
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
    if (pos) map.setView([pos.lat, pos.lng], 15);
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

function SpeedTracker({ onUpdate, onPosition }) {
  const bufferRef = useRef([]);
  const stableCountRef = useRef(0);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (onPosition) onPosition({ lat, lng });

        let speedKmh = pos.coords.speed != null
          ? Math.max(0, pos.coords.speed * 3.6)
          : null;
        if (speedKmh == null) return;

        const buf = bufferRef.current;
        buf.push(speedKmh);
        if (buf.length > 5) buf.shift();
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;

        if (avg < 15) {
          stableCountRef.current = 0;
          onUpdate(0);
        } else {
          stableCountRef.current += 1;
          if (stableCountRef.current >= 2) {
            onUpdate(Math.round(avg));
          }
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [onUpdate, onPosition]);
  return null;
}

function AlertTracker({ me, markers, settings, onAlert }) {
  const triggeredRef = useRef(new Set());

  useEffect(() => {
    if (!settings.alertsEnabled) return;
    if (!me) return;

    const alertRadiusM = settings.alertRadius * 1000;

    markers.forEach(m => {
      if (m.type !== 'dps') return;
      const dist = distanceMeters(me.lat, me.lng, m.lat, m.lng);
      if (dist <= alertRadiusM && !triggeredRef.current.has(m.id)) {
        triggeredRef.current.add(m.id);
        onAlert(m, Math.round(dist));
        if (settings.alertSound) playAlertSound();
        if (settings.alertVibration) vibrate();
      }
      if (dist > alertRadiusM * 2) {
        triggeredRef.current.delete(m.id);
      }
    });
  }, [me, markers, settings, onAlert]);

  return null;
}

export default function App() {
  const [center] = useState({ lat: 54.7104, lng: 20.4522 });
  const [markers, setMarkers] = useState([]);
  const [me, setMe] = useState(null);
  const [pendingType, setPendingType] = useState(null);

  const [profileName, setProfileName] = useState('Аноним');
  const [profileId, setProfileId] = useState(null);
  const [isModerator, setIsModerator] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [nameInput, setNameInput] = useState('');

  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPass, setAdminPass] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [targetUser, setTargetUser] = useState(null);
  const [searchError, setSearchError] = useState('');

  const [showRoute, setShowRoute] = useState(false);
  const [routeData, setRouteData] = useState(null);

  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);

  const [mySpeed, setMySpeed] = useState(null);
  const [speedLimit, setSpeedLimit] = useState(null);
  const [stats, setStats] = useState({ users_total: 0, users_online: 0 });

  const [showChat, setShowChat] = useState(false);
  const [showAdminTickets, setShowAdminTickets] = useState(false);

  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 700
  );

  const [alert, setAlert] = useState(null);
  const alertTimerRef = useRef(null);

  const [settings, setSettings] = useState(loadSettings());
  const theme = THEMES[settings.theme] || THEMES.light;
  const textScale = TEXT_SIZES[settings.textSize] || 1.0;

  const mapRef = useRef(null);
  const lastCenterRef = useRef(center);
  const lastSpeedCheckRef = useRef(0);

  function updateSettings(patch) {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  }

  function showAlert(marker, distance) {
    setAlert({ marker, distance });
    if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    alertTimerRef.current = setTimeout(() => setAlert(null), 6000);
  }

  function testAlert() {
    const fakeMarker = {
      id: 'test-' + Date.now(),
      type: 'dps',
      comment: '🔔 Это тестовое уведомление',
    };
    showAlert(fakeMarker, 350);
    if (settings.alertSound) playAlertSound();
    if (settings.alertVibration) vibrate();
  }

  async function handlePosition(pos) {
    const now = Date.now();
    if (now - lastSpeedCheckRef.current < 15000) return;
    lastSpeedCheckRef.current = now;
    const limit = await fetchSpeedLimit(pos.lat, pos.lng);
    setSpeedLimit(limit);
  }

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
      const headers = isAdmin && adminPassword
        ? { 'X-Admin-Password': adminPassword }
        : {};
      await api.post('/markers', m, { headers });
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
    } catch (e) {
      alert(e.response?.data?.error || 'Ошибка сохранения');
    }
  }

  async function adminLogin() {
    try {
      const { data } = await api.post('/admin/login', { password: adminPass });
      if (data.ok) {
        setIsAdmin(true);
        setAdminPassword(adminPass);
        setAdminPass('');
        setProfileName(ADMIN_NAME);
        loadMarkers();
        api.get('/me').then(r => {
          if (r.data.name) setProfileName(r.data.name);
          if (r.data.public_id) setProfileId(r.data.public_id);
          setIsModerator(!!r.data.is_moderator);
        }).catch(() => {});
        alert('Добро пожаловать, администратор');
      }
    } catch (e) {
      alert('Неверный пароль');
    }
  }

  async function adminLogout() {
    try {
      await api.post('/admin/logout');
    } catch (e) {}
    setIsAdmin(false);
    setAdminPassword('');
    setProfileName('Аноним');
    setShowAdminPanel(false);
    setTargetUser(null);
    loadMarkers();
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
      const headers = isAdmin && adminPassword
        ? { 'X-Admin-Password': adminPassword }
        : {};
      await api.post(`/admin/delete/${id}`, {}, { headers });
      loadMarkers();
    } catch (e) {
      alert('Ошибка: ' + (e.response?.data?.error || e.message));
    }
  }

  async function adminPin(id, pinned) {
    try {
      const headers = isAdmin && adminPassword
        ? { 'X-Admin-Password': adminPassword }
        : {};
      await api.post(`/admin/pin/${id}`, { pinned }, { headers });
      loadMarkers();
    } catch (e) {
      alert('Ошибка: ' + (e.response?.data?.error || e.message));
    }
  }

  async function findUser() {
    setSearchError('');
    setTargetUser(null);
    const id = parseInt(targetId, 10);
    if (!id) { setSearchError('Введите числовой ID'); return; }
    try {
      const res = await api.post(`/admin/user/${id}/action`, { action: 'search' }, {
        headers: { 'X-Admin-Password': adminPassword }
      });
      setTargetUser(res.data.user);
    } catch (e) {
      setSearchError(e.response?.data?.error || 'Пользователь не найден');
    }
  }

  async function userAction(action) {
    if (!targetUser) return;
    try {
      const res = await api.post(`/admin/user/${targetUser.public_id}/action`, { action }, {
        headers: { 'X-Admin-Password': adminPassword }
      });
      setTargetUser(res.data.user);
    } catch (e) {
      alert('Ошибка: ' + (e.response?.data?.error || e.message));
    }
  }

  async function handleInstallClick() {
    if (!installPrompt) {
      alert('Установка недоступна в этом браузере. На iOS: откройте меню «Поделиться» → «На экран Домой».');
      return;
    }
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
      setIsInstalled(true);
    }
  }

  function goToMe() {
    if (!navigator.geolocation) {
      alert('Геолокация недоступна');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMe(p);
        lastCenterRef.current = p;
        updateSettings({ city: '' });
        if (mapRef.current) mapRef.current.setView([p.lat, p.lng], 15);
        loadMarkers(p);
      },
      () => alert('Не удалось определить местоположение'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  function goToCity(cityName) {
    if (!cityName) {
      updateSettings({ city: '' });
      goToMe();
      return;
    }
    const city = CITIES.find(c => c.name === cityName);
    if (!city || !mapRef.current) return;
    mapRef.current.setView([city.lat, city.lng], 13);
    lastCenterRef.current = { lat: city.lat, lng: city.lng };
    loadMarkers({ lat: city.lat, lng: city.lng });
    updateSettings({ city: cityName });
  }

  useEffect(() => {
    api.get('/me').then(r => {
      if (r.data.name) setProfileName(r.data.name);
      if (r.data.public_id) setProfileId(r.data.public_id);
      setIsModerator(!!r.data.is_moderator);
    }).catch(() => {});

    if (settings.city) {
      const city = CITIES.find(c => c.name === settings.city);
      if (city) {
        lastCenterRef.current = { lat: city.lat, lng: city.lng };
        setTimeout(() => {
          if (mapRef.current) mapRef.current.setView([city.lat, city.lng], 13);
        }, 100);
        loadMarkers({ lat: city.lat, lng: city.lng });
      }
    } else {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setMe(p);
          lastCenterRef.current = p;
          loadMarkers(p);
        },
        () => loadMarkers(center)
      );
    }

    const refresh = setInterval(() => loadMarkers(), 20000);

    api.get('/stats').then(r => setStats(r.data)).catch(() => {});
    const statsInterval = setInterval(() => {
      api.get('/stats').then(r => setStats(r.data)).catch(() => {});
    }, 60000);

    const beforeInstallHandler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', beforeInstallHandler);

    function onResize() {
      setIsMobile(window.innerWidth < 700);
    }
    window.addEventListener('resize', onResize);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    });

    return () => {
      clearInterval(refresh);
      clearInterval(statsInterval);
      window.removeEventListener('beforeinstallprompt', beforeInstallHandler);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const canAdminActions = isAdmin || isModerator;
  const allTypes = canAdminActions ? [...TYPES, ...ADMIN_TYPES] : TYPES;

  const radiusM = settings.dpsRadius * 1000;
  const nearbyDps = me
    ? markers.filter(m => m.type === 'dps' && distanceMeters(me.lat, me.lng, m.lat, m.lng) <= radiusM).length
    : 0;

  const appStyle = {
    height: '100vh',
    width: '100%',
    position: 'relative',
    background: theme.bg,
    color: theme.text,
    fontSize: `${14 * textScale}px`,
    fontFamily: 'system-ui, sans-serif',
    overflow: 'hidden',
    overscrollBehavior: 'none',
    touchAction: 'pan-x pan-y pinch-zoom',
  };

  const speeding = speedLimit != null && mySpeed != null && mySpeed > speedLimit + 5;

  return (
    <div style={appStyle}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={13}
        zoomControl={false}
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
        <SpeedTracker onUpdate={setMySpeed} onPosition={handlePosition} />
        <AlertTracker me={me} markers={markers} settings={settings} onAlert={showAlert} />

        {me && <Marker position={[me.lat, me.lng]} icon={MY_ICON} />}

        {routeData && routeData.polyline && (
          <>
            <Polyline
              positions={routeData.polyline}
              pathOptions={{
                color: '#1d9bf0',
                weight: 6,
                opacity: 0.85,
                lineCap: 'round',
              }}
            />
            {routeData.from && (
              <Marker position={[routeData.from.lat, routeData.from.lng]} icon={START_ICON} />
            )}
            {routeData.to && (
              <Marker position={[routeData.to.lat, routeData.to.lng]} icon={END_ICON} />
            )}
          </>
        )}

        {markers.map(m => (
          <Marker
            key={m.id}
            position={[m.lat, m.lng]}
            icon={m.pinned ? PINNED_ICONS[m.type] : (BASE_ICONS[m.type] || BASE_ICONS.dps)}
          >
            <Popup>
              <div style={{ minWidth: 220, fontFamily: 'system-ui, sans-serif', color: '#111827' }}>
                <b style={{ fontSize: 15 }}>{TYPE_LABELS[m.type] || m.type}</b>
                <br />
                <small>
                  от: <AuthorName name={m.author_name} theme={THEMES.light} />
                </small>
                {isAdmin && m.author_public_id && (
                  <>
                    <br />
                    <small style={{ color: '#888' }}>
                      ID автора: <b>#{m.author_public_id}</b>
                    </small>
                  </>
                )}
                <br />
                {m.comment && <><i>{m.comment}</i><br /></>}
                <small style={{ color: '#888' }}>
                  {m.pinned ? '📌 закреплено' : timeAgo(m.created_at)}
                </small>
                {m.type === 'camera' && (
                  <>
                    <br />
                    <small style={{
                      color: m.pinned ? '#16a34a' : '#f59e0b',
                      fontWeight: 600,
                      fontSize: 12,
                    }}>
                      {m.pinned ? '✅ Камера подтверждена администратором' : '⚠️ Не подтверждено администратором'}
                    </small>
                  </>
                )}
                <br />
                <div style={{ margin: '8px 0', fontSize: 14 }}>
                  👍 {m.confirm_votes} &nbsp; 👎 {m.reject_votes}
                </div>

                {!m.pinned && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button
                      onClick={() => vote(m.id, 1)}
                      style={{
                        flex: 1, padding: '8px 10px', cursor: 'pointer',
                        background: 'linear-gradient(135deg, #16a34a, #15803d)',
                        color: 'white', border: 'none', borderRadius: 10,
                        fontSize: 13, fontWeight: 600,
                      }}
                    >👍 Да</button>
                    <button
                      onClick={() => vote(m.id, -1)}
                      style={{
                        flex: 1, padding: '8px 10px', cursor: 'pointer',
                        background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                        color: 'white', border: 'none', borderRadius: 10,
                        fontSize: 13, fontWeight: 600,
                      }}
                    >👎 Нет</button>
                  </div>
                )}

                {m.pinned && (
                  <div style={{ margin: '6px 0', color: '#dc2626', fontWeight: 600, fontSize: 13 }}>
                    📌 Закреплено
                  </div>
                )}

                {canAdminActions && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button
                      onClick={() => adminPin(m.id, !m.pinned)}
                      style={{
                        flex: 1, padding: '7px 8px', cursor: 'pointer',
                        background: m.pinned
                          ? 'linear-gradient(135deg, #6b7280, #4b5563)'
                          : 'linear-gradient(135deg, #16a34a, #15803d)',
                        color: 'white', border: 'none', borderRadius: 10,
                        fontSize: 12, fontWeight: 600,
                      }}
                    >{m.pinned ? 'Открепить' : '📌 Закрепить'}</button>
                    <button
                      onClick={() => adminDeleteOne(m.id)}
                      style={{
                        flex: 1, padding: '7px 8px', cursor: 'pointer',
                        background: 'linear-gradient(135deg, #dc2626, #991b1b)',
                        color: 'white', border: 'none', borderRadius: 10,
                        fontSize: 12, fontWeight: 600,
                      }}
                    >🗑 Удалить</button>
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {alert && (
        <div
          style={{
            position: 'absolute', top: 70, left: '50%',
            transform: 'translateX(-50%)',
            background: 'linear-gradient(135deg, #e11d48, #be123c)',
            color: 'white',
            padding: `${14 * textScale}px ${20 * textScale}px`,
            borderRadius: 16,
            boxShadow: '0 8px 30px rgba(225,29,72,0.5)',
            zIndex: 2000, maxWidth: '92vw',
            display: 'flex', alignItems: 'center', gap: 12,
            fontSize: `${14 * textScale}px`, fontWeight: 600,
          }}
        >
          <span style={{ fontSize: `${28 * textScale}px`, lineHeight: 1 }}>🚓</span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: `${15 * textScale}px` }}>Внимание! ДПС рядом</span>
            <span style={{ fontSize: `${12 * textScale}px`, opacity: 0.9, fontWeight: 400, marginTop: 2 }}>
              {alert.distance} м от вас
              {alert.marker?.comment ? ` • ${alert.marker.comment}` : ''}
            </span>
          </div>
          <button
            onClick={() => setAlert(null)}
            style={{
              background: 'rgba(255,255,255,0.2)', border: 'none',
              color: 'white', width: 28, height: 28,
              borderRadius: 8, fontSize: 16, cursor: 'pointer', marginLeft: 4,
            }}
          >×</button>
        </div>
      )}

      {/* Кнопка чата */}
      <button
        onClick={() => setShowChat(true)}
        style={{
          position: 'absolute',
          top: 12,
          right: 115,
          background: 'linear-gradient(135deg, #1d9bf0, #0e71b8)',
          color: 'white',
          border: 'none',
          padding: `${10 * textScale}px ${14 * textScale}px`,
          borderRadius: 12,
          boxShadow: '0 3px 12px rgba(29,155,240,0.4)',
          cursor: 'pointer',
          fontSize: `${18 * textScale}px`,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontWeight: 600,
        }}
        title="Чат"
      >
        💬
      </button>

      <div
        onClick={() => setShowProfile(true)}
        style={{
          position: 'absolute', top: 12, right: 12,
          background: theme.panel, color: theme.text,
          padding: `${10 * textScale}px ${14 * textScale}px`,
          borderRadius: 12,
          boxShadow: `0 3px 12px ${theme.shadow}`,
          cursor: 'pointer', fontSize: `${16 * textScale}px`,
          zIndex: 1000, userSelect: 'none',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <span style={{ fontWeight: 600 }}>Меню</span>
        <span style={{ fontSize: `${20 * textScale}px`, lineHeight: 1 }}>⋮</span>
      </div>

      {me && (
        <div
          style={{
            position: 'absolute', top: 12, left: 12,
            background: nearbyDps > 0
              ? 'linear-gradient(135deg, #e11d48, #be123c)'
              : 'linear-gradient(135deg, #16a34a, #15803d)',
            color: 'white',
            padding: `${10 * textScale}px ${14 * textScale}px`,
            borderRadius: 14,
            boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
            zIndex: 1000, display: 'flex', alignItems: 'center', gap: 8,
            fontSize: `${14 * textScale}px`, fontWeight: 600, userSelect: 'none',
          }}
        >
          <span style={{ fontSize: `${20 * textScale}px` }}>🚓</span>
          <span style={{ fontSize: `${15 * textScale}px` }}>{nearbyDps}</span>
          {settings.alertsEnabled && (
            <span style={{ fontSize: `${14 * textScale}px`, marginLeft: 2 }}>🔔</span>
          )}
        </div>
      )}

      {/* Статистика юзеров */}
      <div
        style={{
          position: 'absolute',
          top: 12, left: 110,
          background: theme.panel,
          color: theme.text,
          padding: `${8 * textScale}px ${12 * textScale}px`,
          borderRadius: 14,
          boxShadow: `0 3px 12px ${theme.shadow}`,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: `${13 * textScale}px`,
          fontWeight: 600,
          userSelect: 'none',
        }}
      >
        <span>👥 {stats.users_total}</span>
        <span style={{ color: '#16a34a' }}>🟢 {stats.users_online}</span>
      </div>

      {settings.speedometerEnabled && mySpeed != null && mySpeed > 15 && (
        <div
          style={{
            position: 'absolute',
            bottom: isMobile ? 160 : 130,
            left: 12,
            zIndex: 1000, display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 6,
            userSelect: 'none',
          }}
        >
          <div
            style={{
              background: speeding
                ? 'linear-gradient(135deg, #dc2626, #991b1b)'
                : 'linear-gradient(135deg, #111827, #1f2937)',
              color: 'white',
              padding: '10px 16px',
              borderRadius: 14,
              boxShadow: speeding
                ? '0 4px 20px rgba(220,38,38,0.6)'
                : '0 4px 14px rgba(0,0,0,0.3)',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              minWidth: 76,
            }}
          >
            <span style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{mySpeed}</span>
            <span style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>км/ч</span>
          </div>

          {speedLimit != null ? (
            <div
              style={{
                background: 'white',
                border: `4px solid ${speeding ? '#dc2626' : '#e11d48'}`,
                width: 54, height: 54,
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: speeding
                  ? '0 4px 20px rgba(220,38,38,0.7)'
                  : '0 4px 14px rgba(0,0,0,0.25)',
                animation: speeding ? 'pulseLimit 1s infinite' : 'none',
              }}
            >
              <span style={{
                fontSize: 22, fontWeight: 800,
                color: speeding ? '#dc2626' : '#111827',
                lineHeight: 1,
              }}>{speedLimit}</span>
            </div>
          ) : (
            <div
              style={{
                background: 'rgba(0,0,0,0.7)',
                color: 'white',
                width: 54, height: 54,
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, textAlign: 'center', padding: 4,
                boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
                lineHeight: 1.1,
              }}
            >
              нет<br/>данных
            </div>
          )}

          {speeding && (
            <div style={{
              background: 'linear-gradient(135deg, #dc2626, #991b1b)',
              color: 'white',
              padding: '4px 10px',
              borderRadius: 8,
              fontSize: 11, fontWeight: 700,
              boxShadow: '0 2px 8px rgba(220,38,38,0.5)',
            }}>
              ПРЕВЫШЕНИЕ
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setShowRoute(true)}
        style={{
          position: 'absolute',
          bottom: isMobile ? 224 : 194,
          right: 12,
          width: 52,
          height: 52,
          borderRadius: '50%',
          border: 'none',
          background: 'linear-gradient(135deg, #16a34a, #15803d)',
          color: 'white',
          cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(22,163,74,0.4)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          fontSize: 24,
        }}
        title="Маршрут"
      >
        🗺
      </button>

      <button
        onClick={goToMe}
        style={{
          position: 'absolute',
          bottom: isMobile ? 160 : 130,
          right: 12,
          width: 52,
          height: 52,
          borderRadius: '50%',
          border: 'none',
          background: 'linear-gradient(135deg, #1d9bf0, #0e71b8)',
          color: 'white',
          cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(29,155,240,0.4)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
        title="Я здесь"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" fill="white" />
          <circle cx="12" cy="12" r="8" />
          <line x1="12" y1="1" x2="12" y2="4" />
          <line x1="12" y1="20" x2="12" y2="23" />
          <line x1="1" y1="12" x2="4" y2="12" />
          <line x1="20" y1="12" x2="23" y2="12" />
        </svg>
      </button>

      {showProfile && (
        <div style={{
          position: 'absolute', top: 0, right: 0, bottom: 0,
          width: 340, maxWidth: '92vw',
          background: theme.panel, color: theme.text,
          boxShadow: `-2px 0 12px ${theme.shadow}`,
          padding: 20, zIndex: 1100,
          display: 'flex', flexDirection: 'column',
          gap: 12, overflowY: 'auto',
          fontSize: `${14 * textScale}px`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <b style={{ fontSize: `${18 * textScale}px` }}>
              {showSettings ? 'Настройки' : (showAdminPanel ? 'Админ' : 'Профиль')}
            </b>
            <button
              onClick={() => { setShowProfile(false); setShowAdminPanel(false); setShowSettings(false); }}
              style={{
                border: 'none', background: theme.card, color: theme.text,
                width: 32, height: 32, borderRadius: 8, fontSize: 18, cursor: 'pointer',
              }}
            >×</button>
          </div>

          {showSettings && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button
                onClick={() => setShowSettings(false)}
                style={{
                  border: 'none', background: 'transparent', color: '#1d9bf0',
                  cursor: 'pointer', fontSize: `${13 * textScale}px`,
                  textAlign: 'left', padding: 0, fontWeight: 500,
                }}
              >← Назад</button>

              <div>
                <div style={{ fontSize: `${12 * textScale}px`, color: theme.textMuted, marginBottom: 4 }}>
                  Тема
                </div>
                <select
                  value={settings.theme}
                  onChange={e => updateSettings({ theme: e.target.value })}
                  style={{
                    width: '100%', padding: 10, borderRadius: 10,
                    border: `1px solid ${theme.inputBorder}`,
                    background: theme.input, color: theme.text,
                    fontSize: `${14 * textScale}px`, outline: 'none',
                  }}
                >
                  <option value="light">Светлая</option>
                  <option value="dark">Тёмная</option>
                </select>
              </div>

              <div>
                <div style={{ fontSize: `${12 * textScale}px`, color: theme.textMuted, marginBottom: 4 }}>
                  Размер текста
                </div>
                <select
                  value={settings.textSize}
                  onChange={e => updateSettings({ textSize: e.target.value })}
                  style={{
                    width: '100%', padding: 10, borderRadius: 10,
                    border: `1px solid ${theme.inputBorder}`,
                    background: theme.input, color: theme.text,
                    fontSize: `${14 * textScale}px`, outline: 'none',
                  }}
                >
                  <option value="small">Мелкий</option>
                  <option value="normal">Обычный</option>
                  <option value="large">Крупный</option>
                  <option value="xlarge">Очень крупный</option>
                </select>
              </div>

              <div>
                <div style={{ fontSize: `${12 * textScale}px`, color: theme.textMuted, marginBottom: 4 }}>
                  Город
                </div>
                <select
                  value={settings.city}
                  onChange={e => goToCity(e.target.value)}
                  style={{
                    width: '100%', padding: 10, borderRadius: 10,
                    border: `1px solid ${theme.inputBorder}`,
                    background: theme.input, color: theme.text,
                    fontSize: `${14 * textScale}px`, outline: 'none',
                  }}
                >
                  <option value="">Моё местоположение</option>
                  {CITIES.map(c => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ fontSize: `${12 * textScale}px`, color: theme.textMuted, marginBottom: 4 }}>
                  Радиус счётчика ДПС
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {RADIUS_OPTIONS.map(r => (
                    <button
                      key={r.km}
                      onClick={() => updateSettings({ dpsRadius: r.km })}
                      style={{
                        flex: 1, minWidth: 60, padding: '8px 10px', borderRadius: 10,
                        border: settings.dpsRadius === r.km
                          ? '2px solid #1d9bf0'
                          : `1px solid ${theme.inputBorder}`,
                        background: settings.dpsRadius === r.km
                          ? 'linear-gradient(135deg, #1d9bf0, #0e71b8)'
                          : theme.input,
                        color: settings.dpsRadius === r.km ? 'white' : theme.text,
                        cursor: 'pointer', fontSize: `${13 * textScale}px`, fontWeight: 600,
                      }}
                    >{r.label}</button>
                  ))}
                </div>
              </div>

              <hr style={{ margin: '6px 0', border: 'none', borderTop: `1px solid ${theme.panelBorder}` }} />

              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: 12, background: theme.card, borderRadius: 12,
                border: `1px solid ${theme.panelBorder}`,
              }}>
                <div>
                  <div style={{ fontSize: `${14 * textScale}px`, fontWeight: 600 }}>
                    ⏱ Спидометр
                  </div>
                  <div style={{ fontSize: `${11 * textScale}px`, color: theme.textMuted, marginTop: 2 }}>
                    С разрешённой скоростью
                  </div>
                </div>
                <div
                  onClick={() => updateSettings({ speedometerEnabled: !settings.speedometerEnabled })}
                  style={{
                    width: 50, height: 28, borderRadius: 14,
                    background: settings.speedometerEnabled
                      ? 'linear-gradient(135deg, #16a34a, #15803d)'
                      : '#9ca3af',
                    cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 3,
                    left: settings.speedometerEnabled ? 25 : 3,
                    width: 22, height: 22, borderRadius: '50%',
                    background: 'white',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    transition: 'left 0.2s',
                  }} />
                </div>
              </div>

              <hr style={{ margin: '6px 0', border: 'none', borderTop: `1px solid ${theme.panelBorder}` }} />

              <b style={{ fontSize: `${15 * textScale}px` }}>🔔 Уведомления</b>

              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: 12, background: theme.card, borderRadius: 12,
                border: `1px solid ${theme.panelBorder}`,
              }}>
                <div>
                  <div style={{ fontSize: `${14 * textScale}px`, fontWeight: 600 }}>
                    Уведомления о ДПС
                  </div>
                  <div style={{ fontSize: `${11 * textScale}px`, color: theme.textMuted, marginTop: 2 }}>
                    Пока приложение открыто
                  </div>
                </div>
                <div
                  onClick={() => updateSettings({ alertsEnabled: !settings.alertsEnabled })}
                  style={{
                    width: 50, height: 28, borderRadius: 14,
                    background: settings.alertsEnabled
                      ? 'linear-gradient(135deg, #16a34a, #15803d)'
                      : '#9ca3af',
                    cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 3,
                    left: settings.alertsEnabled ? 25 : 3,
                    width: 22, height: 22, borderRadius: '50%',
                    background: 'white',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    transition: 'left 0.2s',
                  }} />
                </div>
              </div>

              {settings.alertsEnabled && (
                <>
                  <div>
                    <div style={{ fontSize: `${12 * textScale}px`, color: theme.textMuted, marginBottom: 4 }}>
                      Оповещать при расстоянии
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {ALERT_RADIUS_OPTIONS.map(r => (
                        <button
                          key={r.km}
                          onClick={() => updateSettings({ alertRadius: r.km })}
                          style={{
                            flex: 1, minWidth: 65, padding: '8px 10px', borderRadius: 10,
                            border: settings.alertRadius === r.km
                              ? '2px solid #e11d48'
                              : `1px solid ${theme.inputBorder}`,
                            background: settings.alertRadius === r.km
                              ? 'linear-gradient(135deg, #e11d48, #be123c)'
                              : theme.input,
                            color: settings.alertRadius === r.km ? 'white' : theme.text,
                            cursor: 'pointer', fontSize: `${12 * textScale}px`, fontWeight: 600,
                          }}
                        >{r.label}</button>
                      ))}
                    </div>
                  </div>

                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: 10, background: theme.card, borderRadius: 10,
                    border: `1px solid ${theme.panelBorder}`,
                  }}>
                    <div style={{ fontSize: `${13 * textScale}px`, fontWeight: 500 }}>
                      🔊 Звук
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.alertSound}
                      onChange={e => updateSettings({ alertSound: e.target.checked })}
                      style={{ width: 20, height: 20, cursor: 'pointer' }}
                    />
                  </div>

                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: 10, background: theme.card, borderRadius: 10,
                    border: `1px solid ${theme.panelBorder}`,
                  }}>
                    <div style={{ fontSize: `${13 * textScale}px`, fontWeight: 500 }}>
                      📳 Вибрация
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.alertVibration}
                      onChange={e => updateSettings({ alertVibration: e.target.checked })}
                      style={{ width: 20, height: 20, cursor: 'pointer' }}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {showAdminPanel && isAdmin && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => { setShowAdminPanel(false); setTargetUser(null); setTargetId(''); setSearchError(''); }}
                style={{
                  border: 'none', background: 'transparent', color: '#1d9bf0',
                  cursor: 'pointer', fontSize: `${13 * textScale}px`,
                  textAlign: 'left', padding: 0, fontWeight: 500,
                }}
              >← Назад к профилю</button>

              <b style={{ fontSize: `${15 * textScale}px` }}>Управление по ID</b>

              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  placeholder="Например 1005"
                  value={targetId}
                  onChange={e => setTargetId(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => { if (e.key === 'Enter') findUser(); }}
                  style={{
                    flex: 1, padding: 12, borderRadius: 10,
                    border: `1px solid ${theme.inputBorder}`,
                    background: theme.input, color: theme.text,
                    fontSize: `${14 * textScale}px`, outline: 'none',
                  }}
                />
                <button
                  onClick={findUser}
                  style={{
                    padding: '12px 16px', borderRadius: 12, border: 'none',
                    background: 'linear-gradient(135deg, #111827, #1f2937)',
                    color: 'white', cursor: 'pointer',
                    fontSize: `${14 * textScale}px`, fontWeight: 600,
                  }}
                >Найти</button>
              </div>

              {searchError && <div style={{ color: '#dc2626', fontSize: `${13 * textScale}px` }}>{searchError}</div>}

              {targetUser && (
                <div style={{
                  padding: 14, background: theme.card, borderRadius: 12,
                  border: `1px solid ${theme.panelBorder}`,
                }}>
                  <div style={{ marginBottom: 6, fontSize: `${14 * textScale}px` }}>
                    <b>ID #{targetUser.public_id}</b>
                    {targetUser.name && <> — <AuthorName name={targetUser.name} theme={theme} /></>}
                  </div>
                  <div style={{ fontSize: `${12 * textScale}px`, color: theme.textMuted, marginBottom: 10 }}>
                    {targetUser.is_banned ? '🚫 забанен' : '✅ активен'}
                    {targetUser.is_moderator && ' • 🛡 модератор'}
                    {!targetUser.can_post && ' • ✋ нет права меток'}
                    {targetUser.chat_banned && ' • 🚫 нет права СМС'}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button
                      onClick={() => userAction(targetUser.is_banned ? 'unban' : 'ban')}
                      style={{
                        padding: 10, borderRadius: 10, border: 'none',
                        background: targetUser.is_banned
                          ? 'linear-gradient(135deg, #16a34a, #15803d)'
                          : 'linear-gradient(135deg, #dc2626, #b91c1c)',
                        color: 'white', cursor: 'pointer',
                        fontSize: `${13 * textScale}px`, fontWeight: 600,
                      }}
                    >{targetUser.is_banned ? '✅ Разблокировать' : '🚫 Заблокировать'}</button>

                    <button
                      onClick={() => userAction(targetUser.can_post ? 'deny_post' : 'allow_post')}
                      style={{
                        padding: 10, borderRadius: 10, border: 'none',
                        background: targetUser.can_post
                          ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                          : 'linear-gradient(135deg, #16a34a, #15803d)',
                        color: 'white', cursor: 'pointer',
                        fontSize: `${13 * textScale}px`, fontWeight: 600,
                      }}
                    >{targetUser.can_post ? '✋ Запретить метки' : '✅ Разрешить метки'}</button>

                    <button
                      onClick={() => userAction(targetUser.chat_banned ? 'chat_unban' : 'chat_ban')}
                      style={{
                        padding: 10, borderRadius: 10, border: 'none',
                        background: targetUser.chat_banned
                          ? 'linear-gradient(135deg, #16a34a, #15803d)'
                          : 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                        color: 'white', cursor: 'pointer',
                        fontSize: `${13 * textScale}px`, fontWeight: 600,
                      }}
                    >{targetUser.chat_banned ? '✅ Разрешить СМС' : '🚫 Запретить СМС'}</button>

                    <button
                      onClick={() => userAction(targetUser.is_moderator ? 'remove_moderator' : 'make_moderator')}
                      style={{
                        padding: 10, borderRadius: 10, border: 'none',
                        background: targetUser.is_moderator
                          ? 'linear-gradient(135deg, #6b7280, #4b5563)'
                          : 'linear-gradient(135deg, #1d9bf0, #0e71b8)',
                        color: 'white', cursor: 'pointer',
                        fontSize: `${13 * textScale}px`, fontWeight: 600,
                      }}
                    >{targetUser.is_moderator ? 'Снять модератора' : '🛡 Сделать модератором'}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!showSettings && !showAdminPanel && (
            <>
              {!isInstalled && (
                <button
                  onClick={handleInstallClick}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: 12, borderRadius: 12, border: 'none',
                    background: 'linear-gradient(135deg, #16a34a, #15803d)',
                    color: 'white', cursor: 'pointer',
                    fontSize: `${15 * textScale}px`, fontWeight: 600,
                    boxShadow: '0 3px 10px rgba(22,163,74,0.3)',
                  }}
                >
                  <span style={{ fontSize: `${18 * textScale}px` }}>📲</span> Скачать приложение
                </button>
              )}

              {isInstalled && (
                <div style={{
                  padding: 12,
                  background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)',
                  borderRadius: 12, fontSize: `${13 * textScale}px`,
                  color: '#15803d', fontWeight: 500, textAlign: 'center',
                }}>
                  ✅ Приложение установлено
                </div>
              )}

              <a
                href="https://t.me/policemap"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: 12, borderRadius: 12,
                  background: 'linear-gradient(135deg, #229ED9, #1a7cae)',
                  color: 'white', textDecoration: 'none',
                  fontSize: `${15 * textScale}px`, fontWeight: 600,
                  boxShadow: '0 3px 10px rgba(34,158,217,0.3)',
                }}
              >
                <span style={{ fontSize: `${18 * textScale}px` }}>✈️</span> Мы в Telegram
              </a>

              <div style={{
                padding: 12, background: theme.card, borderRadius: 12,
                border: `1px solid ${theme.panelBorder}`,
              }}>
                Имя: <AuthorName name={profileName} theme={theme} />
                {profileId && (
                  <>
                    <br />
                    <span style={{ fontSize: `${12 * textScale}px`, color: theme.textMuted }}>
                      Ваш ID: <b>#{profileId}</b>
                    </span>
                  </>
                )}
              </div>

              {!isAdmin && !isModerator && (
                <>
                  <input
                    placeholder="Новое имя"
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    style={{
                      padding: 12, borderRadius: 10,
                      border: `1px solid ${theme.inputBorder}`,
                      background: theme.input, color: theme.text,
                      fontSize: `${14 * textScale}px`, outline: 'none',
                    }}
                  />
                  <div style={{ fontSize: `${11 * textScale}px`, color: theme.textMuted, marginTop: -6 }}>
                    Нельзя: админ, администратор, владелец, создатель, модератор
                  </div>
                  <button
                    onClick={saveName}
                    style={{
                      padding: 12, borderRadius: 12, border: 'none',
                      background: 'linear-gradient(135deg, #111827, #1f2937)',
                      color: 'white', cursor: 'pointer',
                      fontSize: `${14 * textScale}px`, fontWeight: 600,
                    }}
                  >Сохранить имя</button>
                </>
              )}

              {(isAdmin || isModerator) && (
                <div style={{
                  padding: 12,
                  background: isAdmin
                    ? 'linear-gradient(135deg, #fef3c7, #fde68a)'
                    : 'linear-gradient(135deg, #dbeafe, #bfdbfe)',
                  borderRadius: 12, fontSize: `${13 * textScale}px`,
                  color: isAdmin ? '#92400e' : '#1e40af', fontWeight: 500,
                }}>
                  Вы вошли как <b>{isAdmin ? 'Администратор' : 'Модератор'}</b>. Имя нельзя изменить.
                </div>
              )}

              <button
                onClick={() => setShowSettings(true)}
                style={{
                  padding: 12, borderRadius: 12,
                  border: `1px solid ${theme.inputBorder}`,
                  background: theme.card, color: theme.text,
                  cursor: 'pointer', fontSize: `${14 * textScale}px`, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                ⚙️ Настройки
              </button>

              <hr style={{ margin: '12px 0', border: 'none', borderTop: `1px solid ${theme.panelBorder}` }} />

              <b style={{ fontSize: `${15 * textScale}px` }}>Админ-панель</b>

              {!isAdmin ? (
                <>
                  <input
                    type="password"
                    placeholder="Пароль"
                    value={adminPass}
                    onChange={e => setAdminPass(e.target.value)}
                    style={{
                      padding: 12, borderRadius: 10,
                      border: `1px solid ${theme.inputBorder}`,
                      background: theme.input, color: theme.text,
                      fontSize: `${14 * textScale}px`, outline: 'none',
                    }}
                  />
                  <button
                    onClick={adminLogin}
                    style={{
                      padding: 12, borderRadius: 12, border: 'none',
                      background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                      color: 'white', cursor: 'pointer',
                      fontSize: `${14 * textScale}px`, fontWeight: 600,
                    }}
                  >Войти как админ</button>
                </>
              ) : (
                <>
                  <div style={{ color: '#16a34a', fontWeight: 600, fontSize: `${13 * textScale}px` }}>
                    ✅ Вы вошли как Администратор
                  </div>

                  <button
                    onClick={() => setShowAdminTickets(true)}
                    style={{
                      padding: 12, borderRadius: 12, border: 'none',
                      background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                      color: 'white', cursor: 'pointer',
                      fontSize: `${14 * textScale}px`, fontWeight: 600,
                      boxShadow: '0 3px 10px rgba(124,58,237,0.3)',
                    }}
                  >🎫 Чаты обращений</button>

                  <button
                    onClick={testAlert}
                    style={{
                      padding: 12, borderRadius: 12, border: 'none',
                      background: 'linear-gradient(135deg, #e11d48, #be123c)',
                      color: 'white', cursor: 'pointer',
                      fontSize: `${14 * textScale}px`, fontWeight: 600,
                      boxShadow: '0 3px 10px rgba(225,29,72,0.3)',
                    }}
                  >🧪 Тест уведомления (рядом ДПС)</button>

                  <button
                    onClick={adminDeleteAll}
                    style={{
                      padding: 12, borderRadius: 12, border: 'none',
                      background: 'linear-gradient(135deg, #dc2626, #991b1b)',
                      color: 'white', cursor: 'pointer',
                      fontSize: `${14 * textScale}px`, fontWeight: 600,
                    }}
                  >🗑 Удалить ВСЕ метки</button>
                  <button
                    onClick={() => setShowAdminPanel(true)}
                    style={{
                      padding: 12, borderRadius: 12, border: 'none',
                      background: 'linear-gradient(135deg, #1d9bf0, #0e71b8)',
                      color: 'white', cursor: 'pointer',
                      fontSize: `${14 * textScale}px`, fontWeight: 600,
                    }}
                  >🔍 Управление по ID</button>
                  <button
                    onClick={adminLogout}
                    style={{
                      padding: 12, borderRadius: 12,
                      border: `1px solid ${theme.inputBorder}`,
                      background: theme.panel, color: theme.text,
                      cursor: 'pointer', fontSize: `${14 * textScale}px`, fontWeight: 500,
                    }}
                  >Выйти из админа</button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {!showRoute && (
      <div style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        padding: '12px 12px',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        background: theme.panel,
        boxShadow: `0 -4px 20px ${theme.shadow}`,
        display: 'flex', gap: 10, justifyContent: 'center',
        zIndex: 1000, flexWrap: 'nowrap',
        overflowX: 'auto', overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
      }}>
        {pendingType ? (
          <>
            <div style={{
              padding: '10px 16px',
              background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
              borderRadius: 14, fontSize: `${13 * textScale}px`,
              alignSelf: 'center', whiteSpace: 'nowrap', flexShrink: 0,
              fontWeight: 600, color: '#92400e',
            }}>
              👆 Тапните по карте
            </div>
            <button
              onClick={() => setPendingType(null)}
              style={{
                padding: '10px 20px', borderRadius: 14, border: 'none',
                background: 'linear-gradient(135deg, #e5e7eb, #d1d5db)',
                cursor: 'pointer', fontSize: `${13 * textScale}px`, fontWeight: 600,
                color: '#374151', whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >Отмена</button>
          </>
        ) : (
          allTypes.map(t => (
            <button
              key={t.key}
              onClick={() => setPendingType(t.key)}
              style={{
                minWidth: 78, padding: '10px 8px 8px',
                borderRadius: 14, border: 'none',
                background: t.bg, color: 'white', cursor: 'pointer',
                fontSize: `${12 * textScale}px`, fontWeight: 600,
                whiteSpace: 'nowrap', flexShrink: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 2,
                boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
              }}
            >
              <span style={{ fontSize: `${22 * textScale}px`, lineHeight: 1 }}>{t.emoji}</span>
              <span style={{ fontSize: `${11 * textScale}px` }}>{t.label}</span>
            </button>
          ))
        )}
      </div>
      )}

      {showRoute && (
        <RoutePanel
          api={api}
          theme={theme}
          textScale={textScale}
          me={me}
          onRouteReady={setRouteData}
          onClose={() => {
            setShowRoute(false);
            setRouteData(null);
          }}
          onStart={() => {
            setShowRoute(false);
          }}
        />
      )}

      {showChat && (
        <ChatPanel
          api={api}
          theme={theme}
          textScale={textScale}
          getDeviceId={getDeviceId}
          profileName={profileName}
          profileId={profileId}
          isAdmin={isAdmin}
          adminPassword={adminPassword}
          isModerator={isModerator}
          onClose={() => setShowChat(false)}
        />
      )}

      {showAdminTickets && (
        <AdminTickets
          api={api}
          theme={theme}
          textScale={textScale}
          getDeviceId={getDeviceId}
          isAdmin={isAdmin}
          isModerator={isModerator}
          adminPassword={adminPassword}
          onClose={() => setShowAdminTickets(false)}
        />
      )}
    </div>
  );
}