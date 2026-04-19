'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ConversationAgentConfig, ConfigUpdate } from '@/lib/conversation/config';
import type { ConversationPersona, PersonaInput, GenderMatch, UserTypeMatch } from '@/lib/conversation/personas';
import type { ThreadStats, ThreadWithContext } from '@/lib/conversation/threads';
import type { AnalyticsSnapshot } from '@/lib/conversation/analytics';
import { composeSystemPrompt } from '@/lib/conversation/prompt-parts';

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

type PanelId = 'analytics' | 'personas' | 'pacing' | 'opt_in' | 'engagement' | 'threads';

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
          id="analytics"
          label="Analytics"
          summary="Funnel · per-persona metrics · acquisition sources · Claude spend"
          open={openPanel === 'analytics'}
          onToggle={togglePanel}
        >
          <AnalyticsPanel active={openPanel === 'analytics'} />
        </AccordionPanel>

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
          <ThreadsPanel
            active={openPanel === 'threads'}
            initialThreads={initialThreads}
            initialTotal={totalThreads}
            onToast={showToast}
          />
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
  follow_up_template: null,
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
  const [testPersona, setTestPersona] = useState<SerializedPersona | null>(null);

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
      follow_up_template: p.follow_up_template,
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
              <button onClick={() => setTestPersona(p)} className="text-xs px-2 py-1 rounded" style={{ color: '#00E676' }}>Test</button>
              <button onClick={() => remove(p.id)} className="text-xs px-2 py-1 rounded" style={{ color: 'var(--admin-danger, #FF5252)' }}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {testPersona && (
        <TestSendModal
          persona={testPersona}
          onClose={() => setTestPersona(null)}
          onToast={onToast}
        />
      )}
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
        <Field label="Follow-up template (sent if user doesn't reply)" full>
          <textarea className="field-input" rows={3} value={draft.follow_up_template ?? ''} onChange={e => patch('follow_up_template', e.target.value || null)} />
          <CharCount value={draft.follow_up_template ?? ''} max={155} />
        </Field>
        <Field label="System prompt (Claude)" full>
          <textarea className="field-input" rows={6} value={draft.system_prompt} onChange={e => patch('system_prompt', e.target.value)} />
        </Field>
        <div className="md:col-span-2">
          <details className="rounded-lg px-3 py-2" style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}>
            <summary className="text-[10px] font-bold tracking-widest cursor-pointer" style={{ color: 'var(--admin-text-faint)' }}>
              PREVIEW COMPOSED PROMPT (what Claude sees)
            </summary>
            <pre
              className="mt-2 text-[11px] whitespace-pre-wrap font-mono"
              style={{ color: 'var(--admin-text-secondary)', lineHeight: 1.4 }}
            >
{composeSystemPrompt({
  personaSystemPrompt: draft.system_prompt || '(empty)',
  visionTemplate: draft.vision_template,
  includeVisionDirective: true,
})}
            </pre>
            <p className="text-[10px] mt-2" style={{ color: 'var(--admin-text-muted)' }}>
              VISION DIRECTIVE only appears when the thread has not yet delivered the vision and config.vision_trigger = first_reply.
            </p>
          </details>
        </div>
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
// Analytics panel
// ────────────────────────────────────────────────────────────────────

function AnalyticsPanel({ active }: { active: boolean }) {
  const [data, setData] = useState<AnalyticsSnapshot | null>(null);
  const [rangeDays, setRangeDays] = useState(30);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/conversation-agent/analytics?range=${rangeDays}`);
        if (cancelled) return;
        if (res.ok) setData(await res.json());
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [active, rangeDays]);

  if (!data && !loading) {
    return <p className="text-sm" style={{ color: 'var(--admin-text-secondary)' }}>No data yet.</p>;
  }
  if (!data) {
    return <p className="text-sm" style={{ color: 'var(--admin-text-secondary)' }}>Loading…</p>;
  }

  const f = data.funnel;
  const spentDollars = (data.claudeSpendTodayCents / 100).toFixed(2);
  const capDollars = data.claudeSpendCapCents != null ? (data.claudeSpendCapCents / 100).toFixed(2) : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <p className="text-xs" style={{ color: 'var(--admin-text-secondary)' }}>
          Window: last {data.rangeDays} days
        </p>
        <div className="flex gap-1">
          {[7, 30, 90].map(r => (
            <button
              key={r}
              onClick={() => setRangeDays(r)}
              className="text-[11px] px-2 py-1 rounded"
              style={{
                background: rangeDays === r ? 'var(--admin-accent, #448AFF)' : 'var(--admin-bg)',
                color: rangeDays === r ? 'white' : 'var(--admin-text-secondary)',
                border: '1px solid var(--admin-border)',
              }}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {/* Funnel */}
      <p className="text-[10px] font-bold tracking-[3px] mb-2" style={{ color: 'var(--admin-text-faint)' }}>FUNNEL</p>
      <div className="space-y-1.5 mb-6">
        <FunnelStep label="Threads opened" count={f.total} total={f.total} />
        <FunnelStep label="Sent greeting" count={f.withOutbound} total={f.total} />
        <FunnelStep label="Got a reply" count={f.withInbound} total={f.withOutbound} />
        <FunnelStep label="Vision delivered" count={f.visionDelivered} total={f.withInbound} />
        <FunnelStep label="Went dormant" count={f.dormant} total={f.withOutbound} muted />
        <FunnelStep label="Opted out" count={f.optedOut} total={f.total} muted />
        <FunnelStep label="Flagged for review" count={f.flaggedForReview} total={f.total} muted />
        <FunnelStep label="Handed off to human" count={f.manual} total={f.total} muted />
      </div>

      {/* Claude spend */}
      <div className="rounded-lg p-3 mb-6" style={{ background: 'var(--admin-bg)', border: '1px solid var(--admin-border)' }}>
        <p className="text-[10px] font-bold tracking-[3px] mb-1" style={{ color: 'var(--admin-text-faint)' }}>CLAUDE SPEND TODAY</p>
        <p className="text-lg font-bold" style={{ color: 'var(--admin-text)' }}>
          ${spentDollars}{capDollars ? ` / $${capDollars} cap` : ''}
        </p>
        {capDollars && data.claudeSpendTodayCents >= (data.claudeSpendCapCents ?? Infinity) && (
          <p className="text-[11px] mt-1" style={{ color: 'var(--admin-danger, #FF5252)' }}>Cap reached — Claude is paused</p>
        )}
      </div>

      {/* Per-persona */}
      <p className="text-[10px] font-bold tracking-[3px] mb-2" style={{ color: 'var(--admin-text-faint)' }}>PER PERSONA</p>
      <div className="overflow-x-auto mb-6">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: 'var(--admin-text-muted)' }}>
              <th className="text-left py-1 pr-3">Persona</th>
              <th className="text-right py-1 px-2">Threads</th>
              <th className="text-right py-1 px-2">Reply rate</th>
              <th className="text-right py-1 px-2">Opt-outs</th>
              <th className="text-right py-1 px-2">Avg sent</th>
              <th className="text-right py-1 px-2">Avg recv</th>
              <th className="text-right py-1 pl-2">TTR (min)</th>
            </tr>
          </thead>
          <tbody>
            {data.perPersona.map(p => {
              const replyRate = p.outboundCount ? Math.round((p.replyCount / p.outboundCount) * 100) : 0;
              return (
                <tr key={p.personaId} style={{ borderTop: '1px solid var(--admin-border)' }}>
                  <td className="py-1.5 pr-3" style={{ color: 'var(--admin-text)' }}>{p.displayName} <code className="text-[9px] text-white/30">{p.slug}</code></td>
                  <td className="text-right py-1.5 px-2" style={{ color: 'var(--admin-text)' }}>{p.threadCount}</td>
                  <td className="text-right py-1.5 px-2" style={{ color: 'var(--admin-text)' }}>{replyRate}%</td>
                  <td className="text-right py-1.5 px-2" style={{ color: 'var(--admin-text)' }}>{p.optOutCount}</td>
                  <td className="text-right py-1.5 px-2" style={{ color: 'var(--admin-text-secondary)' }}>{p.avgMessagesSent}</td>
                  <td className="text-right py-1.5 px-2" style={{ color: 'var(--admin-text-secondary)' }}>{p.avgMessagesReceived}</td>
                  <td className="text-right py-1.5 pl-2" style={{ color: 'var(--admin-text-secondary)' }}>
                    {p.avgTimeToReplyMin != null ? p.avgTimeToReplyMin : '—'}
                  </td>
                </tr>
              );
            })}
            {data.perPersona.length === 0 && (
              <tr><td colSpan={7} className="text-center py-4" style={{ color: 'var(--admin-text-muted)' }}>No data yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Per-source */}
      <p className="text-[10px] font-bold tracking-[3px] mb-2" style={{ color: 'var(--admin-text-faint)' }}>PER ACQUISITION SOURCE</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: 'var(--admin-text-muted)' }}>
              <th className="text-left py-1 pr-3">Source</th>
              <th className="text-right py-1 px-2">Threads</th>
              <th className="text-right py-1 px-2">Reply rate</th>
              <th className="text-right py-1 pl-2">Opt-outs</th>
            </tr>
          </thead>
          <tbody>
            {data.perSource.map(s => {
              const replyRate = s.threadCount ? Math.round((s.replyCount / s.threadCount) * 100) : 0;
              return (
                <tr key={s.source} style={{ borderTop: '1px solid var(--admin-border)' }}>
                  <td className="py-1.5 pr-3" style={{ color: 'var(--admin-text)' }}>{s.source}</td>
                  <td className="text-right py-1.5 px-2" style={{ color: 'var(--admin-text)' }}>{s.threadCount}</td>
                  <td className="text-right py-1.5 px-2" style={{ color: 'var(--admin-text)' }}>{replyRate}%</td>
                  <td className="text-right py-1.5 pl-2" style={{ color: 'var(--admin-text)' }}>{s.optOutCount}</td>
                </tr>
              );
            })}
            {data.perSource.length === 0 && (
              <tr><td colSpan={4} className="text-center py-4" style={{ color: 'var(--admin-text-muted)' }}>No data yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FunnelStep({ label, count, total, muted }: { label: string; count: number; total: number; muted?: boolean }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 rounded-lg px-3 py-2 flex items-center justify-between" style={{ background: 'var(--admin-bg)', border: '1px solid var(--admin-border)' }}>
        <span className="text-xs" style={{ color: muted ? 'var(--admin-text-muted)' : 'var(--admin-text)' }}>{label}</span>
        <span className="text-xs font-bold" style={{ color: muted ? 'var(--admin-text-muted)' : 'var(--admin-text)' }}>{count}</span>
      </div>
      <span className="text-[10px] w-10 text-right" style={{ color: 'var(--admin-text-muted)' }}>
        {total > 0 ? `${pct}%` : '—'}
      </span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Threads panel — filter chips, click to expand with transcript + actions
// ────────────────────────────────────────────────────────────────────

type ThreadFilter = 'all' | 'active' | 'dormant' | 'opted_out' | 'manual' | 'flagged';

interface ThreadsPanelProps {
  active: boolean;
  initialThreads: SerializedThread[];
  initialTotal: number;
  onToast: (msg: string) => void;
}

function ThreadsPanel({ active, initialThreads, initialTotal, onToast }: ThreadsPanelProps) {
  const [threads, setThreads] = useState<SerializedThread[]>(initialThreads);
  const [total, setTotal] = useState(initialTotal);
  const [filter, setFilter] = useState<ThreadFilter>('all');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SerializedThread | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: '50' });
        if (filter === 'flagged') params.set('flagged', '1');
        else if (filter !== 'all') params.set('status', filter);
        const res = await fetch(`/api/admin/conversation-agent/threads?${params.toString()}`);
        if (cancelled || !res.ok) return;
        const data = await res.json();
        setThreads(data.threads as SerializedThread[]);
        setTotal(data.total);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [active, filter]);

  function refreshThread(updated: SerializedThread) {
    setThreads(prev => prev.map(t => (t.id === updated.id ? updated : t)));
    setSelected(updated);
  }

  const chips: { id: ThreadFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'dormant', label: 'Dormant' },
    { id: 'opted_out', label: 'Opted-out' },
    { id: 'manual', label: 'Manual' },
    { id: 'flagged', label: 'Flagged' },
  ];

  return (
    <div>
      <div className="flex gap-2 mb-3 overflow-x-auto">
        {chips.map(c => (
          <button
            key={c.id}
            onClick={() => setFilter(c.id)}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-full shrink-0"
            style={{
              background: filter === c.id ? '#00E676' : 'var(--admin-bg)',
              color: filter === c.id ? '#080808' : 'var(--admin-text-secondary)',
              border: '1px solid var(--admin-border)',
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-[11px]" style={{ color: 'var(--admin-text-muted)' }}>Loading…</p>}

      {!loading && threads.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm" style={{ color: 'var(--admin-text-secondary)' }}>
            No threads match this filter.
          </p>
        </div>
      )}

      <p className="text-[11px] mb-2" style={{ color: 'var(--admin-text-muted)' }}>
        Showing {threads.length} of {total} threads.
      </p>
      <div className="space-y-2">
        {threads.map(t => (
          <button
            key={t.id}
            onClick={() => setSelected(t)}
            className="w-full text-left rounded-lg p-3 transition-colors hover:opacity-80"
            style={{
              background: 'var(--admin-bg)',
              border: t.flagged_for_review ? '1px solid rgba(255,82,82,0.3)' : '1px solid var(--admin-border)',
            }}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold" style={{ color: 'var(--admin-text)' }}>
                    {t.persona_display_name}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--admin-text-secondary)' }}>
                    → {t.user_profile_type ?? 'user'} {t.phone}
                  </span>
                  {t.flagged_for_review && <Pill label="flagged" tone="accent" />}
                </div>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--admin-text-muted)' }}>
                  {t.messages_sent} sent · {t.messages_received} received · updated {new Date(t.updated_at).toLocaleString()}
                </p>
              </div>
              <Pill label={t.status} tone={t.status === 'active' ? 'accent' : 'muted'} />
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <ThreadDetailModal
          thread={selected}
          onClose={() => setSelected(null)}
          onThreadUpdated={refreshThread}
          onToast={onToast}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Thread detail modal — transcript + actions
// ────────────────────────────────────────────────────────────────────

interface TranscriptMessage {
  id: string;
  thread_id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  generated_by: string | null;
  voipms_id: string | null;
  delivery_status: string | null;
  error_message: string | null;
  sent_at: string;
}

interface ThreadDetailModalProps {
  thread: SerializedThread;
  onClose: () => void;
  onThreadUpdated: (t: SerializedThread) => void;
  onToast: (msg: string) => void;
}

function ThreadDetailModal({ thread, onClose, onThreadUpdated, onToast }: ThreadDetailModalProps) {
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/conversation-agent/threads/${thread.id}`);
        if (cancelled || !res.ok) return;
        const data = await res.json();
        setMessages(data.messages as TranscriptMessage[]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [thread.id]);

  async function handoff() {
    if (!confirm('Hand off this thread to a human? Claude will stop replying and any queued messages will be cancelled.')) return;
    setActing(true);
    try {
      const res = await fetch(`/api/admin/conversation-agent/threads/${thread.id}/handoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'admin_handoff' }),
      });
      if (res.ok) {
        const { thread: updated } = await res.json();
        onThreadUpdated({ ...thread, status: updated.status, flagged_for_review: true });
        onToast('Handed off');
      } else {
        onToast('Hand-off failed');
      }
    } finally {
      setActing(false);
    }
  }

  async function resume() {
    setActing(true);
    try {
      const res = await fetch(`/api/admin/conversation-agent/threads/${thread.id}/resume`, {
        method: 'POST',
      });
      if (res.ok) {
        const { thread: updated } = await res.json();
        onThreadUpdated({ ...thread, status: updated.status });
        onToast('Resumed');
      } else {
        onToast('Resume failed');
      }
    } finally {
      setActing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] rounded-2xl overflow-hidden flex flex-col"
        style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-start justify-between gap-3" style={{ borderBottom: '1px solid var(--admin-border)' }}>
          <div className="min-w-0">
            <h2 className="text-base font-bold" style={{ color: 'var(--admin-text)' }}>
              {thread.persona_display_name} ↔ {thread.user_profile_type ?? 'user'} {thread.phone}
            </h2>
            <p className="text-[11px] mt-1" style={{ color: 'var(--admin-text-muted)' }}>
              status: <span style={{ color: 'var(--admin-text-secondary)' }}>{thread.status}</span>
              {' · '}
              sent: {thread.messages_sent} · received: {thread.messages_received}
              {thread.flagged_for_review && thread.flag_reason && <> · flagged: {thread.flag_reason}</>}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-white/50 hover:text-white">✕</button>
        </div>

        {/* Transcript */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {loading && <p className="text-xs text-center" style={{ color: 'var(--admin-text-muted)' }}>Loading…</p>}
          {!loading && messages.length === 0 && (
            <p className="text-xs text-center" style={{ color: 'var(--admin-text-muted)' }}>No messages yet.</p>
          )}
          {messages.map(m => (
            <div
              key={m.id}
              className="flex"
              style={{ justifyContent: m.direction === 'inbound' ? 'flex-start' : 'flex-end' }}
            >
              <div
                className="max-w-[80%] rounded-2xl px-3 py-2"
                style={{
                  background: m.direction === 'inbound' ? 'var(--admin-bg)' : 'rgba(0,230,118,0.14)',
                  color: m.direction === 'inbound' ? 'var(--admin-text)' : '#00E676',
                  border: '1px solid var(--admin-border)',
                }}
              >
                <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                <p className="text-[9px] mt-1 opacity-60">
                  {new Date(m.sent_at).toLocaleString()}
                  {m.generated_by && ` · ${m.generated_by}`}
                  {m.delivery_status && ` · ${m.delivery_status}`}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderTop: '1px solid var(--admin-border)' }}>
          <a
            href={`/api/admin/conversation-agent/threads/${thread.id}/transcript`}
            className="text-xs px-3 py-2 rounded-lg"
            style={{ background: 'var(--admin-bg)', color: 'var(--admin-text-secondary)', border: '1px solid var(--admin-border)' }}
          >
            Export CSV
          </a>
          <div className="flex gap-2">
            {thread.status === 'manual' ? (
              <button
                onClick={resume}
                disabled={acting}
                className="text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50"
                style={{ background: '#00E676', color: '#080808' }}
              >
                Resume agent
              </button>
            ) : (thread.status === 'active' || thread.status === 'dormant' || thread.status === 'pending') ? (
              <button
                onClick={handoff}
                disabled={acting}
                className="text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50"
                style={{ background: 'var(--admin-danger, #FF5252)', color: 'white' }}
              >
                Hand off to human
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Send-test modal (persona editor row → "Test")
// ────────────────────────────────────────────────────────────────────

function TestSendModal({
  persona, onClose, onToast,
}: {
  persona: SerializedPersona;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const [kind, setKind] = useState<'greeting' | 'follow_up' | 'vision'>('greeting');
  const [toPhone, setToPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [lastBody, setLastBody] = useState<string | null>(null);

  async function send() {
    if (!toPhone) { onToast('Enter a phone number'); return; }
    setSending(true);
    try {
      const res = await fetch(`/api/admin/conversation-agent/threads/test/test-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId: persona.id, kind, toPhone }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setLastBody(data.sent_body ?? null);
        onToast('Test sent');
      } else {
        onToast(data.error || 'Send failed');
      }
    } finally {
      setSending(false);
    }
  }

  const template =
    kind === 'greeting'  ? persona.greeting_template :
    kind === 'follow_up' ? (persona.follow_up_template || persona.greeting_template) :
                           (persona.vision_template || '');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-2xl p-5"
        style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--admin-text)' }}>Test send: {persona.display_name}</h2>
            <p className="text-[11px] mt-1" style={{ color: 'var(--admin-text-muted)' }}>
              Sends as [TEST] prefix. Won&apos;t touch thread data.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-white/50 hover:text-white">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold tracking-widest block mb-1" style={{ color: 'var(--admin-text-faint)' }}>MESSAGE KIND</label>
            <select
              className="w-full px-3 py-2 text-sm rounded-lg"
              style={{ background: 'var(--admin-bg)', border: '1px solid var(--admin-border)', color: 'var(--admin-text)' }}
              value={kind}
              onChange={e => setKind(e.target.value as 'greeting' | 'follow_up' | 'vision')}
            >
              <option value="greeting">Greeting (first message)</option>
              <option value="follow_up">Follow-up nudge</option>
              <option value="vision">Vision message</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold tracking-widest block mb-1" style={{ color: 'var(--admin-text-faint)' }}>TO PHONE</label>
            <input
              type="tel"
              placeholder="+14045551234"
              value={toPhone}
              onChange={e => setToPhone(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg"
              style={{ background: 'var(--admin-bg)', border: '1px solid var(--admin-border)', color: 'var(--admin-text)' }}
            />
          </div>
          <div>
            <label className="text-[10px] font-bold tracking-widest block mb-1" style={{ color: 'var(--admin-text-faint)' }}>WILL SEND</label>
            <div className="rounded-lg px-3 py-2 text-xs whitespace-pre-wrap" style={{ background: 'var(--admin-bg)', border: '1px solid var(--admin-border)', color: 'var(--admin-text-secondary)' }}>
              [TEST] {template || '(empty — persona has no template for this kind)'}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button onClick={onClose} disabled={sending} className="text-xs text-white/60 px-3 py-2">Cancel</button>
          <button
            onClick={send}
            disabled={sending || !toPhone || !template}
            className="text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50"
            style={{ background: '#00E676', color: '#080808' }}
          >
            {sending ? 'Sending…' : 'Send test'}
          </button>
        </div>

        {lastBody && (
          <p className="text-[10px] mt-3" style={{ color: 'var(--admin-text-muted)' }}>
            Last sent: {lastBody}
          </p>
        )}
      </div>
    </div>
  );
}
