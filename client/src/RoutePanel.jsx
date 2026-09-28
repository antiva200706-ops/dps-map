import { useState } from 'react';
import { Polyline, Marker } from 'react-leaflet';
import L from 'leaflet';

// Маркеры для старта и финиша
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

function formatDistance(m) {
  if (m == null) return '—';
  if (m < 1000) return `${Math.round(m)} м`;
  return `${(m / 1000).toFixed(1)} км`;
}

function formatDuration(sec) {
  if (sec == null) return '—';
  const h = Math.floor(sec / 3600);
  const min = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h} ч ${min} мин`;
  return `${min} мин`;
}

export default function RoutePanel({
  api,
  theme,
  textScale,
  me,
  onRouteReady,
  onClose,
}) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedDest, setSelectedDest] = useState(null);
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  async function searchAddress() {
    if (!query || query.length < 3) return;
    setSearching(true);
    setError('');
    setSuggestions([]);
    setSelectedDest(null);
    setRoute(null);
    onRouteReady(null);
    try {
      const { data } = await api.get('/geocode', { params: { q: query } });
      if (!data.length) {
        setError('Ничего не найдено');
      } else {
        setSuggestions(data);
      }
    } catch (e) {
      setError('Ошибка поиска');
    } finally {
      setSearching(false);
    }
  }

  async function buildRoute(dest) {
    if (!me) {
      setError('Нет вашего местоположения');
      return;
    }
    setLoading(true);
    setError('');
    setSelectedDest(dest);
    setSuggestions([]);
    try {
      const { data } = await api.post('/route', {
        from: { lat: me.lat, lng: me.lng },
        to: { lat: dest.lat, lng: dest.lng },
      });
      setRoute(data);
      onRouteReady({
        polyline: data.polyline,
        from: { lat: me.lat, lng: me.lng },
        to: { lat: dest.lat, lng: dest.lng },
        distance: data.distance,
        duration: data.duration,
      });
    } catch (e) {
      const msg = e.response?.data?.error || 'Ошибка построения маршрута';
      const details = e.response?.data?.details;
      setError(msg);
      console.error('Route error details:', details);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setQuery('');
    setSuggestions([]);
    setSelectedDest(null);
    setRoute(null);
    setError('');
    onRouteReady(null);
  }

  return (
    <>
      {/* Маршрут на карте */}
      {route && route.polyline && (
        <>
          <Polyline
            positions={route.polyline}
            pathOptions={{
              color: '#1d9bf0',
              weight: 6,
              opacity: 0.85,
              lineCap: 'round',
            }}
          />
          {route.from && (
            <Marker position={[route.from.lat, route.from.lng]} icon={START_ICON} />
          )}
          {route.to && (
            <Marker position={[route.to.lat, route.to.lng]} icon={END_ICON} />
          )}
        </>
      )}

      {/* Панель маршрута снизу */}
      <div style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        maxHeight: '70vh',
        overflowY: 'auto',
        background: theme.panel,
        color: theme.text,
        boxShadow: `0 -8px 30px ${theme.shadow}`,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 16,
        paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        zIndex: 1500,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        fontSize: `${14 * textScale}px`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b style={{ fontSize: `${17 * textScale}px` }}>🗺 Маршрут</b>
          <button
            onClick={onClose}
            style={{
              border: 'none', background: theme.card, color: theme.text,
              width: 32, height: 32, borderRadius: 8,
              fontSize: 18, cursor: 'pointer',
            }}
          >×</button>
        </div>

        {/* Откуда */}
        <div>
          <div style={{ fontSize: `${11 * textScale}px`, color: theme.textMuted, marginBottom: 4 }}>
            Откуда
          </div>
          <div style={{
            padding: 10, borderRadius: 10,
            background: theme.card,
            border: `1px solid ${theme.panelBorder}`,
            fontSize: `${13 * textScale}px`,
          }}>
            📍 {me ? 'Моё местоположение' : 'Не определено'}
          </div>
        </div>

        {/* Куда */}
        <div>
          <div style={{ fontSize: `${11 * textScale}px`, color: theme.textMuted, marginBottom: 4 }}>
            Куда
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              placeholder="Введите адрес..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') searchAddress(); }}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 10,
                border: `1px solid ${theme.inputBorder}`,
                background: theme.input,
                color: theme.text,
                fontSize: `${14 * textScale}px`,
                outline: 'none',
              }}
            />
            <button
              onClick={searchAddress}
              disabled={searching}
              style={{
                padding: '12px 16px',
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg, #1d9bf0, #0e71b8)',
                color: 'white',
                cursor: searching ? 'wait' : 'pointer',
                fontSize: `${14 * textScale}px`,
                fontWeight: 600,
                opacity: searching ? 0.6 : 1,
              }}
            >
              {searching ? '...' : '🔍'}
            </button>
          </div>
        </div>

        {/* Ошибка */}
        {error && (
          <div style={{
            padding: 10,
            background: 'linear-gradient(135deg, #fee2e2, #fecaca)',
            borderRadius: 10,
            color: '#991b1b',
            fontSize: `${13 * textScale}px`,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Список результатов */}
        {suggestions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: `${11 * textScale}px`, color: theme.textMuted }}>
              Выберите адрес:
            </div>
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => buildRoute(s)}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: `1px solid ${theme.panelBorder}`,
                  background: theme.card,
                  color: theme.text,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: `${13 * textScale}px`,
                  lineHeight: 1.3,
                }}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {/* Загрузка */}
        {loading && (
          <div style={{
            padding: 14, textAlign: 'center',
            fontSize: `${13 * textScale}px`,
            color: theme.textMuted,
          }}>
            Строю маршрут...
          </div>
        )}

        {/* Информация о маршруте */}
        {route && (
          <div style={{
            padding: 14,
            background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)',
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            <div style={{
              fontSize: `${15 * textScale}px`,
              fontWeight: 700,
              color: '#1e40af',
              textAlign: 'center',
            }}>
              ✅ Маршрут построен
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-around',
              color: '#1e40af',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: `${11 * textScale}px`, opacity: 0.8 }}>Расстояние</div>
                <div style={{ fontSize: `${17 * textScale}px`, fontWeight: 700 }}>
                  {formatDistance(route.distance)}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: `${11 * textScale}px`, opacity: 0.8 }}>Время</div>
                <div style={{ fontSize: `${17 * textScale}px`, fontWeight: 700 }}>
                  {formatDuration(route.duration)}
                </div>
              </div>
              {route.distance && route.duration && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: `${11 * textScale}px`, opacity: 0.8 }}>Ср. скорость</div>
                  <div style={{ fontSize: `${17 * textScale}px`, fontWeight: 700 }}>
                    {Math.round((route.distance / 1000) / (route.duration / 3600))} км/ч
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {route && (
          <button
            onClick={reset}
            style={{
              padding: 12,
              borderRadius: 12,
              border: `1px solid ${theme.inputBorder}`,
              background: theme.card,
              color: theme.text,
              cursor: 'pointer',
              fontSize: `${14 * textScale}px`,
              fontWeight: 600,
            }}
          >
            🔄 Сбросить маршрут
          </button>
        )}
      </div>
    </>
  );
}