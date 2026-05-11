'use client';

import { useMemo, useState } from 'react';
import type { SmsTemplate } from '@/lib/sms/templates';

interface Props {
  initialTemplates: SmsTemplate[];
  canEdit: boolean;
}

type AudienceFilter = 'all' | 'driver' | 'rider' | 'admin' | 'any';

interface Draft {
  body: string;
  enabled: boolean;
}

function toDraft(t: SmsTemplate): Draft {
  return { body: t.body, enabled: t.enabled };
}

// Sample values used in the preview pane. Variables that don't appear here
// just render as the placeholder name so admins can see where the slot is.
const SAMPLE_VARS: Record<string, string> = {
  riderName: 'Marcus',
  driverName: 'Tasha',
  rideId: 'r_demo123',
  price: '18',
  priceLine: ' $18.',
  destLine: ' Edgewood.',
  timeLine: ' 8:30pm.',
  text: 'Your payout is on the way',
  link: 'atl.hmucashride.com/driver/home',
};

function preview(body: string, variables: string[]): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    if (!variables.includes(name)) return `{{${name}}}`;
    return SAMPLE_VARS[name] ?? `<${name}>`;
  });
}

const AUDIENCE_LABEL: Record<SmsTemplate['audience'], { label: string; color: string }> = {
  driver: { label: 'DRIVER', color: '#448AFF' },
  rider: { label: 'RIDER', color: '#00E676' },
  admin: { label: 'ADMIN', color: '#FFB300' },
  any: { label: 'ANY', color: 'var(--admin-text-muted)' },
};

export default function SmsTemplatesClient({ initialTemplates, canEdit }: Props) {
  const [templates, setTemplates] = useState<SmsTemplate[]>(initialTemplates);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(
    Object.fromEntries(initialTemplates.map(t => [t.event_key, toDraft(t)])),
  );
  const [audience, setAudience] = useState<AudienceFilter>('all');
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const visible = useMemo(
    () => templates.filter(t => audience === 'all' || t.audience === audience),
    [templates, audience],
  );

  function updateDraft(key: string, patch: Partial<Draft>) {
    setDrafts(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  async function save(eventKey: string) {
    const draft = drafts[eventKey];
    if (!draft) return;
    setSaving(eventKey);
    try {
      const res = await fetch(`/api/admin/sms-templates/${eventKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Save failed' }));
        setToast({ kind: 'err', msg: error || 'Save failed' });
        return;
      }
      const { template } = await res.json() as { template: SmsTemplate };
      setTemplates(prev => prev.map(t => (t.event_key === eventKey ? template : t)));
      setDrafts(prev => ({ ...prev, [eventKey]: toDraft(template) }));
      setToast({ kind: 'ok', msg: 'Saved — live on the next SMS' });
    } catch {
      setToast({ kind: 'err', msg: 'Network error' });
    } finally {
      setSaving(null);
      setTimeout(() => setToast(null), 2500);
    }
  }

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--admin-text)' }}>
          SMS Templates
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--admin-text-secondary)' }}>
          Edit the body of every transactional SMS the system sends. Changes go live on the next message — no deploy.
          Bodies use <code style={{ background: 'var(--admin-bg)', padding: '1px 4px', borderRadius: 3 }}>{'{{variable}}'}</code> placeholders;
          only the whitelisted variables below each template can be referenced.
        </p>
      </header>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {(['all', 'driver', 'rider', 'admin', 'any'] as AudienceFilter[]).map(a => {
          const active = audience === a;
          return (
            <button
              key={a}
              onClick={() => setAudience(a)}
              className="px-3 py-1.5 text-xs font-semibold rounded-full uppercase tracking-wider"
              style={{
                background: active ? 'var(--admin-accent, #448AFF)' : 'var(--admin-bg)',
                color: active ? 'white' : 'var(--admin-text-secondary)',
                border: `1px solid ${active ? 'transparent' : 'var(--admin-border)'}`,
              }}
            >
              {a}
            </button>
          );
        })}
        <span className="ml-auto text-xs" style={{ color: 'var(--admin-text-muted)' }}>
          {visible.length} of {templates.length}
        </span>
      </div>

      {visible.length === 0 && (
        <p style={{ color: 'var(--admin-text-secondary)' }}>No templates match that filter.</p>
      )}

      <div className="space-y-4">
        {visible.map(t => {
          const draft = drafts[t.event_key];
          const dirty = draft.body !== t.body || draft.enabled !== t.enabled;
          const aud = AUDIENCE_LABEL[t.audience];
          const previewed = preview(draft.body, t.variables);
          const charCount = previewed.length;
          const tooLong = charCount > 155;

          return (
            <div
              key={t.event_key}
              className="rounded-xl p-5"
              style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-[10px] px-2 py-0.5 rounded font-bold tracking-widest"
                      style={{ background: `${aud.color}20`, color: aud.color }}
                    >
                      {aud.label}
                    </span>
                    <code
                      className="text-[11px] px-2 py-0.5 rounded"
                      style={{ background: 'var(--admin-bg)', color: 'var(--admin-text)' }}
                    >
                      {t.event_key}
                    </code>
                  </div>
                  <p className="text-xs mt-2" style={{ color: 'var(--admin-text-secondary)' }}>
                    {t.trigger_description}
                  </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    disabled={!canEdit}
                    onChange={e => updateDraft(t.event_key, { enabled: e.target.checked })}
                    className="w-5 h-5"
                  />
                  <span
                    className="text-[10px] font-semibold tracking-widest"
                    style={{ color: draft.enabled ? '#00E676' : 'var(--admin-text-muted)' }}
                  >
                    {draft.enabled ? 'ENABLED' : 'DISABLED'}
                  </span>
                </label>
              </div>

              <div className="mb-3">
                <label className="text-[10px] font-bold tracking-widest block mb-1" style={{ color: 'var(--admin-text-faint)' }}>
                  BODY
                </label>
                <textarea
                  value={draft.body}
                  disabled={!canEdit}
                  onChange={e => updateDraft(t.event_key, { body: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded font-mono"
                  style={{
                    background: 'var(--admin-bg)',
                    border: '1px solid var(--admin-border)',
                    color: 'var(--admin-text)',
                  }}
                />
              </div>

              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold tracking-widest" style={{ color: 'var(--admin-text-faint)' }}>
                    PREVIEW (sample values)
                  </label>
                  <span
                    className="text-[10px] font-mono"
                    style={{ color: tooLong ? '#FF5252' : 'var(--admin-text-muted)' }}
                  >
                    {charCount} / 155
                  </span>
                </div>
                <div
                  className="px-3 py-2 text-sm rounded"
                  style={{ background: 'var(--admin-bg)', border: '1px solid var(--admin-border)', color: 'var(--admin-text-secondary)' }}
                >
                  {previewed}
                </div>
              </div>

              <div className="mb-3">
                <label className="text-[10px] font-bold tracking-widest block mb-1" style={{ color: 'var(--admin-text-faint)' }}>
                  VARIABLES
                </label>
                <div className="flex flex-wrap gap-1">
                  {t.variables.length === 0 && (
                    <span className="text-[11px]" style={{ color: 'var(--admin-text-muted)' }}>(no variables)</span>
                  )}
                  {t.variables.map(v => (
                    <code
                      key={v}
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: 'var(--admin-bg)', color: 'var(--admin-text-secondary)' }}
                    >
                      {`{{${v}}}`}
                    </code>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px]" style={{ color: 'var(--admin-text-muted)' }}>
                  Updated {new Date(t.updated_at).toLocaleString()}
                </span>
                {canEdit && (
                  <button
                    onClick={() => save(t.event_key)}
                    disabled={!dirty || saving === t.event_key}
                    className="px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
                    style={{
                      background: dirty ? 'var(--admin-accent, #448AFF)' : 'var(--admin-bg)',
                      color: dirty ? 'white' : 'var(--admin-text-muted)',
                    }}
                  >
                    {saving === t.event_key ? 'Saving…' : 'Save'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {toast && (
        <div
          className="fixed bottom-6 right-6 px-4 py-2 rounded-lg text-sm font-medium shadow-lg"
          style={{
            background: 'var(--admin-bg-elevated)',
            border: `1px solid ${toast.kind === 'err' ? '#FF5252' : 'var(--admin-border)'}`,
            color: toast.kind === 'err' ? '#FF5252' : 'var(--admin-text)',
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
