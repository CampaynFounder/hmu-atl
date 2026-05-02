'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UtmBuilder } from './utm-builder';
import { RecentSignups } from './recent-signups';
import { consumeStagedRecipients } from '@/lib/admin/outreach-staging';
import { openThreadOrCompose } from '@/lib/admin/thread-router';
import { useAdminAuth } from '@/app/admin/components/admin-auth-context';

interface Recipient {
  phone: string;
  name?: string;
  sex?: string;
  issue?: string;
  fbName?: string;
  userId?: string;
  profileType?: string;
  [key: string]: string | undefined;
}

interface SendResult {
  phone: string;
  name?: string;
  status: string;
  error?: string;
}

interface Template {
  id: string;
  label: string;
  body: string;
  // null when no link saved with this template — load preserves existing
  // link in the compose form, save clears it.
  link: string | null;
  updated_at: string;
}

export function MarketingDashboard() {
  // Lock down link composition for non-super admins so they can only send
  // links curated through saved templates. We read `isSuper` from effective
  // permissions (the swap-aware value), so a super admin previewing as a
  // lower role sees exactly what that role would experience. `realIsSuper`
  // would let the super always edit, defeating the preview's purpose.
  const { admin } = useAdminAuth();
  const canEditLink = admin?.isSuper ?? false;
  const [inputMode, setInputMode] = useState<'signups' | 'compose' | 'csv' | 'selected'>('signups');
  const [phones, setPhones] = useState('');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [csvRecipients, setCsvRecipients] = useState<Recipient[]>([]);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  // Recipients staged from a drill-in sheet elsewhere in /admin (e.g., Growth tab).
  // Loaded once on mount via consumeStagedRecipients() which also clears sessionStorage.
  const [stagedRecipients, setStagedRecipients] = useState<Recipient[]>([]);
  const [stagedPhonesWithThread, setStagedPhonesWithThread] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendResult[] | null>(null);
  const [summary, setSummary] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [openingThread, setOpeningThread] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editLink, setEditLink] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [newTemplateLabel, setNewTemplateLabel] = useState('');
  // Quick Templates collapse state — persisted via localStorage. Defaults to
  // collapsed to keep the outreach page focused; expand to save/load templates.
  const [templatesCollapsed, setTemplatesCollapsed] = useState(true);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('admin_marketing_templates_collapsed');
      if (raw !== null) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTemplatesCollapsed(raw === '1');
      }
    } catch { /* ignore */ }
  }, []);
  const toggleTemplatesCollapsed = () => {
    setTemplatesCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('admin_marketing_templates_collapsed', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Load templates from DB on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/marketing/templates');
        if (!res.ok || cancelled) return;
        const data = await res.json() as { templates: Template[] };
        if (!cancelled) setTemplates(data.templates);
      } catch { /* keep list empty on failure */ }
      finally { if (!cancelled) setTemplatesLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const startEditTemplate = (t: Template) => {
    setEditingTemplateId(t.id);
    setEditLabel(t.label);
    setEditBody(t.body);
    setEditLink(t.link ?? '');
  };

  const cancelEditTemplate = () => {
    setEditingTemplateId(null);
    setEditLabel('');
    setEditBody('');
    setEditLink('');
  };

  const saveEditTemplate = async () => {
    if (!editingTemplateId) return;
    if (!editLabel.trim() || !editBody.trim()) { alert('Label and message both required'); return; }
    setSavingTemplate(true);
    try {
      const res = await fetch(`/api/admin/marketing/templates/${editingTemplateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: editLabel.trim(),
          body: editBody.trim(),
          // Empty string clears the saved link; the API normalizes both
          // empty and null to NULL on the row.
          link: editLink.trim() || null,
        }),
      });
      if (!res.ok) { const err = await res.json(); alert(`Save failed: ${err.error}`); return; }
      const { template } = await res.json() as { template: Template };
      setTemplates((prev) => prev.map((t) => t.id === template.id ? template : t));
      cancelEditTemplate();
    } finally {
      setSavingTemplate(false);
    }
  };

  const deleteTemplate = async (id: string, label: string) => {
    if (!confirm(`Delete template "${label}"?`)) return;
    const res = await fetch(`/api/admin/marketing/templates/${id}`, { method: 'DELETE' });
    if (!res.ok) { const err = await res.json(); alert(`Delete failed: ${err.error}`); return; }
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  // Save the current Message field as a new template.
  const saveCurrentAsTemplate = async () => {
    const body = message.trim();
    if (!body) { alert('Type a message first, then save it as a template'); return; }
    const label = newTemplateLabel.trim();
    if (!label) { alert('Give the template a short label'); return; }
    setCreatingTemplate(true);
    try {
      const res = await fetch('/api/admin/marketing/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Link is optional — only persist what's actually in the field.
        body: JSON.stringify({ label, body, link: link.trim() || null }),
      });
      if (!res.ok) { const err = await res.json(); alert(`Save failed: ${err.error}`); return; }
      const { template } = await res.json() as { template: Template };
      setTemplates((prev) => [template, ...prev]);
      setNewTemplateLabel('');
    } finally {
      setCreatingTemplate(false);
    }
  };

  // On mount, check for recipients staged from a drill-in sheet. If present,
  // auto-switch to the Selected mode so the admin sees them immediately.
  useEffect(() => {
    const staged = consumeStagedRecipients();
    if (staged.length > 0) {
      setStagedRecipients(staged.map((r) => ({
        phone: r.phone,
        name: r.name,
        userId: r.userId,
        profileType: r.profileType,
      })));
      setInputMode('selected');
    }
  }, []);

  // Prefetch which staged phones have existing SMS history so the Thread
  // button shows a dot on rows that will deep-link vs start a fresh compose.
  useEffect(() => {
    const phones = stagedRecipients.map((r) => r.phone).filter(Boolean);
    if (phones.length === 0) { setStagedPhonesWithThread(new Set()); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/messages/has-threads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phones }),
        });
        if (!res.ok || cancelled) return;
        const data = await res.json() as { withThreads?: string[] };
        if (cancelled) return;
        setStagedPhonesWithThread(new Set(data.withThreads ?? []));
      } catch { /* dot stays off */ }
    })();
    return () => { cancelled = true; };
  }, [stagedRecipients]);

  const stagedHasThread = (phone: string): boolean =>
    stagedPhonesWithThread.has(phone.replace(/\D/g, ''));

  const hasMessage = message.trim().length > 0;
  const hasLink = link.trim().length > 0;
  const smsCount = (hasMessage ? 1 : 0) + (hasLink ? 1 : 0);

  // Switch to the Enter Numbers tab and prefill the textarea with the given
  // phones. Used by the Thread buttons in RecentSignups + the Selected panel
  // when no existing conversation exists for the selection.
  const prefillCompose = (numbers: string[]) => {
    const cleaned = Array.from(new Set(numbers.map((n) => n.trim()).filter(Boolean)));
    if (!cleaned.length) return;
    setPhones(cleaned.join('\n'));
    setInputMode('compose');
    setResults(null);
    setSummary(null);
  };

  // For the Selected drill-in panel: jump to the existing thread if there's
  // exactly one recipient with SMS history, otherwise prefill compose with
  // every staged number.
  const openSelectedThreadOrCompose = async (phones: string[]) => {
    if (openingThread) return;
    setOpeningThread(true);
    try {
      await openThreadOrCompose(phones, { router, prefillCompose });
    } finally {
      setOpeningThread(false);
    }
  };

  const parsePhones = (): Recipient[] => {
    return phones.split(/[\n,;]+/).map((p) => p.trim()).filter(Boolean).map((p) => ({ phone: p }));
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter((l) => l.trim());
      if (lines.length < 2) return;
      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));
      setCsvColumns(headers);
      const phoneCol = headers.findIndex((h) => ['sms', 'phone', 'phone_number', 'mobile', 'cell', 'number'].includes(h));
      const nameCol = headers.findIndex((h) => ['fb name', 'fb_name', 'fbname', 'name', 'first_name', 'full_name'].includes(h));
      const sexCol = headers.findIndex((h) => ['sex', 'gender'].includes(h));
      const issueCol = headers.findIndex((h) => ['issue', 'pain_point', 'pain point', 'reason', 'category'].includes(h));
      if (phoneCol === -1) { alert('CSV must have a column named "sms", "phone", or "number"'); return; }
      const recipients: Recipient[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        const phone = cols[phoneCol]?.trim();
        if (!phone) continue;
        const recipient: Recipient = { phone };
        if (nameCol !== -1) recipient.name = cols[nameCol]?.trim();
        if (sexCol !== -1) recipient.sex = cols[sexCol]?.trim();
        if (issueCol !== -1) recipient.issue = cols[issueCol]?.trim();
        recipient.fbName = nameCol !== -1 ? cols[nameCol]?.trim() : undefined;
        headers.forEach((h, idx) => { if (idx !== phoneCol && cols[idx]?.trim()) recipient[h] = cols[idx].trim(); });
        recipients.push(recipient);
      }
      setCsvRecipients(recipients);
    };
    reader.readAsText(file);
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) { result.push(current.replace(/^['"]|['"]$/g, '')); current = ''; }
      else current += char;
    }
    result.push(current.replace(/^['"]|['"]$/g, ''));
    return result;
  };

  const getRecipients = (): Recipient[] => {
    if (inputMode === 'csv') return csvRecipients;
    if (inputMode === 'selected') return stagedRecipients;
    return parsePhones();
  };

  const removeStaged = (phone: string) => {
    setStagedRecipients((prev) => prev.filter((r) => r.phone !== phone));
  };

  const handleSend = async () => {
    const recipients = getRecipients();
    if (!recipients.length) { alert('Add at least one phone number'); return; }
    if (!hasMessage && !hasLink) { alert('Enter a message, a link, or both'); return; }
    if (hasMessage && message.length > 160) { alert(`Message is ${message.length} chars (max 160)`); return; }
    if (hasLink && link.length > 160) { alert(`Link is ${link.length} chars (max 160)`); return; }

    const parts = [];
    if (hasMessage) parts.push(`Text: "${message}"`);
    if (hasLink) parts.push(`Link: ${link}`);
    if (!confirm(`Send ${smsCount} SMS${smsCount > 1 ? ' each' : ''} to ${recipients.length} number${recipients.length !== 1 ? 's' : ''}?\n\n${parts.join('\n')}`)) return;

    setSending(true);
    setResults(null);
    setSummary(null);

    try {
      // Pass userId when available (from the Selected mode) so the audit log
      // links the SMS to the recipient's Neon user_id without a phone lookup.
      const payload = recipients.map((r) => ({
        phone: r.phone,
        name: r.name,
        userId: r.userId,
      }));
      const res = await fetch('/api/admin/marketing/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients: payload, message: message.trim(), link: link.trim() || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data.results);
        setSummary({ sent: data.sent, failed: data.failed, total: data.total });
      } else {
        const err = await res.json();
        alert(`Failed: ${err.error}`);
      }
    } catch (err) {
      console.error('Send failed:', err);
      alert('Send failed — check console');
    } finally {
      setSending(false);
    }
  };

  const recipients = getRecipients();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Marketing SMS</h1>

      {/* Input Mode */}
      <div className="flex gap-2 flex-wrap">
        {(['signups', 'compose', 'csv', 'selected'] as const).map((t) => {
          // 'selected' tab only appears when there are staged recipients from a drill-in
          if (t === 'selected' && stagedRecipients.length === 0) return null;
          return (
            <button
              key={t}
              onClick={() => { setInputMode(t); setResults(null); setSummary(null); }}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                inputMode === t ? 'bg-white text-black' : 'bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white'
              }`}
            >
              {t === 'signups'
                ? 'New Signups'
                : t === 'csv'
                ? 'Upload CSV'
                : t === 'selected'
                ? `Selected (${stagedRecipients.length})`
                : 'Enter Numbers'}
            </button>
          );
        })}
      </div>

      {inputMode === 'signups' ? (
        <RecentSignups onPrefillCompose={prefillCompose} />
      ) : (
      <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Recipients */}
        <div className="space-y-4">
          {inputMode === 'selected' ? (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Selected from drill-in</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#00E676]">{stagedRecipients.length} recipient{stagedRecipients.length !== 1 ? 's' : ''}</span>
                  {stagedRecipients.length > 0 && (
                    <button
                      onClick={() => openSelectedThreadOrCompose(stagedRecipients.map((r) => r.phone))}
                      disabled={openingThread}
                      className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded bg-blue-500/15 border border-blue-500/30 text-blue-300 hover:bg-blue-500/25 disabled:opacity-50"
                      title={stagedRecipients.length === 1 ? 'Open existing thread or start one' : 'Prefill Enter Numbers with all selected phones'}
                    >
                      {openingThread ? '…' : stagedRecipients.length === 1 ? 'Thread' : `Thread (${stagedRecipients.length})`}
                    </button>
                  )}
                </div>
              </div>
              {stagedRecipients.length === 0 ? (
                <p className="text-xs text-neutral-500 py-4 text-center">
                  No recipients staged. Go to /admin/users → Growth tab → click a stat card → select users → Message.
                </p>
              ) : (
                <div className="max-h-80 overflow-y-auto space-y-1">
                  {stagedRecipients.map((r) => (
                    <div key={r.phone} className="flex items-center justify-between text-xs bg-neutral-800/50 rounded px-2 py-2 gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {r.profileType && (
                          <span className={`text-[10px] uppercase px-1 py-0.5 rounded shrink-0 ${
                            r.profileType === 'rider' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
                          }`}>
                            {r.profileType === 'rider' ? 'R' : 'D'}
                          </span>
                        )}
                        <span className="text-white truncate">{r.name || 'Unknown'}</span>
                        <span className="text-neutral-500 font-mono shrink-0">{r.phone}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {(() => {
                          const hasThread = stagedHasThread(r.phone);
                          return (
                            <button
                              onClick={() => openSelectedThreadOrCompose([r.phone])}
                              disabled={openingThread}
                              className={`text-[11px] font-medium px-2 py-0.5 rounded border disabled:opacity-50 inline-flex items-center gap-1 ${
                                hasThread
                                  ? 'border-blue-400/50 text-blue-200 bg-blue-500/15 hover:bg-blue-500/25'
                                  : 'border-transparent text-neutral-400 hover:text-blue-300 hover:border-blue-500/30'
                              }`}
                              title={hasThread ? 'Open existing thread' : 'Start a new thread'}
                            >
                              {hasThread && <span className="w-1.5 h-1.5 rounded-full bg-blue-300 shrink-0" aria-hidden />}
                              Thread
                            </button>
                          );
                        })()}
                        <button
                          onClick={() => removeStaged(r.phone)}
                          className="text-neutral-500 hover:text-red-400 text-sm px-1"
                          aria-label="Remove"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : inputMode === 'compose' ? (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-2">Phone Numbers</h3>
              <p className="text-xs text-neutral-500 mb-3">One per line, or comma separated</p>
              <textarea
                value={phones}
                onChange={(e) => setPhones(e.target.value)}
                placeholder={"4045551234\n4045559876\n4045554321"}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-3 text-sm text-white placeholder:text-neutral-600 resize-none h-40 font-mono"
              />
              <p className="text-xs text-neutral-500 mt-2">{parsePhones().length} number{parsePhones().length !== 1 ? 's' : ''}</p>
            </div>
          ) : (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-2">Upload CSV</h3>
              <p className="text-xs text-neutral-500 mb-3">Columns: <span className="text-neutral-400">fb name, sms, sex, issue</span> + any additional</p>
              <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-neutral-700 rounded-lg p-6 text-center hover:border-neutral-500 transition-colors"
              >
                <p className="text-sm text-neutral-400">Tap to upload CSV</p>
                <p className="text-xs text-neutral-600 mt-1">or drag & drop</p>
              </button>

              {csvRecipients.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-green-400">{csvRecipients.length} contacts loaded</p>
                    <button onClick={() => { setCsvRecipients([]); setCsvColumns([]); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="text-xs text-red-400 hover:text-red-300">Clear</button>
                  </div>
                  <div className="flex gap-1 flex-wrap mb-3">
                    {csvColumns.map((col) => (
                      <span key={col} className="text-[10px] px-2 py-0.5 rounded bg-neutral-800 text-neutral-400">{col}</span>
                    ))}
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {csvRecipients.slice(0, 20).map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-xs bg-neutral-800/50 rounded px-2 py-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-white font-mono shrink-0">{r.phone}</span>
                          {r.name && <span className="text-neutral-400 truncate">{r.name}</span>}
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          {r.sex && <span className="text-[10px] px-1 py-0.5 rounded bg-neutral-700 text-neutral-400">{r.sex}</span>}
                          {r.issue && (
                            <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${
                              r.issue.toLowerCase().includes('no show') ? 'bg-red-500/20 text-red-400' :
                              r.issue.toLowerCase().includes('safety') ? 'bg-yellow-500/20 text-yellow-400' :
                              r.issue.toLowerCase().includes('upfront') ? 'bg-blue-500/20 text-blue-400' :
                              r.issue.toLowerCase().includes('fee') ? 'bg-green-500/20 text-green-400' :
                              'bg-neutral-700 text-neutral-400'
                            }`}>{r.issue}</span>
                          )}
                        </div>
                      </div>
                    ))}
                    {csvRecipients.length > 20 && <p className="text-[10px] text-neutral-600 text-center py-1">+ {csvRecipients.length - 20} more</p>}
                  </div>
                  {csvRecipients.some((r) => r.issue) && (
                    <div className="mt-3 pt-3 border-t border-neutral-800">
                      <p className="text-[10px] text-neutral-500 mb-1">Issues breakdown</p>
                      <div className="flex gap-2 flex-wrap">
                        {Object.entries(csvRecipients.reduce((acc, r) => { if (r.issue) acc[r.issue] = (acc[r.issue] || 0) + 1; return acc; }, {} as Record<string, number>)).map(([issue, count]) => (
                          <span key={issue} className="text-[10px] px-2 py-0.5 rounded bg-neutral-800 text-neutral-400">{issue}: {count}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Message + Link + UTM + Templates */}
        <div className="space-y-4">
          {/* Message Body */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-2">Message</h3>
            <p className="text-xs text-neutral-500 mb-3">
              Use <span className="text-neutral-300 font-mono">{'{name}'}</span> to personalize. Link is appended automatically.
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 160))}
              maxLength={160}
              placeholder="Type your message here... (optional if link is set)"
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-3 text-sm text-white placeholder:text-neutral-600 resize-none h-24"
            />

            {/* Link field */}
            <div className="mt-3">
              <label className="text-[10px] text-neutral-500 uppercase tracking-wide block mb-1">
                Link (appended after message)
                {!canEditLink && (
                  <span className="ml-2 normal-case tracking-normal text-amber-400/80">
                    · super-admin managed
                  </span>
                )}
              </label>
              <input
                type="text"
                value={link}
                onChange={(e) => { if (canEditLink) setLink(e.target.value); }}
                readOnly={!canEditLink}
                placeholder={canEditLink ? 'atl.hmucashride.com' : 'Pick a saved template to set the link'}
                title={canEditLink ? undefined : 'Only super admins can compose custom links. Use a saved template instead.'}
                aria-readonly={!canEditLink}
                className={
                  'w-full bg-neutral-800 border rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600 font-mono ' +
                  (canEditLink
                    ? 'border-neutral-700'
                    : 'border-neutral-800 cursor-not-allowed opacity-80')
                }
              />
              {!canEditLink && (
                <p className="text-[11px] text-neutral-500 mt-1.5 leading-snug">
                  Outreach links are locked. Tap a saved template below to populate the link super admins approved.
                </p>
              )}
            </div>

            {/* Preview */}
            <div className="mt-3 pt-3 border-t border-neutral-800">
              <label className="text-[10px] text-neutral-500 uppercase tracking-wide block mb-1">SMS Preview ({smsCount} message{smsCount !== 1 ? 's' : ''} per recipient)</label>
              <div className="space-y-2">
                {hasMessage && (
                  <div className={`bg-neutral-800 rounded-lg p-3 text-sm break-all ${message.length > 160 ? 'border border-red-500/50' : 'border border-neutral-700'}`}>
                    <p className="text-[10px] text-neutral-500 mb-1">SMS 1: Text</p>
                    <span className="text-white">{message}</span>
                    <p className={`text-[10px] mt-1 ${message.length > 160 ? 'text-red-400' : message.length > 140 ? 'text-yellow-400' : 'text-neutral-600'}`}>
                      {message.length}/160
                    </p>
                  </div>
                )}
                {hasLink && (
                  <div className={`bg-neutral-800 rounded-lg p-3 text-sm break-all ${link.length > 160 ? 'border border-red-500/50' : 'border border-neutral-700'}`}>
                    <p className="text-[10px] text-neutral-500 mb-1">SMS {hasMessage ? '2' : '1'}: Link</p>
                    <span className="text-green-400">{link}</span>
                    <p className={`text-[10px] mt-1 ${link.length > 160 ? 'text-red-400' : link.length > 140 ? 'text-yellow-400' : 'text-neutral-600'}`}>
                      {link.length}/160
                    </p>
                  </div>
                )}
                {!hasMessage && !hasLink && (
                  <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-3 text-sm text-neutral-600">
                    Enter a message, a link, or both...
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Templates — moved above UTM since it's the more frequently used helper */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <button
              type="button"
              onClick={toggleTemplatesCollapsed}
              className="w-full flex items-center justify-between gap-3 hover:bg-neutral-800/40 active:bg-neutral-800/60 rounded-lg px-2 py-2 -mx-2 -my-2 transition-colors"
              aria-expanded={!templatesCollapsed}
            >
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold">Quick Templates</h3>
                <span className="text-[10px] text-neutral-500 px-1.5 py-0.5 rounded bg-neutral-800">{templates.length} saved</span>
              </div>
              <span
                aria-hidden
                className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-200 text-base font-bold shrink-0"
                style={{ transform: templatesCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 150ms' }}
              >
                ▾
              </span>
            </button>

            {templatesCollapsed && (
              <p className="text-[11px] text-neutral-600 mt-2">Click ▾ above to save and reuse messages.</p>
            )}

            <div className={templatesCollapsed ? 'hidden' : 'mt-3'}>

            {/* Save current message as template */}
            <div className="mb-3 pb-3 border-b border-neutral-800">
              <label className="text-[10px] text-neutral-500 uppercase tracking-wide block mb-1">
                Save current message as template
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTemplateLabel}
                  onChange={(e) => setNewTemplateLabel(e.target.value.slice(0, 80))}
                  placeholder="Short label (e.g. Driver Recruitment)"
                  maxLength={80}
                  className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600"
                />
                <button
                  onClick={saveCurrentAsTemplate}
                  disabled={creatingTemplate || !message.trim() || !newTemplateLabel.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-700 disabled:text-neutral-500 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                  title={!message.trim() ? 'Type a message above first' : 'Save as new template'}
                >
                  {creatingTemplate ? '…' : 'Save'}
                </button>
              </div>
              <p className="text-[10px] text-neutral-600 mt-1">
                Saves the Message field {link.trim() ? <>+ Link <span className="text-blue-300">({link.trim().slice(0, 40)}{link.trim().length > 40 ? '…' : ''})</span></> : <span className="text-neutral-500">(no link to save)</span>}.
              </p>
            </div>

            {templatesLoading ? (
              <p className="text-[11px] text-neutral-500 text-center py-4">Loading…</p>
            ) : templates.length === 0 ? (
              <p className="text-[11px] text-neutral-500 text-center py-4">No templates yet. Save your first one above.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {templates.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    className="bg-neutral-800/50 border border-neutral-800 rounded-lg p-3"
                  >
                    {editingTemplateId === tmpl.id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value.slice(0, 80))}
                          maxLength={80}
                          className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-xs text-white"
                          placeholder="Label"
                        />
                        <textarea
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value.slice(0, 160))}
                          maxLength={160}
                          rows={3}
                          className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-xs text-white resize-none"
                          placeholder="Message body (max 160 chars)"
                        />
                        <input
                          type="text"
                          value={editLink}
                          onChange={(e) => { if (canEditLink) setEditLink(e.target.value.slice(0, 500)); }}
                          readOnly={!canEditLink}
                          maxLength={500}
                          className={
                            'w-full bg-neutral-900 border rounded px-2 py-1.5 text-xs text-white ' +
                            (canEditLink ? 'border-neutral-700' : 'border-neutral-800 cursor-not-allowed opacity-80')
                          }
                          placeholder={canEditLink ? 'Link (optional) — paste a UTM-built URL' : 'Link (super-admin managed)'}
                          title={canEditLink ? undefined : 'Only super admins can change the saved link on a template.'}
                          aria-readonly={!canEditLink}
                        />
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] ${editBody.length > 140 ? 'text-yellow-400' : 'text-neutral-600'}`}>
                            {editBody.length}/160
                          </span>
                          <div className="flex gap-1">
                            <button
                              onClick={cancelEditTemplate}
                              disabled={savingTemplate}
                              className="text-[11px] px-2 py-1 rounded text-neutral-400 hover:text-white"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={saveEditTemplate}
                              disabled={savingTemplate}
                              className="text-[11px] px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-700 text-white font-medium"
                            >
                              {savingTemplate ? '…' : 'Save'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <button
                            onClick={() => {
                              setMessage(tmpl.body);
                              // Auto-fill the link field too. If the template
                              // doesn't have a saved link we leave whatever the
                              // admin already typed alone — so an existing
                              // composed link isn't wiped by a link-less template.
                              if (tmpl.link) setLink(tmpl.link);
                            }}
                            className="flex-1 text-left min-w-0"
                            title={tmpl.link ? 'Use this template (fills message + link)' : 'Use this template'}
                          >
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-medium text-neutral-300 truncate">{tmpl.label}</p>
                              {tmpl.link && (
                                <span
                                  className="text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 shrink-0"
                                  title={tmpl.link}
                                >
                                  link
                                </span>
                              )}
                            </div>
                          </button>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] text-neutral-600">{tmpl.body.length}</span>
                            <button
                              onClick={() => startEditTemplate(tmpl)}
                              className="text-[10px] px-1.5 py-0.5 rounded text-neutral-400 hover:text-white hover:bg-neutral-700"
                              title="Edit template"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteTemplate(tmpl.id, tmpl.label)}
                              className="text-[10px] px-1.5 py-0.5 rounded text-neutral-400 hover:text-red-400 hover:bg-neutral-700"
                              title="Delete template"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        <button
                          onClick={() => setMessage(tmpl.body)}
                          className="w-full text-left mt-1"
                          title="Use this template"
                        >
                          <p className="text-[11px] text-neutral-500 line-clamp-2">{tmpl.body}</p>
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>

          {/* UTM Link Builder — super-admin only. Non-super admins should
              only send links curated via saved templates, so the builder
              (and its "Use this Link" button) is hidden entirely. The link
              input above is also read-only for them. */}
          {canEditLink && <UtmBuilder onInsert={(url) => setLink(url)} />}
        </div>
      </div>

      {/* Send Button */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSend}
          disabled={sending || (!hasMessage && !hasLink) || recipients.length === 0 || message.length > 160 || link.length > 160}
          className="bg-green-600 hover:bg-green-700 disabled:bg-neutral-700 disabled:text-neutral-500 text-white text-sm font-semibold px-6 py-3 rounded-lg transition-colors"
        >
          {sending ? `Sending...` : `Send to ${recipients.length} number${recipients.length !== 1 ? 's' : ''}`}
        </button>
        {recipients.length > 0 && (hasMessage || hasLink) && (
          <p className="text-xs text-neutral-500">
            {smsCount} SMS x {recipients.length} = {smsCount * recipients.length} messages (~${(smsCount * recipients.length * 0.0075).toFixed(2)})
          </p>
        )}
      </div>

      {/* Results */}
      {summary && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">Send Results</h3>
          <div className="flex gap-4 mb-4">
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-2 text-center">
              <p className="text-lg font-bold text-green-400">{summary.sent}</p>
              <p className="text-[10px] text-green-400/70">Sent</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-center">
              <p className="text-lg font-bold text-red-400">{summary.failed}</p>
              <p className="text-[10px] text-red-400/70">Failed</p>
            </div>
            <div className="bg-neutral-800 rounded-lg px-4 py-2 text-center">
              <p className="text-lg font-bold text-white">{summary.total}</p>
              <p className="text-[10px] text-neutral-500">Total</p>
            </div>
          </div>
          {results && results.length > 0 && (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {results.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-neutral-800/50 rounded px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${r.status === 'sent' ? 'bg-green-500' : r.status === 'skipped' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                    <span className="text-white font-mono">{r.phone}</span>
                    {r.name && <span className="text-neutral-500">{r.name}</span>}
                  </div>
                  <span className={`text-[10px] ${r.status === 'sent' ? 'text-green-400' : r.status === 'skipped' ? 'text-yellow-400' : 'text-red-400'}`}>
                    {r.status}{r.error ? `: ${r.error}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}
