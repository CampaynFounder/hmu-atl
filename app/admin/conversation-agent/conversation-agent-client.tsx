'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ConversationAgentConfig, ConfigUpdate } from '@/lib/conversation/config';
import type { ConversationPersona, PersonaInput, GenderMatch, UserTypeMatch } from '@/lib/conversation/personas';
import type { ThreadStats, ThreadWithContext } from '@/lib/conversation/threads';

type SerializedPersona = Omit<ConversationPersona, 'created_at' | 'updated_at'> & {
  created_at: string;
  updated_at: string;
};
type SerializedConfig = Omit<ConversationAgentConfig, 'updated_at'> & { updated_at: string };
type SerializedThread = Omit<ThreadWithContext, 'created_at' | 'updated_at' | 'last_outbound_at' | 'last_inbound_at' | 'vision_delivered_at' | 'opted_out_at'> & {
  created_at: string;
  updated_at: string;
  last_outbound_at: string | null;
  last_inbound_at: string | null;
  vision_delivered_at: string | null;
  opted_out_at: string | null;
};

interface Props {
  flagEnabled: boolean;
  initialConfig: SerializedConfig;
  initialPersonas: SerializedPersona[];
  initialThreads: SerializedThread[];
  totalThreads: number;
  stats: ThreadStats;
}

type PanelId = 'personas' | 'pacing' | 'opt_in' | 'engagement' | 'threads';

export default function ConversationAgentClient({
  flagEnabled,
  initialConfig,
  initialPersonas,
  initialThreads,
  totalThreads,
  stats,
}: Props) {
  const [openPanel, setOpenPanel] = useState<PanelId | null>('personas');
  const [config, setConfig] = useState<SerializedConfig>(initialConfig);
  const [personas, setPersonas] = useState<SerializedPersona[]>(initialPersonas);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  function togglePanel(id: PanelId) {
    setOpenPanel(prev => (prev === id ? null : id));
  }

  const activePersonas = personas.filter(p => p.is_active).length;

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--admin-text)' }}>
          Conversation Agent
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--admin-text-secondary)' }}>
          SMS concierge that welcomes new users with gender + user-type-aware personas.
          Flag OFF = zero messages sent.
        </p>
      </header>

      {/* ── Overview card ── */}
      <div
        className="rounded-xl p-5 mb-6 flex flex-wrap items-center gap-6"
        style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}
      >
        <div>
          <p className="text-[10px] font-bold tracking-[3px] mb-1" style={{ color: 'var(--admin-text-faint)' }}>
            STATUS
          </p>
          <p className="text-lg font-bold" style={{ color: flagEnabled ? '#00E676' : 'var(--admin-text-muted)' }}>
            {flagEnabled ? 'ENABLED' : 'DISABLED'}
          </p>
          <Link
            href="/admin/feature-flags"
            className="text-[11px] underline mt-0.5 inline-block"
            style={{ color: 'var(--admin-text-secondary)' }}
          >
            {flagEnabled ? 'Manage flag →' : 'Turn on in Feature Flags →'}
          </Link>
        </div>
        <Divider />
        <Stat label="PERSONAS" value={`${activePersonas}/${personas.length}`} sub="active" />
        <Divider />
        <Stat label="THREADS" value={stats.total.toString()} sub={`${stats.active} active`} />
        <Divider />
        <Stat label="REPLY RATE" value={`${stats.reply_rate_percent}%`} sub={stats.total ? `${stats.total} threads` : 'no data yet'} />
        <Divider />
        <Stat label="OPT-OUTS" value={stats.opted_out.toString()} sub="lifetime" />
      </div>

      {/* ── Accordion ── */}
      <div className="space-y-3">
        <AccordionPanel
          id="personas"
          label="Personas"
          summary={`${activePersonas} active · ${personas.length} total`}
          open={openPanel === 'personas'}
          onToggle={togglePanel}
        >
          <PersonasEditor
            personas={personas}
            onPersonasChange={setPersonas}
            onToast={showToast}
          />
        </AccordionPanel>

        <AccordionPanel
          id="pacing"
          label="Pacing & Limits"
          summary={`${config.first_message_delay_minutes}min delay · quiet ${config.quiet_hours_start.slice(0, 5)}–${config.quiet_hours_end.slice(0, 5)}`}
          open={openPanel === 'pacing'}
          onToggle={togglePanel}
        >
          <ConfigSlice
            kind="pacing"
            config={config}
            onConfigChange={setConfig}
            onToast={showToast}
          />
        </AccordionPanel>

        <AccordionPanel
          id="opt_in"
          label="Opt-In & Compliance"
          summary={config.opt_in_required ? 'Opt-in required · STOP enforced' : 'Opt-in optional'}
          open={openPanel === 'opt_in'}
          onToggle={togglePanel}
        >
          <ConfigSlice
            kind="opt_in"
            config={config}
            onConfigChange={setConfig}
            onToast={showToast}
          />
        </AccordionPanel>

        <AccordionPanel
          id="engagement"
          label="Engagement"
          summary={`vision: ${config.vision_trigger} · rider: ${config.rider_narrative_style} · ${config.claude_model.replace('claude-', '').replace(/-\d+$/, '')}`}
          open={openPanel === 'engagement'}
          onToggle={togglePanel}
        >
          <ConfigSlice
            kind="engagement"
            config={config}
            onConfigChange={setConfig}
            onToast={showToast}
          />
        </AccordionPanel>

        <AccordionPanel
          id="threads"
          label="Live Threads"
          summary={totalThreads ? `${totalThreads} threads · ${stats.active} active` : 'none yet'}
          open={openPanel === 'threads'}
          onToggle={togglePanel}
        >
          <ThreadsPanel initialThreads={initialThreads} totalThreads={totalThreads} />
        </AccordionPanel>
      </div>

      {toast && (
        <div
          className="fixed bottom-6 right-6 px-4 py-2 rounded-lg text-sm font-medium shadow-lg z-50"
          style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)', color: 'var(--admin-text)' }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Overview helpers
// ────────────────────────────────────────────────────────────────────

function Divider() {
  return <div className="h-10 w-px" style={{ background: 'var(--admin-border)' }} />;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold tracking-[3px] mb-1" style={{ color: 'var(--admin-text-faint)' }}>
        {label}
      </p>
      <p className="text-lg font-bold" style={{ color: 'var(--admin-text)' }}>{value}</p>
      {sub && <p className="text-[10px] mt-0.5" style={{ color: 'var(--admin-text-muted)' }}>{sub}</p>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Accordion primitive
// ────────────────────────────────────────────────────────────────────

interface AccordionPanelProps {
  id: PanelId;
  label: string;
  summary: string;
  open: boolean;
  onToggle: (id: PanelId) => void;
  children: React.ReactNode;
}

function AccordionPanel({ id, label, summary, open, onToggle, children }: AccordionPanelProps) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}
    >
      <button
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
        style={{ color: 'var(--admin-text)' }}
      >
        <div>
          <p className="text-base font-semibold">{label}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--admin-text-secondary)' }}>
            {summary}
          </p>
        </div>
        <span className="text-xs font-bold ml-4" style={{ color: 'var(--admin-text-muted)' }}>
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1" style={{ borderTop: '1px solid var(--admin-border)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Personas editor
// ────────────────────────────────────────────────────────────────────

const DEFAULT_PERSONA: PersonaInput = {
  slug: '',
  display_name: '',
  gender_match: 'any',
  user_type_match: 'any',
  greeting_template: '',
  vision_template: null,
  system_prompt: '',
  max_messages_per_thread: 3,
  quiet_hours_start: '21:00',
  quiet_hours_end: '09:00',
  follow_up_schedule_hours: [24, 168],
  is_active: true,
  sort_order: 0,
};

interface PersonasEditorProps {
  personas: SerializedPersona[];
  onPersonasChange: (next: SerializedPersona[]) => void;
  onToast: (msg: string) => void;
}

function PersonasEditor({ personas, onPersonasChange, onToast }: PersonasEditorProps) {
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<PersonaInput>(DEFAULT_PERSONA);
  const [saving, setSaving] = useState(false);

  function startNew() {
    setDraft(DEFAULT_PERSONA);
    setEditingId('new');
  }

  function startEdit(p: SerializedPersona) {
    setDraft({
      slug: p.slug,
      display_name: p.display_name,
      gender_match: p.gender_match,
      user_type_match: p.user_type_match,
      greeting_template: p.greeting_template,
      vision_template: p.vision_template,
      system_prompt: p.system_prompt,
      max_messages_per_thread: p.max_messages_per_thread,
      quiet_hours_start: p.quiet_hours_start.slice(0, 5),
      quiet_hours_end: p.quiet_hours_end.slice(0, 5),
      follow_up_schedule_hours: p.follow_up_schedule_hours,
      is_active: p.is_active,
      sort_order: p.sort_order,
    });
    setEditingId(p.id);
  }

  function cancel() {
    setEditingId(null);
    setDraft(DEFAULT_PERSONA);
  }

  async function save() {
    setSaving(true);
    try {
      const url = editingId === 'new'
        ? '/api/admin/conversation-agent/personas'
        : `/api/admin/conversation-agent/personas/${editingId}`;
      const method = editingId === 'new' ? 'POST' : 'PATCH';
      const body = {
        ...draft,
        quiet_hours_start: draft.quiet_hours_start.length === 5 ? draft.quiet_hours_start + ':00' : draft.quiet_hours_start,
        quiet_hours_end: draft.quiet_hours_end.length === 5 ? draft.quiet_hours_end + ':00' : draft.quiet_hours_end,
      };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Save failed' }));
        onToast(error || 'Save failed');
        return;
      }
      const { persona } = await res.json();
      const serialized: SerializedPersona = {
        ...persona,
        created_at: persona.created_at,
        updated_at: persona.updated_at,
      };
      if (editingId === 'new') {
        onPersonasChange([...personas, serialized].sort((a, b) => a.sort_order - b.sort_order));
      } else {
        onPersonasChange(personas.map(p => (p.id === editingId ? serialized : p)));
      }
      cancel();
      onToast('Saved');
    } catch {
      onToast('Network error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this persona? Threads referencing it will remain but new users can\'t be matched to it.')) return;
    const res = await fetch(`/api/admin/conversation-agent/personas/${id}`, { method: 'DELETE' });
    if (res.ok) {
      onPersonasChange(personas.filter(p => p.id !== id));
      onToast('Deleted');
    } else {
      onToast('Delete failed');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs" style={{ color: 'var(--admin-text-secondary)' }}>
          Personas are matched to users by gender + user_type. Exact matches beat &quot;any&quot;.
        </p>
        <button
          onClick={startNew}
          disabled={editingId !== null}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40"
          style={{ background: 'var(--admin-accent, #448AFF)', color: 'white' }}
        >
          + Persona
        </button>
      </div>

      {editingId && (
        <PersonaForm
          draft={draft}
          isNew={editingId === 'new'}
          saving={saving}
          onChange={setDraft}
          onCancel={cancel}
          onSave={save}
        />
      )}

      <div className="space-y-2">
        {personas.map(p => (
          <div
            key={p.id}
            className="rounded-lg p-3 flex items-start justify-between gap-3"
            style={{
              background: 'var(--admin-bg)',
              border: '1px solid var(--admin-border)',
              opacity: p.is_active ? 1 : 0.55,
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-bold text-sm" style={{ color: 'var(--admin-text)' }}>
                  {p.display_name}
                </span>
                <code className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--admin-bg-elevated)', color: 'var(--admin-text-muted)' }}>
                  {p.slug}
                </code>
                <Pill label={p.gender_match} tone={p.gender_match === 'any' ? 'muted' : 'accent'} />
                <Pill label={p.user_type_match} tone={p.user_type_match === 'any' ? 'muted' : 'accent'} />
                {!p.is_active && <Pill label="inactive" tone="muted" />}
              </div>
              <p className="text-xs line-clamp-2" style={{ color: 'var(--admin-text-secondary)' }}>
                {p.greeting_template}
              </p>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <button onClick={() => startEdit(p)} className="text-xs px-2 py-1 rounded" style={{ color: 'var(--admin-text-secondary)' }}>Edit</button>
              <button onClick={() => remove(p.id)} className="text-xs px-2 py-1 rounded" style={{ color: 'var(--admin-danger, #FF5252)' }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Pill({ label, tone }: { label: string; tone: 'accent' | 'muted' }) {
  return (
    <span
      className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{
        background: tone === 'accent' ? 'rgba(68,138,255,0.14)' : 'var(--admin-bg-elevated)',
        color: tone === 'accent' ? '#448AFF' : 'var(--admin-text-muted)',
      }}
    >
      {label}
    </span>
  );
}

interface PersonaFormProps {
  draft: PersonaInput;
  isNew: boolean;
  saving: boolean;
  onChange: (next: PersonaInput) => void;
  onCancel: () => void;
  onSave: () => void;
}

function PersonaForm({ draft, isNew, saving, onChange, onCancel, onSave }: PersonaFormProps) {
  function patch<K extends keyof PersonaInput>(k: K, v: PersonaInput[K]) {
    onChange({ ...draft, [k]: v });
  }
  return (
    <div
      className="rounded-lg p-4 mb-3"
      style={{ background: 'var(--admin-bg)', border: '1px solid var(--admin-accent, #448AFF)' }}
    >
      <p className="text-sm font-bold mb-3" style={{ color: 'var(--admin-text)' }}>
        {isNew ? 'New persona' : 'Edit persona'}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Slug"><input className="field-input" value={draft.slug} onChange={e => patch('slug', e.target.value)} placeholder="tenay" /></Field>
        <Field label="Display name"><input className="field-input" value={draft.display_name} onChange={e => patch('display_name', e.target.value)} placeholder="Tenay" /></Field>
        <Field label="Gender match">
          <select className="field-input" value={draft.gender_match} onChange={e => patch('gender_match', e.target.value as GenderMatch)}>
            <option value="female">female</option>
            <option value="male">male</option>
            <option value="nonbinary">nonbinary</option>
            <option value="any">any</option>
          </select>
        </Field>
        <Field label="User type match">
          <select className="field-input" value={draft.user_type_match} onChange={e => patch('user_type_match', e.target.value as UserTypeMatch)}>
            <option value="driver">driver</option>
            <option value="rider">rider</option>
            <option value="any">any</option>
          </select>
        </Field>
        <Field label="Greeting template" full>
          <textarea className="field-input" rows={3} value={draft.greeting_template} onChange={e => patch('greeting_template', e.target.value)} />
          <CharCount value={draft.greeting_template} max={155} />
        </Field>
        <Field label="Vision template (fires after first reply)" full>
          <textarea className="field-input" rows={3} value={draft.vision_template ?? ''} onChange={e => patch('vision_template', e.target.value || null)} />
          <CharCount value={draft.vision_template ?? ''} max={155} />
        </Field>
        <Field label="System prompt (Claude)" full>
          <textarea className="field-input" rows={6} value={draft.system_prompt} onChange={e => patch('system_prompt', e.target.value)} />
        </Field>
        <Field label="Max messages per thread">
          <input className="field-input" type="number" min={1} value={draft.max_messages_per_thread} onChange={e => patch('max_messages_per_thread', Number(e.target.value))} />
        </Field>
        <Field label="Follow-up hours (comma-separated)">
          <input
            className="field-input"
            value={draft.follow_up_schedule_hours.join(', ')}
            onChange={e => {
              const arr = e.target.value.split(',').map(s => s.trim()).filter(Boolean).map(Number).filter(n => !isNaN(n) && n > 0);
              patch('follow_up_schedule_hours', arr);
            }}
            placeholder="24, 168"
          />
        </Field>
        <Field label="Quiet hours start">
          <input className="field-input" type="time" value={draft.quiet_hours_start} onChange={e => patch('quiet_hours_start', e.target.value)} />
        </Field>
        <Field label="Quiet hours end">
          <input className="field-input" type="time" value={draft.quiet_hours_end} onChange={e => patch('quiet_hours_end', e.target.value)} />
        </Field>
        <Field label="Sort order">
          <input className="field-input" type="number" value={draft.sort_order} onChange={e => patch('sort_order', Number(e.target.value))} />
        </Field>
        <div className="md:col-span-2 flex items-center gap-3 mt-1">
          <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--admin-text)' }}>
            <input type="checkbox" checked={draft.is_active} onChange={e => patch('is_active', e.target.checked)} />
            Active
          </label>
          <div className="flex-1" />
          <button onClick={onCancel} disabled={saving} className="text-xs text-white/60 px-3 py-2">Cancel</button>
          <button onClick={onSave} disabled={saving} className="text-xs font-bold px-4 py-2 rounded-lg" style={{ background: '#00E676', color: '#080808' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      <FormStyles />
    </div>
  );
}

function CharCount({ value, max }: { value: string; max: number }) {
  const over = value.length > max;
  return (
    <p className="text-[10px] mt-1 text-right" style={{ color: over ? 'var(--admin-danger, #FF5252)' : 'var(--admin-text-muted)' }}>
      {value.length} / {max} chars{over ? ' — will be split into multi-part SMS' : ''}
    </p>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <label className="text-[10px] font-bold tracking-widest block mb-1" style={{ color: 'var(--admin-text-faint)' }}>
        {label.toUpperCase()}
      </label>
      {children}
    </div>
  );
}

function FormStyles() {
  return (
    <style jsx>{`
      .field-input {
        width: 100%;
        padding: 8px 12px;
        font-size: 13px;
        border-radius: 8px;
        background: var(--admin-bg-elevated);
        border: 1px solid var(--admin-border);
        color: var(--admin-text);
        outline: none;
      }
      .field-input:focus {
        border-color: var(--admin-accent, #448AFF);
      }
    `}</style>
  );
}

// ────────────────────────────────────────────────────────────────────
// Config slices — pacing / opt_in / engagement all save to the same endpoint
// ────────────────────────────────────────────────────────────────────

interface ConfigSliceProps {
  kind: 'pacing' | 'opt_in' | 'engagement';
  config: SerializedConfig;
  onConfigChange: (next: SerializedConfig) => void;
  onToast: (msg: string) => void;
}

function ConfigSlice({ kind, config, onConfigChange, onToast }: ConfigSliceProps) {
  const [draft, setDraft] = useState<SerializedConfig>(config);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(config);

  function patch<K extends keyof SerializedConfig>(k: K, v: SerializedConfig[K]) {
    setDraft(prev => ({ ...prev, [k]: v }));
  }

  async function save() {
    setSaving(true);
    try {
      const body: ConfigUpdate = {
        first_message_delay_minutes: Number(draft.first_message_delay_minutes),
        quiet_hours_start: draft.quiet_hours_start.length === 5 ? draft.quiet_hours_start + ':00' : draft.quiet_hours_start,
        quiet_hours_end: draft.quiet_hours_end.length === 5 ? draft.quiet_hours_end + ':00' : draft.quiet_hours_end,
        quiet_hours_enforced: Boolean(draft.quiet_hours_enforced),
        opt_in_required: Boolean(draft.opt_in_required),
        opt_in_disclosure_text: draft.opt_in_disclosure_text,
        stop_acknowledgment_text: draft.stop_acknowledgment_text,
        vision_trigger: draft.vision_trigger,
        rider_narrative_style: draft.rider_narrative_style,
        claude_model: draft.claude_model,
        max_inbound_per_thread: Number(draft.max_inbound_per_thread),
        claude_rate_limit_seconds: Number(draft.claude_rate_limit_seconds),
        daily_spend_cap_cents: draft.daily_spend_cap_cents,
      };
      const res = await fetch('/api/admin/conversation-agent/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Save failed' }));
        onToast(error || 'Save failed');
        return;
      }
      const { config: saved } = await res.json();
      const serialized: SerializedConfig = { ...saved, updated_at: saved.updated_at };
      setDraft(serialized);
      onConfigChange(serialized);
      onToast('Saved');
    } catch {
      onToast('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {kind === 'pacing' && (
          <>
            <Field label="First-message delay (minutes)">
              <input className="field-input" type="number" min={0} value={draft.first_message_delay_minutes} onChange={e => patch('first_message_delay_minutes', Number(e.target.value))} />
            </Field>
            <Field label="Max inbound messages per thread">
              <input className="field-input" type="number" min={1} value={draft.max_inbound_per_thread} onChange={e => patch('max_inbound_per_thread', Number(e.target.value))} />
            </Field>
            <Field label="Quiet hours start (ET)">
              <input className="field-input" type="time" value={draft.quiet_hours_start.slice(0, 5)} onChange={e => patch('quiet_hours_start', e.target.value)} />
            </Field>
            <Field label="Quiet hours end (ET)">
              <input className="field-input" type="time" value={draft.quiet_hours_end.slice(0, 5)} onChange={e => patch('quiet_hours_end', e.target.value)} />
            </Field>
            <Field label="Enforce quiet hours" full>
              <Toggle checked={draft.quiet_hours_enforced} onChange={v => patch('quiet_hours_enforced', v)} on="Enforced — outbound deferred during quiet hours" off="Off — outbound sends anytime (not recommended)" />
            </Field>
          </>
        )}
        {kind === 'opt_in' && (
          <>
            <Field label="Require explicit opt-in" full>
              <Toggle checked={draft.opt_in_required} onChange={v => patch('opt_in_required', v)} on="Required — only users who checked the box receive messages" off="Optional — all verified phones (TCPA risk!)" />
            </Field>
            <Field label="Opt-in disclosure text (shown at signup)" full>
              <textarea className="field-input" rows={3} value={draft.opt_in_disclosure_text} onChange={e => patch('opt_in_disclosure_text', e.target.value)} />
              <p className="text-[10px] mt-1" style={{ color: 'var(--admin-text-muted)' }}>
                Include &quot;Reply STOP to opt out&quot; and &quot;Msg &amp; data rates may apply&quot; for TCPA/CTIA compliance.
              </p>
            </Field>
            <Field label="STOP acknowledgment message" full>
              <textarea className="field-input" rows={2} value={draft.stop_acknowledgment_text} onChange={e => patch('stop_acknowledgment_text', e.target.value)} />
              <CharCount value={draft.stop_acknowledgment_text} max={155} />
            </Field>
          </>
        )}
        {kind === 'engagement' && (
          <>
            <Field label="When to fire vision message">
              <select className="field-input" value={draft.vision_trigger} onChange={e => patch('vision_trigger', e.target.value as SerializedConfig['vision_trigger'])}>
                <option value="first_reply">After user&apos;s first reply</option>
                <option value="immediate">Immediately (in greeting)</option>
                <option value="manual">Manual only (admin sends)</option>
              </select>
            </Field>
            <Field label="Rider narrative style">
              <select className="field-input" value={draft.rider_narrative_style} onChange={e => patch('rider_narrative_style', e.target.value as SerializedConfig['rider_narrative_style'])}>
                <option value="value">Value — cheaper than Uber</option>
                <option value="trust">Trust — real people, real ratings</option>
                <option value="relationship">Relationship — find drivers you vibe with</option>
              </select>
            </Field>
            <Field label="Claude model">
              <select className="field-input" value={draft.claude_model} onChange={e => patch('claude_model', e.target.value)}>
                <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 — fast, cheap</option>
                <option value="claude-sonnet-4-6">Claude Sonnet 4.6 — smarter, slower</option>
                <option value="claude-opus-4-7">Claude Opus 4.7 — best, most expensive</option>
              </select>
            </Field>
            <Field label="Claude rate-limit per thread (seconds)">
              <input className="field-input" type="number" min={0} value={draft.claude_rate_limit_seconds} onChange={e => patch('claude_rate_limit_seconds', Number(e.target.value))} />
            </Field>
            <Field label="Daily spend cap (cents, blank = unlimited)" full>
              <input className="field-input" type="number" value={draft.daily_spend_cap_cents ?? ''} onChange={e => patch('daily_spend_cap_cents', e.target.value === '' ? null : Number(e.target.value))} placeholder="Blank for unlimited" />
            </Field>
          </>
        )}
      </div>
      <div className="flex items-center justify-end gap-3 mt-4">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-40"
          style={{ background: dirty ? '#00E676' : 'var(--admin-bg)', color: dirty ? '#080808' : 'var(--admin-text-muted)' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <FormStyles />
    </div>
  );
}

function Toggle({ checked, onChange, on, off }: { checked: boolean; onChange: (v: boolean) => void; on: string; off: string }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left"
      style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}
    >
      <span className="text-xs" style={{ color: 'var(--admin-text)' }}>
        {checked ? on : off}
      </span>
      <span
        className="w-9 h-5 rounded-full relative transition-colors"
        style={{ background: checked ? '#00E676' : 'rgba(255,255,255,0.1)' }}
      >
        <span
          className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
          style={{ left: checked ? '18px' : '2px' }}
        />
      </span>
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────
// Threads panel (read-only in Phase 1)
// ────────────────────────────────────────────────────────────────────

function ThreadsPanel({ initialThreads, totalThreads }: { initialThreads: SerializedThread[]; totalThreads: number }) {
  if (totalThreads === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-sm" style={{ color: 'var(--admin-text-secondary)' }}>
          No threads yet — first messages send after Phase 2 ships and the flag is enabled.
        </p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-[11px] mb-3" style={{ color: 'var(--admin-text-muted)' }}>
        Showing {initialThreads.length} of {totalThreads} threads.
      </p>
      <div className="space-y-2">
        {initialThreads.map(t => (
          <div key={t.id} className="rounded-lg p-3" style={{ background: 'var(--admin-bg)', border: '1px solid var(--admin-border)' }}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--admin-text)' }}>
                  {t.persona_display_name} → {t.user_profile_type ?? 'user'} {t.phone}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--admin-text-muted)' }}>
                  {t.messages_sent} sent · {t.messages_received} received · updated {new Date(t.updated_at).toLocaleString()}
                </p>
              </div>
              <Pill label={t.status} tone={t.status === 'active' ? 'accent' : 'muted'} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
