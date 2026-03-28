'use client';

import { useState, useRef } from 'react';
import { UtmBuilder } from './utm-builder';

interface Recipient {
  phone: string;
  name?: string;
  sex?: string;
  issue?: string;
  fbName?: string;
  [key: string]: string | undefined;
}

interface SendResult {
  phone: string;
  name?: string;
  status: string;
  error?: string;
}

const MESSAGE_TEMPLATES = [
  { label: 'General Signup', text: 'Ride scammers hate HMU. Payment held BEFORE driver pulls up. Drivers get paid. Riders get rides. Sign up free' },
  { label: 'Driver Recruitment', text: 'Drive with HMU ATL. Set your price, get paid upfront, keep 90%. No apps or background checks. Go live now' },
  { label: 'Rider Invite', text: 'Need a ride in ATL? HMU connects you with local drivers. Cheaper than Uber, no surge. Try it free' },
  { label: 'No-Show Pain Point', text: 'Tired of riders going ghost? HMU ATL = riders pay BEFORE you drive. No payment, no ride. Stop wasting gas' },
  { label: 'Safety Focused', text: 'HMU ATL: GPS tracked, verified payments, real ratings. Safer than FB cash ride groups. Sign up' },
  { label: 'Platform Fees', text: 'Uber takes 40%. HMU? 10% on first $50/day, capped at $40. Hit the cap = rest is ALL yours' },
  { label: 'Upfront Pay', text: 'How drivers know before they go. HMU holds fare in escrow before you leave the house. Get paid every time' },
];

export function MarketingDashboard() {
  const [inputMode, setInputMode] = useState<'compose' | 'csv'>('compose');
  const [phones, setPhones] = useState('');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [csvRecipients, setCsvRecipients] = useState<Recipient[]>([]);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendResult[] | null>(null);
  const [summary, setSummary] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasMessage = message.trim().length > 0;
  const hasLink = link.trim().length > 0;
  const smsCount = (hasMessage ? 1 : 0) + (hasLink ? 1 : 0);

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

  const getRecipients = (): Recipient[] => inputMode === 'csv' ? csvRecipients : parsePhones();

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
      const res = await fetch('/api/admin/marketing/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients, message: message.trim(), link: link.trim() || undefined }),
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
      <div className="flex gap-2">
        {(['compose', 'csv'] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setInputMode(t); setResults(null); setSummary(null); }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              inputMode === t ? 'bg-white text-black' : 'bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white'
            }`}
          >
            {t === 'csv' ? 'Upload CSV' : 'Enter Numbers'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Recipients */}
        <div className="space-y-4">
          {inputMode === 'compose' ? (
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
              <label className="text-[10px] text-neutral-500 uppercase tracking-wide block mb-1">Link (appended after message)</label>
              <input
                type="text"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="atl.hmucashride.com"
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600 font-mono"
              />
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

          {/* UTM Link Builder */}
          <UtmBuilder onInsert={(url) => setLink(url)} />

          {/* Templates */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">Quick Templates</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {MESSAGE_TEMPLATES.map((tmpl, i) => (
                <button
                  key={i}
                  onClick={() => setMessage(tmpl.text)}
                  className="w-full text-left bg-neutral-800/50 border border-neutral-800 rounded-lg p-3 hover:border-neutral-600 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-neutral-300">{tmpl.label}</p>
                    <span className="text-[10px] text-neutral-600">{tmpl.text.length} chars</span>
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-1 line-clamp-2">{tmpl.text}</p>
                </button>
              ))}
            </div>
          </div>
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
    </div>
  );
}
