import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = '';

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
  const [tab, setTab] = useState('general');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [ticket, setTicket] = useState(null);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketInput, setTicketInput] = useState('');
  const [creatingTicket, setCreatingTicket] = useState(false);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const ticketEndRef = useRef(null);

  function scrollToBottom(ref) {
    if (ref?.current) {
      ref.current.scrollIntoView({ behavior: 'smooth' });
    }
  }

  function formatTime(iso) {
    const date = new Date(iso);
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

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const { data } = await api.get('/chat/history');
        if (!cancelled) setMessages(data);
      } catch (e) {
        console.error('history error', e);
      } finally {
        if (!cancelled) setLoading(false);
      }

      const socket = io(SOCKET_URL, {
        auth: {
          deviceId: getDeviceId(),
          name: profileName,
          publicId: profileId,
          isAdmin: isAdmin && adminPassword ? adminPassword : null,
          isModerator,
        },
        transports: ['websocket', 'polling'],
      });

      socketRef.current = socket;

      socket.on('connect', () => { if (!cancelled) setConnected(true); });
      socket.on('disconnect', () => { if (!cancelled) setConnected(false); });

      socket.on('chat:message', (msg) => {
        if (cancelled) return;
        setMessages((prev) => [...prev, msg]);
        setTimeout(() => scrollToBottom(messagesEndRef), 50);
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

      socket.on('ticket:message', (msg) => {
        if (cancelled) return;
        setTicket((prev) => {
          if (!prev || prev.id !== msg.ticket_id) return prev;
          return { ...prev, messages: [...prev.messages, msg] };
        });
        setTimeout(() => scrollToBottom(ticketEndRef), 50);
      });

      socket.on('ticket:closed', (id) => {
        if (cancelled) return;
        setTicket((prev) => {
          if (!prev || prev.id !== id) return prev;
          return { ...prev, status: 'closed' };
        });
      });

      socket.on('ticket:error', ({ error }) => {
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

  useEffect(() => {
    if (!loading && messages.length > 0 && tab === 'general') {
      setTimeout(() => scrollToBottom(messagesEndRef), 100);
    }
  }, [loading]);

  async function loadTicket() {
    setTicketLoading(true);
    try {
      const { data } = await api.get('/tickets/my');
      setTicket(data);
      if (data?.id) {
        socketRef.current?.emit('ticket:join', data.id);
      }
    } catch (e) {
      console.error('loadTicket error', e);
    } finally {
      setTicketLoading(false);
    }
  }

  async function createNewTicket() {
    setCreatingTicket(true);
    try {
      const { data } = await api.post('/tickets/open');
      await loadTicket();
      if (data?.id) {
        socketRef.current?.emit('ticket:join', data.id);
      }
    } catch (e) {
      setError('Не удалось открыть обращение');
      setTimeout(() => setError(''), 3000);
    } finally {
      setCreatingTicket(false);
    }
  }

  function sendGeneral() {
    const text = input.trim();
    if (!text) return;
    if (!socketRef.current || !connected) {
      setError('Нет соединения');
      return;
    }
    socketRef.current.emit('chat:send', { message: text });
    setInput('');
  }

  function sendTicket() {
    const text = ticketInput.trim();
    if (!text || !ticket?.id) return;
    if (!socketRef.current || !connected) {
      setError('Нет соединения');
      return;
    }
    if (ticket.status === 'closed') {
      setError('Обращение закрыто. Откройте новое.');
      return;
    }
    socketRef.current.emit('ticket:send', {
      ticketId: ticket.id,
      message: text,
    });
    setTicketInput('');
  }

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

  function handleKeyDown(e, sendFn) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendFn();
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
      padding: 8,
    }}>
      <div style={{
        width: '100%',
        maxWidth: 560,
        height: '92vh',
        maxHeight: 850,
        background: theme.panel,
        color: theme.text,
        borderRadius: 20,
        boxShadow: `0 20px 60px ${theme.shadow}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontSize: `${14 * textScale}px`,
      }}>
        <div style={{
          padding: '12px 14px',
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
                {tab === 'general' ? 'Общий чат' : 'Связь с админом'}
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
                {tab === 'general' && onlineCount > 0 && (
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
              flexShrink: 0,
            }}
          >×</button>
        </div>

        <div style={{
          display: 'flex',
          padding: '8px 10px',
          gap: 6,
          borderBottom: `1px solid ${theme.panelBorder}`,
        }}>
          <button
            onClick={() => setTab('general')}
            style={{
              flex: 1,
              padding: '10px 8px',
              border: 'none',
              borderRadius: 10,
              background: tab === 'general'
                ? 'linear-gradient(135deg, #1d9bf0, #0e71b8)'
                : theme.card,
              color: tab === 'general' ? 'white' : theme.text,
              cursor: 'pointer',
              fontSize: `${12 * textScale}px`,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >💬 Общий</button>
          <button
            onClick={() => {
              setTab('ticket');
              if (!ticket) loadTicket();
            }}
            style={{
              flex: 1,
              padding: '10px 8px',
              border: 'none',
              borderRadius: 10,
              background: tab === 'ticket'
                ? 'linear-gradient(135deg, #16a34a, #15803d)'
                : theme.card,
              color: tab === 'ticket' ? 'white' : theme.text,
              cursor: 'pointer',
              fontSize: `${12 * textScale}px`,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >🛡 Админ</button>
        </div>

        {tab === 'general' && (
          <>
            <div style={{
              flex: 1,
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              background: theme.bg,
            }}>
              {loading && (
                <div style={{
                  textAlign: 'center',
                  color: theme.textMuted,
                  padding: 20,
                  fontSize: `${13 * textScale}px`,
                }}>Загрузка...</div>
              )}

              {!loading && messages.length === 0 && (
                <div style={{
                  textAlign: 'center',
                  color: theme.textMuted,
                  padding: 20,
                  fontSize: `${13 * textScale}px`,
                }}>Пока сообщений нет. Будь первым!</div>
              )}

              {messages.map((m) => {
                const isMine = m.author_public_id === profileId;
                return (
                  <div key={m.id} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isMine ? 'flex-end' : 'flex-start',
                  }}>
                    <div style={{
                      maxWidth: '85%',
                      padding: '8px 12px',
                      borderRadius: 14,
                      background: isMine
                        ? 'linear-gradient(135deg, #1d9bf0, #0e71b8)'
                        : theme.card,
                      color: isMine ? 'white' : theme.text,
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

            <div style={{
              padding: 10,
              borderTop: `1px solid ${theme.panelBorder}`,
              display: 'flex',
              gap: 6,
              alignItems: 'flex-end',
              paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
            }}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, sendGeneral)}
                placeholder="Написать сообщение..."
                rows={1}
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 12,
                  border: `1px solid ${theme.inputBorder}`,
                  background: theme.input,
                  color: theme.text,
                  fontSize: `${14 * textScale}px`,
                  resize: 'none',
                  outline: 'none',
                  fontFamily: 'inherit',
                  maxHeight: 90,
                  minWidth: 0,
                }}
              />
              <button
                onClick={sendGeneral}
                disabled={!input.trim() || !connected}
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: 'none',
                  background: input.trim() && connected
                    ? 'linear-gradient(135deg, #1d9bf0, #0e71b8)'
                    : '#9ca3af',
                  color: 'white',
                  cursor: input.trim() && connected ? 'pointer' : 'not-allowed',
                  fontSize: 18,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >➤</button>
            </div>
          </>
        )}

        {tab === 'ticket' && (
          <>
            {ticketLoading && (
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: theme.textMuted,
                fontSize: `${13 * textScale}px`,
              }}>Загрузка...</div>
            )}

            {!ticketLoading && !ticket && (
              <div style={{
                flex: 1,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 48 }}>🛡</div>
                <div style={{ fontSize: `${15 * textScale}px`, fontWeight: 600 }}>
                  Связь с администрацией
                </div>
                <div style={{ fontSize: `${13 * textScale}px`, color: theme.textMuted, maxWidth: 300 }}>
                  Здесь вы можете написать админу. Обращение увидят только администраторы.
                </div>
                <button
                  onClick={createNewTicket}
                  disabled={creatingTicket}
                  style={{
                    padding: '12px 24px',
                    borderRadius: 12,
                    border: 'none',
                    background: 'linear-gradient(135deg, #16a34a, #15803d)',
                    color: 'white',
                    cursor: creatingTicket ? 'wait' : 'pointer',
                    fontSize: `${14 * textScale}px`,
                    fontWeight: 700,
                    opacity: creatingTicket ? 0.7 : 1,
                  }}
                >✍️ Написать админу</button>
              </div>
            )}

            {!ticketLoading && ticket && (
              <>
                <div style={{
                  padding: '10px 14px',
                  background: ticket.status === 'closed'
                    ? 'linear-gradient(135deg, #fef3c7, #fde68a)'
                    : 'linear-gradient(135deg, #dbeafe, #bfdbfe)',
                  fontSize: `${12 * textScale}px`,
                  fontWeight: 600,
                  color: ticket.status === 'closed' ? '#92400e' : '#1e40af',
                  textAlign: 'center',
                }}>
                  {ticket.status === 'closed'
                    ? '✅ Обращение успешно закрыто'
                    : '🟢 Обращение открыто • Админ ответит при первой возможности'}
                </div>

                <div style={{
                  flex: 1,
                  overflowY: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  background: theme.bg,
                }}>
                  {ticket.messages?.length === 0 && (
                    <div style={{
                      textAlign: 'center',
                      color: theme.textMuted,
                      padding: 20,
                      fontSize: `${13 * textScale}px`,
                    }}>Напишите первое сообщение админу.</div>
                  )}

                  {ticket.messages?.map((m) => {
                    const isAdminMsg = m.author_is_admin;
                    const alignRight = !isAdminMsg;
                    return (
                      <div key={m.id} style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: alignRight ? 'flex-end' : 'flex-start',
                      }}>
                        <div style={{
                          maxWidth: '85%',
                          padding: '8px 12px',
                          borderRadius: 14,
                          background: isAdminMsg
                            ? 'linear-gradient(135deg, #dc2626, #991b1b)'
                            : 'linear-gradient(135deg, #1d9bf0, #0e71b8)',
                          color: 'white',
                          wordBreak: 'break-word',
                        }}>
                          <div style={{
                            fontSize: `${11 * textScale}px`,
                            fontWeight: 700,
                            marginBottom: 3,
                            opacity: 0.9,
                          }}>
                            {isAdminMsg ? '🛡 ' : ''}{m.author_name || 'Аноним'}
                          </div>
                          <div style={{ fontSize: `${14 * textScale}px`, whiteSpace: 'pre-wrap' }}>
                            {m.message}
                          </div>
                          <div style={{
                            fontSize: `${10 * textScale}px`,
                            opacity: 0.75,
                            marginTop: 4,
                            textAlign: 'right',
                          }}>
                            {formatTime(m.created_at)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={ticketEndRef} />
                </div>

                {ticket.status === 'open' ? (
                  <div style={{
                    padding: 10,
                    borderTop: `1px solid ${theme.panelBorder}`,
                    display: 'flex',
                    gap: 6,
                    alignItems: 'flex-end',
                    paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
                  }}>
                    <textarea
                      value={ticketInput}
                      onChange={(e) => setTicketInput(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, sendTicket)}
                      placeholder="Написать админу..."
                      rows={1}
                      style={{
                        flex: 1,
                        padding: 10,
                        borderRadius: 12,
                        border: `1px solid ${theme.inputBorder}`,
                        background: theme.input,
                        color: theme.text,
                        fontSize: `${14 * textScale}px`,
                        resize: 'none',
                        outline: 'none',
                        fontFamily: 'inherit',
                        maxHeight: 90,
                        minWidth: 0,
                      }}
                    />
                    <button
                      onClick={sendTicket}
                      disabled={!ticketInput.trim() || !connected}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 12,
                        border: 'none',
                        background: ticketInput.trim() && connected
                          ? 'linear-gradient(135deg, #16a34a, #15803d)'
                          : '#9ca3af',
                        color: 'white',
                        cursor: ticketInput.trim() && connected ? 'pointer' : 'not-allowed',
                        fontSize: 18,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >➤</button>
                  </div>
                ) : (
                  <div style={{
                    padding: 14,
                    borderTop: `1px solid ${theme.panelBorder}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    alignItems: 'center',
                    paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
                  }}>
                    <div style={{
                      fontSize: `${12 * textScale}px`,
                      color: theme.textMuted,
                      textAlign: 'center',
                    }}>
                      Обращение закрыто
                    </div>
                    <button
                      onClick={createNewTicket}
                      disabled={creatingTicket}
                      style={{
                        padding: '12px 20px',
                        borderRadius: 12,
                        border: 'none',
                        background: 'linear-gradient(135deg, #16a34a, #15803d)',
                        color: 'white',
                        cursor: creatingTicket ? 'wait' : 'pointer',
                        fontSize: `${14 * textScale}px`,
                        fontWeight: 700,
                        opacity: creatingTicket ? 0.7 : 1,
                        width: '100%',
                        maxWidth: 300,
                      }}
                    >📩 Открыть новое обращение</button>
                  </div>
                )}
              </>
            )}
          </>
        )}

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
      </div>
    </div>
  );
}