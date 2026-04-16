'use client';

/**
 * Zone-type-specific editors — no JSON editing.
 * Renders friendly form fields based on zone_type and content structure.
 */

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

// Text input with char counter
function TextEditor({ value, maxChars, onChange }: { value: string; maxChars?: number; onChange: (v: string) => void }) {
  return (
    <div>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
      {maxChars && (
        <div style={{
          fontSize: 10, textAlign: 'right', marginTop: 2,
          color: (value?.length || 0) > maxChars ? '#FF5252' : 'var(--admin-text-faint)',
        }}>
          {value?.length || 0} / {maxChars}
        </div>
      )}
    </div>
  );
}

// Rich text textarea
function RichTextEditor({ value, maxChars, onChange }: { value: string; maxChars?: number; onChange: (v: string) => void }) {
  return (
    <div>
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        style={textareaStyle}
      />
      <div style={{ fontSize: 9, color: 'var(--admin-text-faint)', marginTop: 2 }}>
        Supports &lt;strong&gt;, &lt;em&gt;, &lt;br /&gt;
        {maxChars && ` • ${value?.length || 0} / ${maxChars}`}
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
