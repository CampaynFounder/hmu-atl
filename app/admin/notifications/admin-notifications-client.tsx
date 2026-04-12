'use client';

import { useEffect, useState } from 'react';

interface NotifConfig {
  type: string;
  enabled: boolean;
  adminPhone: string | null;
  excludedUserIds: string[];
  updatedAt: string;
}

const TYPE_LABELS: Record<string, { label: string; description: string; emoji: string }> = {
  new_driver_signup: {
    label: 'New Driver Signup',
    description: 'SMS when a new driver completes phone verification',
    emoji: '🚗',
  },
  new_rider_signup: {
    label: 'New Rider Signup',
    description: 'SMS when a new rider completes phone verification',
    emoji: '🧑',
  },
};

export default function AdminNotificationsClient() {
  const [configs, setConfigs] = useState<NotifConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [excludeInput, setExcludeInput] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/notifications')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.configs) {
          setConfigs(data.configs);
          // Set phone from first config that has one
          const withPhone = data.configs.find((c: NotifConfig) => c.adminPhone);
          if (withPhone) setPhoneInput(withPhone.adminPhone);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function updateConfig(type: string, updates: Partial<NotifConfig>) {
    setSaving(type);
    try {
      const res = await fetch('/api/admin/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, ...updates }),
      });
      if (res.ok) {
        setConfigs(prev => prev.map(c =>
          c.type === type ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c
        ));
        setToast('Saved');
        setTimeout(() => setToast(null), 2000);
      }
    } catch { /* silent */ }
    setSaving(null);
  }

  async function savePhone() {
    const phone = phoneInput.replace(/\D/g, '');
    if (phone.length < 10) { setToast('Enter a valid phone number'); setTimeout(() => setToast(null), 3000); return; }
    const formatted = phone.length === 10 ? `1${phone}` : phone;
    // Update all configs with this phone
    for (const c of configs) {
      await updateConfig(c.type, { adminPhone: formatted });
    }
  }

  async function addExclusion(type: string) {
    const id = excludeInput.trim();
    if (!id) return;
    const config = configs.find(c => c.type === type);
    if (!config) return;
    const updated = [...new Set([...config.excludedUserIds, id])];
    await updateConfig(type, { excludedUserIds: updated });
    setExcludeInput('');
  }

  async function removeExclusion(type: string, id: string) {
    const config = configs.find(c => c.type === type);
    if (!config) return;
    const updated = config.excludedUserIds.filter(e => e !== id);
    await updateConfig(type, { excludedUserIds: updated });
  }

  if (loading) {
    return <div className="p-6 text-neutral-500 text-sm">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Notification Settings</h1>
        <p className="text-xs text-neutral-500 mt-1">Configure SMS alerts for signups and ride events</p>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-neutral-800 border border-neutral-700 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* Admin phone */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <div className="text-sm font-semibold text-white mb-1">Admin Phone Number</div>
        <p className="text-xs text-neutral-500 mb-3">All notification SMS will be sent to this number</p>
        <div className="flex gap-2">
          <input
            type="tel"
            value={phoneInput}
            onChange={e => setPhoneInput(e.target.value)}
            placeholder="(404) 555-1234"
            className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-neutral-600 font-mono"
          />
          <button
            onClick={savePhone}
            disabled={saving !== null}
            className="px-4 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-sm font-medium disabled:opacity-50"
          >
            Save
          </button>
        </div>
        {configs[0]?.adminPhone && (
          <p className="text-[10px] text-neutral-600 mt-2 font-mono">
            Current: {configs[0].adminPhone}
          </p>
        )}
      </div>

      {/* Notification types */}
      {configs.map(config => {
        const info = TYPE_LABELS[config.type] || { label: config.type, description: '', emoji: '🔔' };
        return (
          <div key={config.type} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            {/* Header + toggle */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{info.emoji}</span>
                <div>
                  <div className="text-sm font-semibold text-white">{info.label}</div>
                  <div className="text-xs text-neutral-500">{info.description}</div>
                </div>
              </div>
              <button
                onClick={() => updateConfig(config.type, { enabled: !config.enabled })}
                disabled={saving === config.type}
                className="relative w-11 h-6 rounded-full transition-colors"
                style={{
                  background: config.enabled ? 'rgba(0,230,118,0.3)' : 'rgba(255,255,255,0.1)',
                }}
              >
                <span
                  className="absolute top-0.5 w-5 h-5 rounded-full transition-all shadow"
                  style={{
                    left: config.enabled ? '22px' : '2px',
                    background: config.enabled ? '#00E676' : '#666',
                  }}
                />
              </button>
            </div>

            {/* Exclusion list */}
            <div className="mt-3 pt-3 border-t border-neutral-800">
              <div className="text-xs font-medium text-neutral-400 mb-2">
                Excluded Users (test accounts)
              </div>
              {config.excludedUserIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {config.excludedUserIds.map(id => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-neutral-800 text-[10px] text-neutral-400 font-mono"
                    >
                      {id.length > 20 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id}
                      <button
                        onClick={() => removeExclusion(config.type, id)}
                        className="text-red-400 hover:text-red-300 ml-0.5"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={excludeInput}
                  onChange={e => setExcludeInput(e.target.value)}
                  placeholder="Clerk user ID (user_xxx...)"
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-neutral-600 font-mono"
                />
                <button
                  onClick={() => addExclusion(config.type)}
                  disabled={!excludeInput.trim() || saving === config.type}
                  className="px-3 py-1.5 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs font-medium disabled:opacity-50"
                >
                  Exclude
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
