import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = '';

export default function AdminTickets({
  api,
  theme,
  textScale,
  getDeviceId,
  isAdmin,
  isModerator,
  adminPassword,
  onClose,
}) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [connected, setConnected] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 700);

  const socketRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    function onResize() {
      setIsMobile(window.innerWidth < 700);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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

  function scrollToBottom() {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' });
  }

  async function loadTickets() {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/tickets', {
        headers: adminPassword
          ? { 'X-Admin-Password': adminPassword }
          : {},
      });
      setTickets(data);
    } catch (e) {
      console.error('loadTickets error', e);
    } finally {
      setLoading(false);
    }
  }

  async function openTicket(id) {
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/admin/tickets/${id}`, {
        headers: adminPassword
          ? { 'X-Admin-Password': adminPassword }
          : {},
      });
      setSelected(data);
      socketRef.current?.emit('ticket:join', id);
      setTimeout(scrollToBottom, 100);
    } catch (e) {
      console.error('openTicket error', e);
    } finally {
      setDetailLoading(false);
    }
  }

  async function closeTicket() {
    if (!selected?.id) return;
    if (!confirm('Закрыть тикет? Пользователь больше не сможет отвечать.')) return;
    try {
      await api.post(`/admin/tickets/${selected.id}/close`, {}, {
        headers: adminPassword
          ? { 'X-Admin-Password': adminPassword }
          : {},
      });
      setSelected({ ...selected, status: 'closed' });
      loadTickets();
    } catch (e) {
      alert('Ошибка закрытия');
    }
  }

  async function deleteTicket() {
    if (!selected?.id) return;
    if (selected.status !== 'closed') {
      alert('Сначала закройте тикет, потом удаляйте');
      return;
    }
    if (!confirm('Удалить чат у себя? Пользователь по-прежнему увидит обращение.')) return;
    try {
      await api.post(`/admin/tickets/${selected.id}/delete`, {}, {
        headers: adminPassword
          ? { 'X-Admin-Password': adminPassword }
          : {},
      });
      setSelectedId(null);
      setSelected(null);
      loadTickets();
    } catch (e) {
      alert('Ошибка удаления');
    }
  }

  function sendReply() {
    const text = replyText.trim();
    if (!text || !selected?.id) return;
    if (!socketRef.current || !connected) return;
    socketRef.current.emit('ticket:send', {
      ticketId: selected.id,
      message: text,
      asAdmin: true,
    });
    setReplyText('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendReply();
    }
  }

  useEffect(() => {
    loadTickets();

    const socket = io(SOCKET_URL, {
      auth: {
        deviceId: getDeviceId(),
        name: isAdmin ? 'Администратор' : 'Модератор',
        isAdmin: isAdmin && adminPassword ? adminPassword : null,
        isModerator,
      },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('ticket:message', (msg) => {
      setSelected((prev) => {
        if (!prev || prev.id !== msg.ticket_id) return prev;
        return { ...prev, messages: [...prev.messages, msg] };
      });
      setTimeout(scrollToBottom, 50);
      loadTickets();
    });

    socket.on('ticket:closed', (id) => {
      setSelected((prev) => prev && prev.id === id ? { ...prev, status: 'closed' } : prev);
      loadTickets();
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const showList = !isMobile || !selectedId;
  const showDetail = !isMobile || selectedId;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      zIndex: 3000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: isMobile ? 0 : 12,
    }}>
      <div style={{
        width: '100%',
        maxWidth: 720,
        height: isMobile ? '100vh' : '88vh',
        maxHeight: 850,
        background: theme.panel,
        color: theme.text,
        borderRadius: isMobile ? 0 : 20,
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
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ fontSize: 22 }}>🎫</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: `${15 * textScale}px` }}>
                Чаты обращений
              </div>
              <div style={{
                fontSize: `${11 * textScale}px`,
                color: theme.textMuted,
              }}>
                {connected ? '🟢 Подключено' : '🔴 Отключено'} • Всего: {tickets.length}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              onClick={loadTickets}
              style={{
                border: 'none',
                background: theme.card,
                color: theme.text,
                padding: '8px 10px',
                borderRadius: 8,
                fontSize: 14,
                cursor: 'pointer',
              }}
              title="Обновить"
            >🔄</button>
            <button
              onClick={onClose}
              style={{
                border: 'none',
                background: theme.card,
                color: theme.text,
                width: 34, height: 34,
                borderRadius: 10,
                fontSize: 18,
                cursor: 'pointer',
              }}
            >×</button>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {showList && (
            <div style={{
              width: isMobile ? '100%' : (selectedId ? 220 : '100%'),
              maxWidth: isMobile ? '100%' : 260,
              borderRight: (!isMobile && selectedId) ? `1px solid ${theme.panelBorder}` : 'none',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              background: theme.bg,
              flexShrink: 0,
            }}>
              {loading && (
                <div style={{
                  padding: 20, textAlign: 'center',
                  color: theme.textMuted, fontSize: `${13 * textScale}px`,
                }}>Загрузка...</div>
              )}

              {!loading && tickets.length === 0 && (
                <div style={{
                  padding: 20, textAlign: 'center',
                  color: theme.textMuted, fontSize: `${13 * textScale}px`,
                }}>Пока нет обращений</div>
              )}

              {tickets.map(t => (
                <div
                  key={t.id}
                  onClick={() => openTicket(t.id)}
                  style={{
                    padding: 12,
                    borderBottom: `1px solid ${theme.panelBorder}`,
                    cursor: 'pointer',
                    background: (!isMobile && selectedId === t.id) ? theme.card : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 4,
                  }}>
                    <b style={{ fontSize: `${13 * textScale}px` }}>
                      {t.user_name || 'Аноним'}
                      {t.user_public_id && (
                        <span style={{
                          fontWeight: 400,
                          color: theme.textMuted,
                          marginLeft: 4,
                        }}>#{t.user_public_id}</span>
                      )}
                    </b>
                    <span style={{ fontSize: 14 }}>
                      {t.status === 'open' ? '🟢' : '✅'}
                    </span>
                  </div>
                  <div style={{
                    fontSize: `${11 * textScale}px`,
                    color: theme.textMuted,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {t.last_message || 'Нет сообщений'}
                  </div>
                  <div style={{
                    fontSize: `${10 * textScale}px`,
                    color: theme.textMuted,
                    marginTop: 3,
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}>
                    <span>{t.last_message_at ? formatTime(t.last_message_at) : formatTime(t.created_at)}</span>
                    <span>💬 {t.messages_count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showDetail && selectedId && (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
              width: isMobile ? '100%' : 'auto',
            }}>
              {detailLoading && (
                <div style={{
                  flex: 1, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  color: theme.textMuted, fontSize: `${13 * textScale}px`,
                }}>Загрузка...</div>
              )}

              {!detailLoading && selected && (
                <>
                  <div style={{
                    padding: '10px 12px',
                    borderBottom: `1px solid ${theme.panelBorder}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    flexShrink: 0,
                  }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontSize: `${13 * textScale}px`,
                        fontWeight: 700,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {selected.user_name || 'Аноним'}
                        {selected.user_public_id && (
                          <span style={{
                            fontWeight: 400,
                            color: theme.textMuted,
                            marginLeft: 4,
                          }}>#{selected.user_public_id}</span>
                        )}
                      </div>
                      <div style={{
                        fontSize: `${10 * textScale}px`,
                        color: theme.textMuted,
                        marginTop: 2,
                      }}>
                        {selected.status === 'open' ? '🟢 Открыт' : '✅ Закрыт'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {selected.status === 'open' ? (
                        <button
                          onClick={closeTicket}
                          style={{
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: 'none',
                            background: 'linear-gradient(135deg, #16a34a, #15803d)',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                          }}
                          title="Закрыть тикет"
                        >✅ Закрыть</button>
                      ) : (
                        <button
                          onClick={deleteTicket}
                          style={{
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: 'none',
                            background: 'linear-gradient(135deg, #dc2626, #991b1b)',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                          }}
                          title="Удалить у себя"
                        >🗑 Удалить</button>
                      )}
                      <button
                        onClick={() => { setSelectedId(null); setSelected(null); }}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 8,
                          border: `1px solid ${theme.inputBorder}`,
                          background: theme.card,
                          color: theme.text,
                          cursor: 'pointer',
                          fontSize: 12,
                          whiteSpace: 'nowrap',
                        }}
                        title="Назад"
                      >←</button>
                    </div>
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
                    {selected.messages?.length === 0 && (
                      <div style={{
                        textAlign: 'center',
                        color: theme.textMuted,
                        padding: 20,
                        fontSize: `${13 * textScale}px`,
                      }}>Пользователь ничего не написал</div>
                    )}

                    {selected.messages?.map((m) => {
                      const isAdminMsg = m.author_is_admin;
                      return (
                        <div key={m.id} style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: isAdminMsg ? 'flex-end' : 'flex-start',
                        }}>
                          <div style={{
                            maxWidth: '85%',
                            padding: '8px 12px',
                            borderRadius: 14,
                            background: isAdminMsg
                              ? 'linear-gradient(135deg, #dc2626, #991b1b)'
                              : theme.card,
                            color: isAdminMsg ? 'white' : theme.text,
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
                    <div ref={endRef} />
                  </div>

                  {selected.status === 'open' ? (
                    <div style={{
                      padding: 10,
                      borderTop: `1px solid ${theme.panelBorder}`,
                      display: 'flex',
                      gap: 6,
                      alignItems: 'flex-end',
                      paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
                      flexShrink: 0,
                    }}>
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ответить пользователю..."
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
                        onClick={sendReply}
                        disabled={!replyText.trim() || !connected}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 12,
                          border: 'none',
                          background: replyText.trim() && connected
                            ? 'linear-gradient(135deg, #dc2626, #991b1b)'
                            : '#9ca3af',
                          color: 'white',
                          cursor: replyText.trim() && connected ? 'pointer' : 'not-allowed',
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
                      textAlign: 'center',
                      fontSize: `${13 * textScale}px`,
                      color: theme.textMuted,
                      flexShrink: 0,
                    }}>
                      ✅ Тикет закрыт
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}