'use client';

/**
 * Zone-type-specific editors — no JSON editing.
 * Renders friendly form fields based on zone_type and content structure.
 */

import { useState } from 'react';

interface ZoneEditorProps {
  zoneKey: string;
  zoneType: string;
  content: unknown;
  constraints?: { maxChars?: number };
  onChange: (value: unknown) => void;
}

export function ZoneEditor({ zoneKey, zoneType, content, constraints, onChange }: ZoneEditorProps) {
  if (zoneType === 'text') {
    return <TextEditor value={content as string} maxChars={constraints?.maxChars} onChange={onChange} />;
  }
  if (zoneType === 'rich_text') {
    return <RichTextEditor value={content as string} maxChars={constraints?.maxChars} onChange={onChange} />;
  }
  if (zoneType === 'json' || zoneType === 'step_list') {
    if (Array.isArray(content)) {
      return <ArrayEditor items={content} onChange={onChange} />;
    }
    if (typeof content === 'object' && content !== null) {
      return <ObjectEditor obj={content as Record<string, unknown>} onChange={onChange} />;
    }
  }
  // Fallback: JSON textarea
  return (
    <textarea
      value={typeof content === 'string' ? content : JSON.stringify(content, null, 2)}
      onChange={(e) => {
        try { onChange(JSON.parse(e.target.value)); } catch { onChange(e.target.value); }
      }}
      rows={4}
      style={textareaStyle}
    />
  );
}

// ── HTML Snippets Helper ──
const HTML_SNIPPETS = [
  { label: 'Bold', code: '<strong>text</strong>', preview: 'text' },
  { label: 'Green text', code: '<span style="color:var(--green)">text</span>', preview: 'text' },
  { label: 'Line break', code: '<br />', preview: '↵' },
  { label: 'Strikethrough', code: '<span style="text-decoration:line-through">text</span>', preview: 'text' },
  { label: 'Green strikethrough', code: '<span style="text-decoration:line-through;text-decoration-color:var(--green)">text</span>', preview: 'text' },
  { label: 'Faded text', code: '<span style="opacity:0.25">text</span>', preview: 'text' },
  { label: 'Italic', code: '<em>text</em>', preview: 'text' },
  { label: 'Small text', code: '<span style="font-size:0.8em">text</span>', preview: 'text' },
];

function HtmlSnippets() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  return (
    <div style={{ marginTop: 4 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          fontSize: 9, color: 'var(--admin-text-faint)', background: 'none', border: 'none',
          cursor: 'pointer', textDecoration: 'underline', padding: 0,
        }}
      >
        {open ? 'Hide' : 'Show'} HTML snippets
      </button>
      {open && (
        <div style={{
          marginTop: 6, padding: '10px 12px', borderRadius: 8,
          background: 'var(--admin-bg)', border: '1px solid var(--admin-border)',
          display: 'grid', gap: 4,
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--admin-text-faint)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>
            Tap to copy
          </div>
          {HTML_SNIPPETS.map((s) => (
            <button
              key={s.label}
              onClick={() => copy(s.code)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '5px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
                background: copied === s.code ? 'rgba(0,230,118,0.1)' : 'var(--admin-bg-active)',
                textAlign: 'left', width: '100%',
              }}
            >
              <span style={{ fontSize: 11, color: 'var(--admin-text-secondary)', fontWeight: 500 }}>{s.label}</span>
              <code style={{
                fontSize: 10, color: copied === s.code ? '#00E676' : 'var(--admin-text-muted)',
                fontFamily: 'monospace', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {copied === s.code ? '✓ Copied' : s.code}
              </code>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Text input with char counter + HTML snippets
function TextEditor({ value, maxChars, onChange }: { value: string; maxChars?: number; onChange: (v: string) => void }) {
  return (
    <div>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <HtmlSnippets />
        {maxChars && (
          <div style={{
            fontSize: 10, marginTop: 4,
            color: (value?.length || 0) > maxChars ? '#FF5252' : 'var(--admin-text-faint)',
          }}>
            {value?.length || 0} / {maxChars}
          </div>
        )}
      </div>
    </div>
  );
}

// Rich text textarea + HTML snippets
function RichTextEditor({ value, maxChars, onChange }: { value: string; maxChars?: number; onChange: (v: string) => void }) {
  return (
    <div>
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        style={textareaStyle}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <HtmlSnippets />
        {maxChars && (
          <div style={{ fontSize: 10, color: 'var(--admin-text-faint)', marginTop: 4 }}>
            {value?.length || 0} / {maxChars}
          </div>
        )}
      </div>
    </div>
  );
}

// Array of objects editor — renders each item as a card with labeled inputs
function ArrayEditor({ items, onChange }: { items: unknown[]; onChange: (v: unknown[]) => void }) {
  if (items.length === 0) return <div style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>Empty list</div>;

  const firstItem = items[0];
  if (typeof firstItem !== 'object' || firstItem === null) {
    // Array of strings
    return (
      <div style={{ display: 'grid', gap: 6 }}>
        {(items as string[]).map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--admin-text-faint)', width: 20, textAlign: 'right' }}>{i + 1}</span>
            <input
              type="text"
              value={item}
              onChange={(e) => {
                const next = [...items] as string[];
                next[i] = e.target.value;
                onChange(next);
              }}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              style={removeBtnStyle}
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange([...items, ''])}
          style={addBtnStyle}
        >
          + Add item
        </button>
      </div>
    );
  }

  // Array of objects
  const fields = Object.keys(firstItem as Record<string, unknown>);

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {items.map((item, i) => {
        const obj = item as Record<string, unknown>;
        return (
          <div key={i} style={{
            padding: '12px 14px', borderRadius: 8,
            background: 'var(--admin-bg)', border: '1px solid var(--admin-border)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--admin-text-faint)', letterSpacing: 1 }}>
                ITEM {i + 1}
              </span>
              <button
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                style={removeBtnStyle}
              >
                Remove
              </button>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {fields.map((field) => (
                <div key={field}>
                  <label style={labelStyle}>{field}</label>
                  {typeof obj[field] === 'boolean' ? (
                    <input
                      type="checkbox"
                      checked={obj[field] as boolean}
                      onChange={(e) => {
                        const next = [...items];
                        next[i] = { ...obj, [field]: e.target.checked };
                        onChange(next);
                      }}
                    />
                  ) : (String(obj[field] || '').length > 80) ? (
                    <textarea
                      value={String(obj[field] || '')}
                      onChange={(e) => {
                        const next = [...items];
                        next[i] = { ...obj, [field]: e.target.value };
                        onChange(next);
                      }}
                      rows={2}
                      style={textareaStyle}
                    />
                  ) : (
                    <input
                      type="text"
                      value={String(obj[field] || '')}
                      onChange={(e) => {
                        const next = [...items];
                        next[i] = { ...obj, [field]: e.target.value };
                        onChange(next);
                      }}
                      style={inputStyle}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <button
        onClick={() => {
          const template: Record<string, unknown> = {};
          fields.forEach((f) => { template[f] = ''; });
          onChange([...items, template]);
        }}
        style={addBtnStyle}
      >
        + Add item
      </button>
    </div>
  );
}

// Single object editor
function ObjectEditor({ obj, onChange }: { obj: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const fields = Object.keys(obj);
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {fields.map((field) => (
        <div key={field}>
          <label style={labelStyle}>{field}</label>
          {(String(obj[field] || '').length > 80) ? (
            <textarea
              value={String(obj[field] || '')}
              onChange={(e) => onChange({ ...obj, [field]: e.target.value })}
              rows={2}
              style={textareaStyle}
            />
          ) : (
            <input
              type="text"
              value={String(obj[field] || '')}
              onChange={(e) => onChange({ ...obj, [field]: e.target.value })}
              style={inputStyle}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// Shared styles
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 13,
  background: 'var(--admin-bg)', border: '1px solid var(--admin-border)',
  color: 'var(--admin-text)', lineHeight: 1.4,
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle, resize: 'vertical', fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--admin-text-muted)',
  marginBottom: 2, textTransform: 'capitalize',
};

const removeBtnStyle: React.CSSProperties = {
  padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
  background: 'transparent', color: '#FF5252',
  border: '1px solid rgba(255,82,82,0.2)', cursor: 'pointer',
};

const addBtnStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
  background: 'var(--admin-bg-active)', color: 'var(--admin-text)',
  border: '1px solid var(--admin-border)', cursor: 'pointer', width: 'fit-content',
};
