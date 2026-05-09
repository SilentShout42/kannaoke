import { useState, useEffect } from 'react';
import { IconX, IconPlus, IconTrash, IconBrandDiscord, IconLoader2 } from '@tabler/icons-react';

interface User {
  discordId: string;
  username: string;
  avatar: string | null;
}

interface Webhook {
  id: string;
  webhook_url: string;
  label: string | null;
  schedule_hour: number;
  schedule_minute: number;
  timezone: string;
  active: number;
}

interface WebhookModalProps {
  onClose: () => void;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Kannaoke-CSRF': '1',
      ...(init?.headers ?? {}),
    },
  });
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatSchedule(hour: number, minute: number, timezone: string): string {
  try {
    const now = new Date();
    now.setUTCHours(hour, minute, 0, 0);
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
      hour12: true,
    }).format(now);
  } catch {
    return `${pad(hour)}:${pad(minute)}`;
  }
}

export default function WebhookModal({ onClose }: WebhookModalProps) {
  const [user, setUser] = useState<User | null | 'loading'>('loading');
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    webhookUrl: '',
    label: '',
    scheduleHour: 9,
    scheduleMinute: 0,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  useEffect(() => {
    fetch('/api/me', { headers: { 'X-Kannaoke-CSRF': '1' } })
      .then(r => r.ok ? r.json<User>() : null)
      .then(data => {
        setUser(data);
        if (data) {
          apiFetch('/api/webhooks').then(r => r.json<Webhook[]>()).then(setWebhooks);
        }
      })
      .catch(() => setUser(null));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/webhooks', {
        method: 'POST',
        body: JSON.stringify({
          webhookUrl: form.webhookUrl,
          label: form.label.trim() || null,
          scheduleHour: form.scheduleHour,
          scheduleMinute: form.scheduleMinute,
          timezone: form.timezone,
        }),
      });
      if (!res.ok) {
        const data = await res.json<{ error: string }>();
        setError(data.error ?? 'Something went wrong');
        return;
      }
      const created = await res.json<Webhook>();
      setWebhooks(prev => [...prev, created]);
      setShowForm(false);
      setForm(f => ({ ...f, webhookUrl: '', label: '' }));
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await apiFetch(`/api/webhooks/${id}`, { method: 'DELETE' });
    if (res.ok) setWebhooks(prev => prev.filter(w => w.id !== id));
  }

  async function handleLogout() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setWebhooks([]);
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-panel" role="dialog" aria-modal="true" aria-label="Webhook scheduler">
        <div className="modal-header">
          <span className="modal-title">Daily Song Webhooks</span>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <IconX size={20} />
          </button>
        </div>

        <div className="modal-body">
          {user === 'loading' && (
            <div className="modal-loading"><IconLoader2 size={24} className="spin" /></div>
          )}

          {user === null && (
            <div className="modal-sign-in">
              <p className="modal-sign-in-desc">
                Sign in with Discord to schedule daily random song posts to any channel via webhook.
              </p>
              <a href="/api/auth/discord" className="discord-sign-in-btn">
                <IconBrandDiscord size={20} />
                Sign in with Discord
              </a>
            </div>
          )}

          {user && user !== 'loading' && (
            <>
              <div className="modal-user-row">
                {user.avatar && (
                  <img
                    className="modal-avatar"
                    src={`https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png?size=32`}
                    alt=""
                    width={24}
                    height={24}
                  />
                )}
                <span className="modal-username">{user.username}</span>
                <button className="modal-logout-btn" onClick={handleLogout}>Sign out</button>
              </div>

              <div className="webhook-list">
                {webhooks.length === 0 && !showForm && (
                  <p className="webhook-empty">No webhooks yet. Add one below.</p>
                )}
                {webhooks.map(wh => (
                  <div key={wh.id} className="webhook-item">
                    <div className="webhook-item-info">
                      <span className="webhook-item-label">{wh.label ?? wh.webhook_url}</span>
                      <span className="webhook-item-schedule">
                        {formatSchedule(wh.schedule_hour, wh.schedule_minute, wh.timezone)} daily
                      </span>
                    </div>
                    <button
                      className="webhook-delete-btn"
                      onClick={() => handleDelete(wh.id)}
                      aria-label="Delete webhook"
                      title="Delete webhook"
                    >
                      <IconTrash size={16} />
                    </button>
                  </div>
                ))}
              </div>

              {webhooks.length < 10 && !showForm && (
                <button className="webhook-add-btn" onClick={() => setShowForm(true)}>
                  <IconPlus size={16} />
                  Add webhook
                </button>
              )}

              {showForm && (
                <form className="webhook-form" onSubmit={handleCreate}>
                  <label className="webhook-form-label">
                    Webhook URL
                    <input
                      className="webhook-form-input"
                      type="url"
                      placeholder="https://discord.com/api/webhooks/…"
                      value={form.webhookUrl}
                      onChange={e => setForm(f => ({ ...f, webhookUrl: e.target.value }))}
                      required
                    />
                  </label>
                  <label className="webhook-form-label">
                    Label <span className="webhook-form-optional">(optional)</span>
                    <input
                      className="webhook-form-input"
                      type="text"
                      placeholder="e.g. #music"
                      value={form.label}
                      onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                      maxLength={80}
                    />
                  </label>
                  <div className="webhook-form-row">
                    <label className="webhook-form-label">
                      Hour
                      <select
                        className="webhook-form-select"
                        value={form.scheduleHour}
                        onChange={e => setForm(f => ({ ...f, scheduleHour: Number(e.target.value) }))}
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>{pad(i)}</option>
                        ))}
                      </select>
                    </label>
                    <label className="webhook-form-label">
                      Minute
                      <select
                        className="webhook-form-select"
                        value={form.scheduleMinute}
                        onChange={e => setForm(f => ({ ...f, scheduleMinute: Number(e.target.value) }))}
                      >
                        {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                          <option key={m} value={m}>{pad(m)}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="webhook-form-label">
                    Timezone
                    <input
                      className="webhook-form-input"
                      type="text"
                      value={form.timezone}
                      onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}
                      required
                    />
                  </label>
                  {error && <p className="webhook-form-error">{error}</p>}
                  <div className="webhook-form-actions">
                    <button type="button" className="webhook-cancel-btn" onClick={() => { setShowForm(false); setError(null); }}>
                      Cancel
                    </button>
                    <button type="submit" className="webhook-submit-btn" disabled={submitting}>
                      {submitting ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
