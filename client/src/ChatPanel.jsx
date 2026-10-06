import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = ''; // тот же домен что и сайт

export default function ChatPanel({
  api,
  theme,
  textScale,
  getDeviceId,
  profileName,
  profileId,
  isAdmin,
  adminPassword,
  isModerator,
  onClose,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const socketRef = useRef(null);
  const scrollRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Автоскролл вниз
  function scrollToBottom() {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }

  // Формат времени — Калининград (UTC+2)
  function formatTime(iso) {
    const date = new Date(iso);
    // Калининград = UTC+2
    const kal = new Date(date.getTime() + 2 * 60 * 60 * 1000 - date.getTimezoneOffset() * 60 * 1000);

    const now = new Date();
    const isToday = kal.toDateString() === now.toDateString();

    const HH = String(kal.getUTCHours()).padStart(2, '0');
    const MM = String(kal.getUTCMinutes()).padStart(2, '0');

    if (isToday) return `Сегодня ${HH}:${MM}`;

    const DD = String(kal.getUTCDate()).padStart(2, '0');
    const MO = String(kal.getUTCMonth() + 1).padStart(2, '0');
    return `${DD}.${MO} ${HH}:${MM}`;
  }

  // Загрузка истории + подключение Socket.IO
  useEffect(() => {
    let cancelled = false;

    async function init() {
      // 1. Загрузить историю
      try {
        const { data } = await api.get('/chat/history');
        if (!cancelled) setMessages(data);
      } catch (e) {
        console.error('history error', e);
      } finally {
        if (!cancelled) setLoading(false);
      }

      // 2. Подключить сокет
      const socket = io(SOCKET_URL, {
        auth: {
          deviceId: getDeviceId(),
          name: profileName,
          publicId: profileId,
        },
        transports: ['websocket', 'polling'],
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        if (!cancelled) setConnected(true);
      });

      socket.on('disconnect', () => {
        if (!cancelled) setConnected(false);
      });

      socket.on('chat:message', (msg) => {
        if (cancelled) return;
        setMessages((prev) => [...prev, msg]);
        setTimeout(scrollToBottom, 50);
      });

      socket.on('chat:deleted', (id) => {
        if (cancelled) return;
        setMessages((prev) => prev.filter((m) => m.id !== id));
      });

      socket.on('chat:online', ({ count }) => {
        if (cancelled) return;
        setOnlineCount(count);
      });

      socket.on('chat:error', ({ error }) => {
        if (cancelled) return;
        setError(error);
        setTimeout(() => setError(''), 3000);
      });
    }

    init();

    return () => {
      cancelled = true;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  // Скролл вниз при загрузке истории
  useEffect(() => {
    if (!loading && messages.length > 0) {
      setTimeout(scrollToBottom, 100);
    }
  }, [loading]);

  // Отправка
  function sendMessage() {
    const text = input.trim();
    if (!text) return;
    if (!socketRef.current || !connected) {
      setError('Нет соединения');
      return;
    }
    socketRef.current.emit('chat:send', { message: text });
    setInput('');
  }

  // Удаление сообщения (админ/модератор)
  async function deleteMessage(id) {
    if (!confirm('Удалить сообщение?')) return;
    try {
      await api.post(`/chat/delete/${id}`, {}, {
        headers: isAdmin && adminPassword
          ? { 'X-Admin-Password': adminPassword }
          : {},
      });
    } catch (e) {
      alert('Ошибка удаления');
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const canModerate = isAdmin || isModerator;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      zIndex: 3000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 12,
    }}>
      <div style={{
        width: '100%',
        maxWidth: 560,
        height: '85vh',
        maxHeight: 800,
        background: theme.panel,
        color: theme.text,
        borderRadius: 20,
        boxShadow: `0 20px 60px ${theme.shadow}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontSize: `${14 * textScale}px`,
      }}>
        {/* Шапка */}
        <div style={{
          padding: '14px 16px',
          borderBottom: `1px solid ${theme.panelBorder}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ fontSize: 22 }}>💬</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: `${15 * textScale}px` }}>
                Общий чат
              </div>
              <div style={{
                fontSize: `${11 * textScale}px`,
                color: theme.textMuted,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <span style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: connected ? '#16a34a' : '#dc2626',
                }} />
                {connected ? 'Подключено' : 'Отключено'}
                {onlineCount > 0 && (
                  <> • 👥 {onlineCount} в чате</>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: theme.card,
              color: theme.text,
              width: 36, height: 36,
              borderRadius: 10,
              fontSize: 20,
              cursor: 'pointer',
            }}
          >×</button>
        </div>

        {/* Сообщения */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            background: theme.bg,
          }}
        >
          {loading && (
            <div style={{
              textAlign: 'center',
              color: theme.textMuted,
              padding: 20,
              fontSize: `${13 * textScale}px`,
            }}>
              Загрузка истории...
            </div>
          )}

          {!loading && messages.length === 0 && (
            <div style={{
              textAlign: 'center',
              color: theme.textMuted,
              padding: 20,
              fontSize: `${13 * textScale}px`,
            }}>
              Пока сообщений нет. Будь первым!
            </div>
          )}

          {messages.map((m) => {
            const isMine = m.author_public_id === profileId;
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isMine ? 'flex-end' : 'flex-start',
                }}
              >
                <div style={{
                  maxWidth: '85%',
                  padding: '8px 12px',
                  borderRadius: 14,
                  background: isMine
                    ? 'linear-gradient(135deg, #1d9bf0, #0e71b8)'
                    : theme.card,
                  color: isMine ? 'white' : theme.text,
                  position: 'relative',
                  wordBreak: 'break-word',
                }}>
                  {!isMine && (
                    <div style={{
                      fontSize: `${11 * textScale}px`,
                      fontWeight: 700,
                      marginBottom: 3,
                      color: theme.textMuted,
                    }}>
                      {m.author_name || 'Аноним'}
                      {isAdmin && m.author_public_id && (
                        <span style={{ fontWeight: 400, marginLeft: 6 }}>
                          #{m.author_public_id}
                        </span>
                      )}
                    </div>
                  )}
                  <div style={{ fontSize: `${14 * textScale}px`, whiteSpace: 'pre-wrap' }}>
                    {m.message}
                  </div>
                  <div style={{
                    fontSize: `${10 * textScale}px`,
                    opacity: 0.75,
                    marginTop: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 6,
                  }}>
                    {canModerate && (
                      <button
                        onClick={() => deleteMessage(m.id)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: isMine ? 'white' : '#dc2626',
                          cursor: 'pointer',
                          fontSize: 12,
                          padding: 0,
                          opacity: 0.8,
                        }}
                        title="Удалить"
                      >🗑</button>
                    )}
                    <span>{formatTime(m.created_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Ошибка */}
        {error && (
          <div style={{
            padding: '8px 14px',
            background: 'linear-gradient(135deg, #fee2e2, #fecaca)',
            color: '#991b1b',
            fontSize: `${12 * textScale}px`,
            textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {/* Поле ввода */}
        <div style={{
          padding: 12,
          borderTop: `1px solid ${theme.panelBorder}`,
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Написать сообщение..."
            rows={1}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 12,
              border: `1px solid ${theme.inputBorder}`,
              background: theme.input,
              color: theme.text,
              fontSize: `${14 * textScale}px`,
              resize: 'none',
              outline: 'none',
              fontFamily: 'inherit',
              maxHeight: 100,
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || !connected}
            style={{
              padding: '12px 16px',
              borderRadius: 12,
              border: 'none',
              background: input.trim() && connected
                ? 'linear-gradient(135deg, #1d9bf0, #0e71b8)'
                : '#9ca3af',
              color: 'white',
              cursor: input.trim() && connected ? 'pointer' : 'not-allowed',
              fontSize: 18,
              fontWeight: 600,
            }}
          >➤</button>
        </div>
      </div>
    </div>
  );
}