// Mobile Super Admin Sheet — slide-up panel gated by isSuperAdmin.
// Triggered by long-pressing the profile identity card in rider/driver profiles.
// All sections call real admin APIs. The AI section feeds app data to GPT-4o-mini.

/** Safely parse a Postgres timestamp ("2026-05-28 16:36:35.123" or ISO) to ms. */
function parseTs(raw: string | null | undefined): number {
  if (!raw) return 0;
  // Postgres returns "YYYY-MM-DD HH:MM:SS[.ms][+tz]" — normalise the space to T
  // so every JS engine treats it as valid ISO 8601.
  const iso = String(raw).trim().replace(' ', 'T');
  // Append Z only when there is no existing offset (no +, no trailing Z)
  const withTz = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
  const ms = Date.parse(withTz);
  return Number.isNaN(ms) ? 0 : ms;
}

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView,
  Animated, PanResponder, ActivityIndicator, TextInput, Switch,
  FlatList, Pressable, Dimensions, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient, API_BASE } from '@/lib/api';
import * as Haptics from 'expo-haptics';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_H = SCREEN_H * 0.88;

// ── Design helpers ────────────────────────────────────────────────────────────

const G = colors.green;

function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <View style={[sc.card, accent && sc.cardAccent]}>
      <Text style={[sc.val, accent && { color: G }]}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
      {sub && <Text style={sc.sub}>{sub}</Text>}
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={sc.sectionHdr}>{title}</Text>;
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
      <Ionicons name="file-tray-outline" size={32} color={colors.textFaint} />
      <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint, letterSpacing: 1 }}>
        {msg}
      </Text>
    </View>
  );
}

// ── Time / market filters ─────────────────────────────────────────────────────

const TIME_OPTS = [
  { label: 'TODAY',    days: 1 },
  { label: 'WEEK',     days: 7 },
  { label: 'MONTH',    days: 30 },
  { label: 'ALL TIME', days: 0 },
] as const;

const MARKET_OPTS = ['all', 'atl', 'nola', 'bna', 'mem', 'tpa', 'mia', 'hou', 'dfw', 'clt'] as const;
type MarketSlug = typeof MARKET_OPTS[number];
type DayFilter = 0 | 1 | 7 | 30;

// ── SECTION: Activity ─────────────────────────────────────────────────────────

function ActivitySection({ days, market, token }: { days: DayFilter; market: MarketSlug; token: string | null }) {
  const [data, setData] = useState<{
    total: number; completed: number; cancelled: number;
    fulfillment_rate: number; avg_fare: number;
    rides?: { id: string; status: string; amount: number; pickup_address: string; dropoff_address: string; created_at: string }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await apiClient<{ rides: { id: string; status: string; price?: number; amount?: number; pickup_address?: string; dropoff_address?: string; createdAt?: string; created_at?: string; refCode?: string; marketId?: string }[] }>(
          '/admin/rides/history', token,
        );
        const cutoff = days === 0 ? 0 : Date.now() - days * 86_400_000;
        // Filter by time window client-side (server returns last 200 ordered by date).
        // days===0 = ALL TIME: cutoff is 0 so nothing is filtered out.
        // parseTs normalises Postgres "YYYY-MM-DD HH:MM:SS" to valid ISO 8601 so
        // Date.parse works correctly in every JS engine (space → T, append Z).
        const allRides = res.rides ?? [];
        const rides = allRides.filter(r => {
          if (cutoff === 0) return true; // ALL TIME — keep everything
          const ts = parseTs(r.createdAt ?? r.created_at);
          if (ts > 0 && ts < cutoff) return false;
          return true; // market filtering via marketId would need server-side; omit for now
        });
        const completed = rides.filter(r => r.status === 'completed' || r.status === 'ended').length;
        const cancelled = rides.filter(r => r.status === 'cancelled').length;
        const total = rides.length;
        const avg_fare = completed > 0
          ? rides.filter(r => r.status === 'completed' || r.status === 'ended')
              .reduce((s, r) => s + (r.price ?? r.amount ?? 0), 0) / completed
          : 0;
        setData({
          total, completed, cancelled,
          fulfillment_rate: total > 0 ? Math.round(completed / (completed + cancelled) * 100) : 0,
          avg_fare: Math.round(avg_fare * 100) / 100,
          rides: rides.map(r => ({
            id: r.id ?? '',
            status: r.status,
            amount: r.price ?? r.amount ?? 0,
            pickup_address: r.pickup_address ?? r.refCode ?? '',
            dropoff_address: r.dropoff_address ?? '',
            created_at: r.createdAt ?? r.created_at ?? '',
          })),
        });
      } catch { setData(null); }
      finally { setLoading(false); }
    }
    void load();
  }, [days, market, token]);

  if (loading) return <LoadingCard />;

  const STATUS_COLOR: Record<string, string> = {
    completed: colors.green, cancelled: colors.red, active: colors.blue,
    in_progress: colors.blue, matched: colors.amber, otw: colors.amber,
  };

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled">
      <View style={sc.statsGrid}>
        <StatCard label="TOTAL" value={String(data?.total ?? 0)} />
        <StatCard label="COMPLETED" value={String(data?.completed ?? 0)} accent />
        <StatCard label="CANCELLED" value={String(data?.cancelled ?? 0)} />
        <StatCard label="FILL RATE" value={`${data?.fulfillment_rate ?? 0}%`} sub={`$${(data?.avg_fare ?? 0).toFixed(2)} avg`} />
      </View>
      <SectionHeader title="RECENT RIDES" />
      {!data?.rides?.length
        ? <EmptyState msg="NO RIDES IN PERIOD" />
        : data.rides.slice(0, 20).map(r => (
          <View key={r.id} style={[sc.row, shadow.card]}>
            <View style={[sc.statusDot, { backgroundColor: STATUS_COLOR[r.status] ?? colors.textFaint }]} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={sc.rowTitle} numberOfLines={1}>{r.pickup_address ?? '—'}</Text>
              <Text style={sc.rowSub} numberOfLines={1}>{r.dropoff_address ?? '—'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Text style={[sc.tag, { color: STATUS_COLOR[r.status] ?? colors.textFaint }]}>
                {r.status.toUpperCase()}
              </Text>
              {(r.amount ?? 0) > 0 && (
                <Text style={sc.rowSub}>${r.amount}</Text>
              )}
            </View>
          </View>
        ))
      }
    </ScrollView>
  );
}

// ── SECTION: Revenue ──────────────────────────────────────────────────────────

// ── Deposit lever editor ─────────────────────────────────────────────────────

function DepositLevers({
  modes, token, onSaved,
}: { modes: { id: string; modeKey: string; config: Record<string, unknown> | null }[]; token: string | null; onSaved: (m: PricingMode[]) => void }) {
  const depositMode = modes.find(m => m.modeKey === 'deposit_only');
  const cfg = (depositMode?.config ?? {}) as Record<string, number | string>;

  const [vals, setVals] = useState({
    depositMin:          String(cfg.depositMin          ?? 5),
    depositIncrement:    String(cfg.depositIncrement    ?? 5),
    depositMaxPctOfFare: String(Number((cfg.depositMaxPctOfFare ?? 0.5)) * 100), // stored as 0-1, display as %
    feePercent:          String(Number((cfg.feePercent  ?? 0.10)) * 100),         // stored as 0-1, display as %
    feeFloorCents:       String(Number((cfg.feeFloorCents ?? 100)) / 100),        // stored as cents, display as $
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true); setErr(null);
    try {
      const config = {
        ...(depositMode?.config ?? {}),
        depositMin:          Number(vals.depositMin),
        depositIncrement:    Number(vals.depositIncrement),
        depositMaxPctOfFare: Number(vals.depositMaxPctOfFare) / 100,
        feePercent:          Number(vals.feePercent) / 100,
        feeFloorCents:       Math.round(Number(vals.feeFloorCents) * 100),
      };
      await apiClient('/admin/pricing-modes', token, {
        method: 'PATCH',
        body: JSON.stringify({ modeKey: 'deposit_only', config }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setErr((e as { message?: string }).message ?? 'Save failed');
    } finally { setSaving(false); }
  }

  if (!depositMode) return null;

  const FIELDS: { key: keyof typeof vals; label: string; suffix: string }[] = [
    { key: 'depositMin',          label: 'MIN DEPOSIT',       suffix: '$' },
    { key: 'depositIncrement',    label: 'INCREMENT',         suffix: '$' },
    { key: 'depositMaxPctOfFare', label: 'MAX % OF FARE',    suffix: '%' },
    { key: 'feePercent',          label: 'PLATFORM FEE',     suffix: '%' },
    { key: 'feeFloorCents',       label: 'FEE FLOOR',        suffix: '$' },
  ];

  return (
    <View style={[sc.pricingCard, { borderColor: colors.amberBorder }]}>
      <SectionHeader title="DEPOSIT SETTINGS" />
      {FIELDS.map(f => (
        <View key={f.key} style={sc.costRow}>
          <Text style={sc.costLabel}>{f.label} ({f.suffix})</Text>
          <TextInput
            style={sc.costInput}
            value={vals[f.key]}
            keyboardType="numeric"
            onChangeText={v => setVals(prev => ({ ...prev, [f.key]: v }))}
            placeholderTextColor={colors.textFaint}
          />
        </View>
      ))}
      {err && <Text style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.red }}>{err}</Text>}
      <TouchableOpacity
        style={[sc.saveBtn, { backgroundColor: saved ? colors.green : colors.amber }]}
        onPress={save}
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator size="small" color={colors.bg} />
          : <Text style={sc.saveBtnText}>{saved ? '✓ SAVED' : 'SAVE DEPOSIT SETTINGS'}</Text>
        }
      </TouchableOpacity>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface PricingMode {
  id: string;
  modeKey: string;
  displayName: string;
  enabled: boolean;
  isDefaultGlobal: boolean;
  config: Record<string, unknown> | null;
}

interface PricingConfig {
  id: string;
  tier: string;
  feeRate: number;
  dailyCap: number;
  weeklyCap: number;
  peakMultiplier: number;
  isActive: boolean;
  marketId: string | null;
}

function RevenueSection({ days, market, token }: { days: DayFilter; market: MarketSlug; token: string | null }) {
  const [rev, setRev] = useState<{
    gmv: number; platform_revenue: number; stripe_fees: number; driver_payouts: number;
  } | null>(null);
  const [costs, setCosts] = useState({ cloudflare: 0, stripe: 0, clerk: 0, neon: 0 });
  const [editingCosts, setEditingCosts] = useState(false);
  const [savingCosts, setSavingCosts] = useState(false);
  const [loadingRev, setLoadingRev] = useState(true);

  // Pricing modes (deposit ↔ full fare)
  const [modes, setModes] = useState<PricingMode[]>([]);
  const [switchingMode, setSwitchingMode] = useState(false);

  // Fee config (rate, caps)
  const [configs, setConfigs] = useState<PricingConfig[]>([]);
  const [editingFee, setEditingFee] = useState<PricingConfig | null>(null);
  const [savingFee, setSavingFee] = useState(false);
  const [feeError, setFeeError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoadingRev(true);
      try {
        const mktParam = market !== 'all' ? `?marketId=${market}` : '';
        const [moneyRes, costsRes, modesRes, cfgRes] = await Promise.all([
          apiClient<{ gmv: number; platform_revenue: number; stripe_fees: number; driver_payouts: number }>(
            `/admin/money?days=${days === 0 ? 3650 : days}${market !== 'all' ? `&marketSlug=${market}` : ''}`, token,
          ),
          apiClient<{ costs: typeof costs }>('/admin/variable-costs', token),
          apiClient<{ modes: PricingMode[] }>('/admin/pricing-modes', token),
          apiClient<{ configs: PricingConfig[] }>(`/admin/pricing${mktParam}`, token),
        ]);
        setRev(moneyRes);
        setCosts(costsRes.costs ?? costs);
        setModes(modesRes.modes ?? []);
        setConfigs(cfgRes.configs?.filter(c => c.isActive) ?? []);
      } catch { setRev(null); }
      finally { setLoadingRev(false); }
    }
    void load();
  }, [days, market, token]);

  async function saveCosts() {
    setSavingCosts(true);
    try {
      await apiClient('/admin/variable-costs', token, { method: 'PATCH', body: JSON.stringify(costs) });
      setEditingCosts(false);
    } catch {}
    finally { setSavingCosts(false); }
  }

  async function setDefaultMode(modeKey: string) {
    setSwitchingMode(true);
    try {
      await apiClient('/admin/pricing-modes', token, {
        method: 'PATCH',
        body: JSON.stringify({ modeKey, isDefaultGlobal: true, enabled: true }),
      });
      setModes(prev => prev.map(m => ({ ...m, isDefaultGlobal: m.modeKey === modeKey })));
    } catch {}
    finally { setSwitchingMode(false); }
  }

  async function saveFeeConfig() {
    if (!editingFee) return;
    setSavingFee(true);
    setFeeError(null);
    try {
      await apiClient('/admin/pricing', token, {
        method: 'POST',
        body: JSON.stringify({
          tier: editingFee.tier,
          feeRate: editingFee.feeRate,
          dailyCap: editingFee.dailyCap,
          weeklyCap: editingFee.weeklyCap,
          peakMultiplier: editingFee.peakMultiplier,
          marketId: editingFee.marketId,
          changeReason: 'Updated via mobile admin',
        }),
      });
      setConfigs(prev => prev.map(c => c.id === editingFee.id ? { ...editingFee } : c));
      setEditingFee(null);
    } catch (e: unknown) {
      setFeeError((e as { message?: string }).message ?? 'Save failed');
    } finally {
      setSavingFee(false);
    }
  }

  const totalMonthlyCosts = costs.cloudflare + costs.stripe + costs.clerk + costs.neon;
  const dailyCost = totalMonthlyCosts / 30;
  const completedRides = rev ? (rev.gmv > 0 ? rev.gmv / 25 : 0) : 0;
  const avgFeePerRide = completedRides > 0 ? (rev?.platform_revenue ?? 0) / completedRides : 2.5;
  const breakEvenRides = dailyCost > 0 && avgFeePerRide > 0 ? Math.ceil(dailyCost / avgFeePerRide) : 0;
  const margin = rev && (rev.platform_revenue ?? 0) > 0 && (rev.gmv ?? 0) > 0
    ? Math.round(((rev.platform_revenue - dailyCost * days) / rev.gmv) * 100)
    : 0;

  const activeModeName = modes.find(m => m.isDefaultGlobal)?.displayName ?? '—';
  const isDeposit = modes.find(m => m.isDefaultGlobal)?.modeKey?.includes('deposit') ?? false;

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled">
      {loadingRev ? <LoadingCard /> : (
        <View style={sc.statsGrid}>
          <StatCard label="GMV" value={`$${(rev?.gmv ?? 0).toFixed(0)}`} />
          <StatCard label="PLATFORM REV" value={`$${(rev?.platform_revenue ?? 0).toFixed(0)}`} accent />
          <StatCard label="STRIPE FEES" value={`$${(rev?.stripe_fees ?? 0).toFixed(0)}`} />
          <StatCard label="DRIVER PAY" value={`$${(rev?.driver_payouts ?? 0).toFixed(0)}`} />
        </View>
      )}

      {/* Break-even */}
      <View style={sc.breakEven}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={sc.sectionHdr}>BREAK-EVEN</Text>
          <TouchableOpacity onPress={() => setEditingCosts(!editingCosts)}>
            <Text style={[sc.tag, { color: G }]}>{editingCosts ? 'CANCEL' : 'EDIT COSTS'}</Text>
          </TouchableOpacity>
        </View>
        {editingCosts ? (
          <View style={{ gap: spacing.sm }}>
            {(['cloudflare', 'stripe', 'clerk', 'neon'] as const).map(k => (
              <View key={k} style={sc.costRow}>
                <Text style={sc.costLabel}>{k.toUpperCase()}/mo</Text>
                <TextInput
                  style={sc.costInput}
                  value={String(costs[k])}
                  keyboardType="numeric"
                  onChangeText={v => setCosts(c => ({ ...c, [k]: Number(v) || 0 }))}
                  placeholderTextColor={colors.textFaint}
                />
              </View>
            ))}
            <TouchableOpacity style={sc.saveBtn} onPress={saveCosts} disabled={savingCosts}>
              {savingCosts ? <ActivityIndicator size="small" color={colors.bg} /> : <Text style={sc.saveBtnText}>SAVE</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={sc.statsGrid}>
            <StatCard label="DAILY COST" value={`$${dailyCost.toFixed(2)}`} />
            <StatCard label="BREAK-EVEN" value={breakEvenRides > 0 ? `${breakEvenRides}/day` : '—'} />
            <StatCard label="MARGIN" value={`${margin}%`} accent={margin > 0} />
          </View>
        )}
      </View>

      {/* Pricing mode toggle */}
      <View style={sc.pricingCard}>
        <SectionHeader title="PRICING MODE" />
        <Text style={[sc.rowSub, { marginBottom: spacing.sm }]}>Active: {activeModeName}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {modes.filter(m => m.modeKey !== 'free_ride').map(m => (
            <TouchableOpacity
              key={m.modeKey}
              style={[
                sc.modeBtn,
                m.isDefaultGlobal && sc.modeBtnActive,
              ]}
              onPress={() => !m.isDefaultGlobal && void setDefaultMode(m.modeKey)}
              disabled={switchingMode || m.isDefaultGlobal}
            >
              {switchingMode && !m.isDefaultGlobal
                ? <ActivityIndicator size="small" color={G} />
                : <Text style={[sc.modeBtnText, m.isDefaultGlobal && { color: G }]}>
                    {m.displayName.toUpperCase()}
                  </Text>
              }
            </TouchableOpacity>
          ))}
        </View>
        {isDeposit && (
          <View style={[sc.depositHint, { marginTop: spacing.sm }]}>
            <Ionicons name="information-circle-outline" size={12} color={colors.textFaint} />
            <Text style={sc.rowSub}>Riders pay a deposit at booking; balance due at pickup</Text>
          </View>
        )}
      </View>

      {/* Deposit levers — only visible when deposit mode is active */}
      {isDeposit && <DepositLevers modes={modes} token={token} onSaved={setModes} />}

      {/* Fee rate levers */}
      {configs.length > 0 && (
        <View style={sc.pricingCard}>
          <SectionHeader title="FEE RATES" />
          {editingFee ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={sc.rowTitle}>{editingFee.tier.toUpperCase()} TIER</Text>
              {[
                { key: 'feeRate' as const, label: 'FEE RATE (0–1)', step: 0.01 },
                { key: 'dailyCap' as const, label: 'DAILY CAP $', step: 1 },
                { key: 'weeklyCap' as const, label: 'WEEKLY CAP $', step: 1 },
                { key: 'peakMultiplier' as const, label: 'PEAK MULTIPLIER', step: 0.1 },
              ].map(({ key, label }) => (
                <View key={key} style={sc.costRow}>
                  <Text style={sc.costLabel}>{label}</Text>
                  <TextInput
                    style={sc.costInput}
                    value={String(editingFee[key])}
                    keyboardType="numeric"
                    onChangeText={v => setEditingFee(f => f ? { ...f, [key]: Number(v) || 0 } : f)}
                    placeholderTextColor={colors.textFaint}
                  />
                </View>
              ))}
              {feeError && <Text style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.red }}>{feeError}</Text>}
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <TouchableOpacity style={[sc.saveBtn, { flex: 1 }]} onPress={saveFeeConfig} disabled={savingFee}>
                  {savingFee ? <ActivityIndicator size="small" color={colors.bg} /> : <Text style={sc.saveBtnText}>SAVE</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[sc.saveBtn, { flex: 1, backgroundColor: colors.cardAlt }]}
                  onPress={() => { setEditingFee(null); setFeeError(null); }}
                >
                  <Text style={[sc.saveBtnText, { color: colors.textSecondary }]}>CANCEL</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {configs.map(c => (
                <TouchableOpacity key={c.id} style={sc.feeRow} onPress={() => setEditingFee({ ...c })} activeOpacity={0.8}>
                  <View style={{ flex: 1 }}>
                    <Text style={sc.rowTitle}>{c.tier.toUpperCase()}</Text>
                    <Text style={sc.rowSub}>
                      {(c.feeRate * 100).toFixed(0)}% · ${c.dailyCap}/day · ${c.weeklyCap}/wk
                      {c.peakMultiplier > 1 ? ` · ${c.peakMultiplier}× peak` : ''}
                    </Text>
                  </View>
                  <Ionicons name="create-outline" size={16} color={colors.textFaint} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

// ── SECTION: Messages ─────────────────────────────────────────────────────────

function MessagesSection({ token }: { token: string | null }) {
  const [threads, setThreads] = useState<{ phone: string; last_message: string; unread: number; last_at: string; name?: string | null; profile_type?: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [convo, setConvo] = useState<{ direction: string; message: string; created_at: string }[]>([]);
  const [loadingConvo, setLoadingConvo] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    apiClient<{ threads: typeof threads }>('/admin/messages', token)
      .then(d => setThreads(d.threads ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  async function openThread(phone: string) {
    setSelected(phone);
    setLoadingConvo(true);
    try {
      const d = await apiClient<{ messages: typeof convo }>(`/admin/messages?phone=${encodeURIComponent(phone)}`, token);
      setConvo(d.messages ?? []);
    } catch {}
    finally { setLoadingConvo(false); }
  }

  if (loading) return <LoadingCard />;

  if (selected) {
    return (
      <View style={{ flex: 1, gap: spacing.md }}>
        <TouchableOpacity onPress={() => setSelected(null)} style={sc.backBtn}>
          <Ionicons name="chevron-back" size={16} color={G} />
          <Text style={[sc.tag, { color: G }]}>ALL THREADS</Text>
        </TouchableOpacity>
        <Text style={sc.rowTitle}>
          {threads.find(t => t.phone === selected)?.name ?? selected}
        </Text>
        {threads.find(t => t.phone === selected)?.name && (
          <Text style={sc.rowSub}>{selected}</Text>
        )}
        {loadingConvo ? <LoadingCard /> : (
          <ScrollView style={{ flex: 1 }}>
            {convo.map((m, i) => (
              <View key={i} style={[sc.msgBubble, m.direction === 'outbound' && sc.msgOut]}>
                <Text style={[sc.msgText, m.direction === 'outbound' && { color: colors.bg }]}>
                  {m.message}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}
        <View style={sc.replyRow}>
          <TextInput
            style={sc.replyInput}
            value={replyText}
            onChangeText={setReplyText}
            placeholder="Type a message..."
            placeholderTextColor={colors.textFaint}
            multiline
          />
          <TouchableOpacity
            style={[sc.sendBtn, (!replyText.trim() || sending) && { opacity: 0.4 }]}
            disabled={!replyText.trim() || sending}
            onPress={async () => {
              setSending(true);
              try {
                await apiClient('/admin/messages/send', token, {
                  method: 'POST',
                  body: JSON.stringify({ phone: selected, message: replyText }),
                });
                setReplyText('');
                await openThread(selected);
              } catch {}
              finally { setSending(false); }
            }}
          >
            <Ionicons name="send" size={16} color={sending ? colors.textFaint : colors.bg} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.sm }}>
      {!threads.length
        ? <EmptyState msg="NO MESSAGE THREADS" />
        : threads.map(t => (
          <TouchableOpacity key={t.phone} style={sc.row} onPress={() => void openThread(t.phone)} activeOpacity={0.8}>
            <View style={[sc.avatar, {
              backgroundColor: t.profile_type === 'driver' ? colors.amberDim : colors.blueDim,
              borderColor: t.profile_type === 'driver' ? colors.amberBorder : colors.blueBorder,
            }]}>
              <Ionicons
                name={t.profile_type === 'driver' ? 'car-outline' : 'person-outline'}
                size={16}
                color={t.profile_type === 'driver' ? colors.amber : colors.blue}
              />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={sc.rowTitle}>
                {t.name ? t.name : t.phone}
              </Text>
              <Text style={sc.rowSub} numberOfLines={1}>
                {t.name ? t.phone : ''}{t.name ? ' · ' : ''}{t.last_message}
              </Text>
            </View>
            {t.unread > 0 && (
              <View style={sc.badge}><Text style={sc.badgeText}>{t.unread}</Text></View>
            )}
          </TouchableOpacity>
        ))
      }
    </ScrollView>
  );
}

// ── SECTION: Safety ───────────────────────────────────────────────────────────

function SafetySection({ token }: { token: string | null }) {
  const [events, setEvents] = useState<{
    id: string; event_type: string; severity: string; created_at: string;
    rider_handle?: string; driver_handle?: string;
  }[]>([]);
  const [disputes, setDisputes] = useState<{
    id: string; reason: string; status: string; ride_amount: number;
    filer_handle?: string;
  }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiClient<{ events: typeof events }>('/admin/safety?scope=open&limit=20', token),
      apiClient<{ disputes: typeof disputes }>('/admin/disputes?status=open', token),
    ])
      .then(([s, d]) => { setEvents(s.events ?? []); setDisputes(d.disputes ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const SEV_COLOR: Record<string, string> = {
    critical: colors.red, high: colors.amber, warn: colors.amber, info: colors.blue,
  };

  if (loading) return <LoadingCard />;

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.md }}>
      <View style={sc.statsGrid}>
        <StatCard label="OPEN SAFETY" value={String(events.length)} />
        <StatCard label="OPEN DISPUTES" value={String(disputes.length)} />
      </View>

      {events.length > 0 && (
        <>
          <SectionHeader title="SAFETY EVENTS" />
          {events.map(e => (
            <View key={e.id} style={sc.row}>
              <View style={[sc.statusDot, { backgroundColor: SEV_COLOR[e.severity] ?? colors.textFaint, width: 10, height: 10 }]} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={sc.rowTitle}>{e.event_type.replace(/_/g, ' ').toUpperCase()}</Text>
                <Text style={sc.rowSub}>{e.rider_handle ? `@${e.rider_handle}` : ''} {e.driver_handle ? `↔ @${e.driver_handle}` : ''}</Text>
              </View>
              <Text style={[sc.tag, { color: SEV_COLOR[e.severity] ?? colors.textFaint }]}>
                {e.severity.toUpperCase()}
              </Text>
            </View>
          ))}
        </>
      )}

      {disputes.length > 0 && (
        <>
          <SectionHeader title="OPEN DISPUTES" />
          {disputes.map(d => (
            <View key={d.id} style={sc.row}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.amber} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={sc.rowTitle}>{d.reason}</Text>
                <Text style={sc.rowSub}>{d.filer_handle ? `Filed by @${d.filer_handle}` : 'Anonymous'}</Text>
              </View>
              <Text style={sc.rowSub}>${d.ride_amount}</Text>
            </View>
          ))}
        </>
      )}

      {!events.length && !disputes.length && <EmptyState msg="ALL CLEAR — NO OPEN ITEMS" />}
    </ScrollView>
  );
}

// ── SECTION: Growth ───────────────────────────────────────────────────────────

interface GrowthData {
  newRiders: number; newDrivers: number;
  totalRiders: number; totalDrivers: number; activeDrivers: number;
}

function GrowthSection({ days, market, token }: { days: DayFilter; market: MarketSlug; token: string | null }) {
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ days: String(days === 0 ? 3650 : days) });
    if (market !== 'all') params.set('marketId', market);
    apiClient<GrowthData>(`/admin/users/growth?${params}`, token)
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [days, market, token]);

  const periodLabel = days === 0 ? 'ALL TIME' : days === 1 ? 'TODAY' : days === 7 ? 'THIS WEEK' : 'THIS MONTH';

  if (loading) return <LoadingCard />;

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled">
      <SectionHeader title={`NEW SIGN-UPS — ${periodLabel}`} />
      <View style={sc.statsGrid}>
        <StatCard label="NEW RIDERS"  value={String(data?.newRiders ?? 0)} accent />
        <StatCard label="NEW DRIVERS" value={String(data?.newDrivers ?? 0)} />
      </View>
      <SectionHeader title="TOTAL BASE" />
      <View style={sc.statsGrid}>
        <StatCard label="ALL RIDERS"      value={String(data?.totalRiders ?? 0)} />
        <StatCard label="ALL DRIVERS"     value={String(data?.totalDrivers ?? 0)} />
        <StatCard label="ACTIVE DRIVERS"  value={String(data?.activeDrivers ?? 0)} accent />
      </View>
      {!loading && !data && <EmptyState msg="COULD NOT LOAD GROWTH DATA" />}
    </ScrollView>
  );
}

// ── SECTION: AI ───────────────────────────────────────────────────────────────

interface AIInsights {
  business_health?: { score: number; headline: string; summary: string; status: string };
  pricing?: { recommendation: string; action: string; confidence: string };
  fulfillment?: { rate_pct: number; headline: string; suggestion: string };
  growth?: { trend: string; headline: string; action: string };
  errors?: { severity: string; summary: string };
}

function AISection({ days, market, token }: { days: DayFilter; market: MarketSlug; token: string | null }) {
  const [insights, setInsights] = useState<AIInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  async function runAnalysis() {
    setLoading(true);
    try {
      const res = await apiClient<{ insights: AIInsights; generatedAt: string }>(
        '/admin/ai-insights', token,
        { method: 'POST', body: JSON.stringify({ market, days: days === 0 ? 365 : days }) },
      );
      setInsights(res.insights);
      setGeneratedAt(res.generatedAt);
    } catch (e: unknown) {
      const msg = (e as { message?: string }).message ?? 'Unknown error';
      setInsights({
        errors: { severity: 'high', summary: `⚠ ${msg}` },
      });
    } finally { setLoading(false); }
  }

  const HEALTH_COLOR: Record<string, string> = { healthy: G, caution: colors.amber, critical: colors.red };
  const TREND_ICON: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
    up: 'trending-up', flat: 'remove', down: 'trending-down',
  };

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.md }}>
      <TouchableOpacity
        style={[sc.runBtn, loading && { opacity: 0.6 }]}
        onPress={runAnalysis}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading
          ? <><ActivityIndicator size="small" color={colors.bg} /><Text style={sc.runBtnText}>ANALYSING...</Text></>
          : <><Ionicons name="sparkles" size={14} color={colors.bg} /><Text style={sc.runBtnText}>RUN ANALYSIS</Text></>
        }
      </TouchableOpacity>

      {generatedAt && (
        <Text style={[sc.rowSub, { textAlign: 'center' }]}>
          Generated {new Date(generatedAt).toLocaleTimeString()}
        </Text>
      )}

      {insights && (
        <>
          {insights.business_health && (
            <View style={[sc.insightCard, { borderColor: HEALTH_COLOR[insights.business_health.status] ?? colors.border }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[sc.insightLabel, { color: HEALTH_COLOR[insights.business_health.status] ?? G }]}>
                  BUSINESS HEALTH
                </Text>
                <Text style={[sc.insightScore, { color: HEALTH_COLOR[insights.business_health.status] ?? G }]}>
                  {insights.business_health.score}/100
                </Text>
              </View>
              <Text style={sc.insightTitle}>{insights.business_health.headline}</Text>
              <Text style={sc.insightBody}>{insights.business_health.summary}</Text>
            </View>
          )}
          {insights.pricing && (
            <View style={sc.insightCard}>
              <Text style={sc.insightLabel}>PRICING</Text>
              <Text style={sc.insightTitle}>{insights.pricing.action.toUpperCase()}</Text>
              <Text style={sc.insightBody}>{insights.pricing.recommendation}</Text>
              <Text style={[sc.tag, { color: colors.textFaint }]}>Confidence: {insights.pricing.confidence}</Text>
            </View>
          )}
          {insights.fulfillment && (
            <View style={sc.insightCard}>
              <Text style={sc.insightLabel}>FULFILLMENT</Text>
              <Text style={sc.insightTitle}>{insights.fulfillment.headline}</Text>
              <Text style={sc.insightBody}>{insights.fulfillment.suggestion}</Text>
            </View>
          )}
          {insights.growth && (
            <View style={sc.insightCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={sc.insightLabel}>GROWTH</Text>
                <Ionicons name={TREND_ICON[insights.growth.trend] ?? 'remove'} size={14} color={
                  insights.growth.trend === 'up' ? G : insights.growth.trend === 'down' ? colors.red : colors.textFaint
                } />
              </View>
              <Text style={sc.insightTitle}>{insights.growth.headline}</Text>
              <Text style={sc.insightBody}>{insights.growth.action}</Text>
            </View>
          )}
          {insights.errors && (
            <View style={sc.insightCard}>
              <Text style={sc.insightLabel}>ERRORS</Text>
              <Text style={sc.insightBody}>{insights.errors.summary}</Text>
            </View>
          )}
        </>
      )}

      {!insights && !loading && (
        <View style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}>
          <Ionicons name="sparkles-outline" size={40} color={colors.textFaint} />
          <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint, letterSpacing: 1, textAlign: 'center' }}>
            RUN ANALYSIS TO SEE{'\n'}AI-POWERED INSIGHTS
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// ── Loading placeholder ───────────────────────────────────────────────────────

function LoadingCard() {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 32 }}>
      <ActivityIndicator color={G} />
    </View>
  );
}

// ── Tab config ────────────────────────────────────────────────────────────────

// ── Blasts (matching observability) ───────────────────────────────────────────

interface AdminBlast {
  id: string;
  shortcode: string | null;
  status: string;
  priceDollars: number;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  targetedCount: number;
  notifiedCount: number;
  hmuCount: number;
  selectedCount: number;
  offerPageViews: number;
}

const BLAST_STATUSES = ['all', 'active', 'matched', 'expired', 'cancelled'] as const;

function blastStatusColor(status: string): string {
  if (status === 'active') return G;
  if (status === 'matched') return colors.blue;
  if (status === 'cancelled' || status === 'expired') return colors.textFaint;
  return colors.textFaint;
}

function FunnelStat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <View style={ad.funnelStat}>
      <Text style={[ad.funnelVal, warn && { color: colors.amber }]}>{value}</Text>
      <Text style={ad.funnelLbl}>{label}</Text>
    </View>
  );
}

// Per-blast "why did/didn't a driver match" lookup — runs eligibility checks.
function BlastDriverLookup({ blastId, token }: { blastId: string; token: string | null }) {
  const [q, setQ] = useState('');
  const [drivers, setDrivers] = useState<Array<Record<string, any>>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2 || !token) { setDrivers([]); return; }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiClient<{ drivers: Array<Record<string, any>> }>(
          `/admin/blast/${blastId}/driver-lookup?q=${encodeURIComponent(query)}`, token,
        );
        if (!cancelled) setDrivers(res.drivers ?? []);
      } catch { if (!cancelled) setDrivers([]); }
      finally { if (!cancelled) setLoading(false); }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [q, blastId, token]);

  return (
    <View style={ad.lookup}>
      <View style={ad.searchWrap}>
        <Ionicons name="search" size={13} color={colors.textFaint} />
        <TextInput
          style={ad.searchInput}
          placeholder="Why didn't a driver match? Search name…"
          placeholderTextColor={colors.textFaint}
          value={q} onChangeText={setQ} autoCapitalize="none" autoCorrect={false}
        />
        {loading && <ActivityIndicator size="small" color={G} />}
      </View>
      {drivers.map((d, i) => {
        const checks: Array<Record<string, any>> = Array.isArray(d.checks) ? d.checks : [];
        return (
          <View key={(d.id as string) ?? i} style={ad.driverCard}>
            <Text style={ad.driverName}>{d.displayName ?? d.handle ?? d.name ?? 'Driver'}{d.handle ? `  @${d.handle}` : ''}</Text>
            {checks.map((c, j) => {
              const ok = (c.pass ?? c.ok ?? c.passed) === true;
              return (
                <View key={j} style={ad.checkRow}>
                  <Ionicons name={ok ? 'checkmark-circle' : 'close-circle'} size={12} color={ok ? G : colors.red} />
                  <Text style={ad.checkText}><Text style={{ color: colors.textSecondary }}>{c.label}:</Text> {String(c.detail ?? '')}</Text>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

function BlastsSection({ token, market }: { token: string | null; market: MarketSlug }) {
  const [blasts, setBlasts] = useState<AdminBlast[]>([]);
  const [status, setStatus] = useState<typeof BLAST_STATUSES[number]>('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async (p: number, replace: boolean) => {
    if (!token) return;
    setLoading(true);
    try {
      const qp = new URLSearchParams({ page: String(p) });
      if (market !== 'all') qp.set('market', market);
      if (status !== 'all') qp.set('status', status);
      const res = await apiClient<{ blasts: AdminBlast[]; hasMore: boolean }>(`/admin/blast?${qp.toString()}`, token);
      setHasMore(!!res.hasMore);
      setBlasts(prev => replace ? (res.blasts ?? []) : [...prev, ...(res.blasts ?? [])]);
    } catch { /* keep prior */ }
    finally { setLoading(false); }
  }, [token, market, status]);

  useEffect(() => { setPage(1); void load(1, true); }, [load]);

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
      <View style={ad.chipRow}>
        {BLAST_STATUSES.map(st => (
          <TouchableOpacity key={st} style={[ad.chip, status === st && ad.chipActive]} onPress={() => setStatus(st)}>
            <Text style={[ad.chipText, status === st && ad.chipTextActive]}>{st.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && blasts.length === 0 ? (
        <ActivityIndicator color={G} style={{ marginTop: 28 }} />
      ) : blasts.length === 0 ? (
        <EmptyState msg="No blasts match" />
      ) : (
        blasts.map(b => (
          <View key={b.id}>
            <TouchableOpacity style={ad.card} activeOpacity={0.85}
              onPress={() => setExpandedId(expandedId === b.id ? null : b.id)}>
              <View style={ad.cardTop}>
                <Text style={ad.cardTitle}>{b.shortcode ? `#${b.shortcode}` : b.id.slice(0, 8)}</Text>
                <View style={ad.rowRight}>
                  <Text style={ad.cardPrice}>${b.priceDollars.toFixed(0)}</Text>
                  <View style={[ad.statusDot, { backgroundColor: blastStatusColor(b.status) }]} />
                  <Text style={[ad.statusText, { color: blastStatusColor(b.status) }]}>{b.status.toUpperCase()}</Text>
                </View>
              </View>
              <Text style={ad.route} numberOfLines={1}>{b.pickupAddress || '—'} → {b.dropoffAddress || '—'}</Text>
              <View style={ad.funnel}>
                <FunnelStat label="TGT" value={b.targetedCount} />
                <FunnelStat label="NOTIF" value={b.notifiedCount} warn={b.notifiedCount < 3} />
                <FunnelStat label="HMU" value={b.hmuCount} warn={b.hmuCount === 0} />
                <FunnelStat label="VIEWS" value={b.offerPageViews} />
                <FunnelStat label="PICK" value={b.selectedCount} />
              </View>
            </TouchableOpacity>
            {expandedId === b.id && <BlastDriverLookup blastId={b.id} token={token} />}
          </View>
        ))
      )}

      {hasMore && !loading && (
        <TouchableOpacity style={ad.loadMore} onPress={() => { const np = page + 1; setPage(np); void load(np, false); }}>
          <Text style={ad.loadMoreText}>LOAD MORE</Text>
        </TouchableOpacity>
      )}
      {loading && blasts.length > 0 && <ActivityIndicator color={G} size="small" />}
    </ScrollView>
  );
}

// ── Users (admin) ─────────────────────────────────────────────────────────────

interface AdminUserRow {
  id: string;
  profileType: string;
  accountStatus: string;
  tier: string | null;
  displayName: string;
  phone: string | null;
  completedRides: number;
}

const USER_TYPES = ['all', 'rider', 'driver'] as const;
const USER_STATUSES = ['all', 'active', 'pending', 'suspended'] as const;

function UserCard({ user, token, onChanged }: {
  user: AdminUserRow; token: string | null; onChanged: (patch: Partial<AdminUserRow>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Chill score local edit state
  const [chillEdit, setChillEdit] = useState<string>('');
  const [chillSaving, setChillSaving] = useState(false);

  async function fetchDetail() {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiClient<{ user: Record<string, any> }>(`/admin/users/${user.id}`, token);
      setDetail(res.user);
      setChillEdit(String(res.user?.chillScore ?? ''));
    } catch { /* keep */ }
    finally { setLoading(false); }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !detail) void fetchDetail();
  }

  async function patch(body: Record<string, unknown>, key: string) {
    if (!token) return;
    setBusy(key);
    try {
      await apiClient(`/admin/users/${user.id}`, token, { method: 'PATCH', body: JSON.stringify(body) });
      setDetail(prev => (prev ? { ...prev, ...body } : prev));
      if (body.accountStatus) onChanged({ accountStatus: body.accountStatus as string });
    } catch (e: any) {
      Alert.alert('Action failed', e?.message ?? 'Try again');
    } finally { setBusy(null); }
  }

  async function saveChillScore() {
    const score = parseInt(chillEdit, 10);
    if (isNaN(score) || score < 0 || score > 100) {
      Alert.alert('Invalid score', 'Chill score must be 0–100');
      return;
    }
    setChillSaving(true);
    try {
      await apiClient(`/admin/users/${user.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ chillScore: score }),
      });
      setDetail(prev => (prev ? { ...prev, chillScore: score } : prev));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Try again');
    } finally { setChillSaving(false); }
  }

  const status = (detail?.accountStatus as string) ?? user.accountStatus;
  const banned = status === 'suspended';
  const og = detail?.ogStatus === true;
  const currentChill = detail?.chillScore ?? null;
  const isDriver = user.profileType === 'driver';

  return (
    <View style={ad.card}>
      <TouchableOpacity activeOpacity={0.85} onPress={toggle}>
        <View style={ad.cardTop}>
          <Text style={ad.cardTitle} numberOfLines={1}>{user.displayName}</Text>
          <View style={ad.rowRight}>
            <Text style={ad.typeTag}>{user.profileType.toUpperCase()}</Text>
            <View style={[ad.statusDot, { backgroundColor: banned ? colors.red : status === 'active' ? G : colors.amber }]} />
          </View>
        </View>
        <Text style={ad.userMeta}>{user.phone ?? '—'} · {user.completedRides} rides · {status}</Text>
      </TouchableOpacity>

      {open && (
        <View style={ad.actions}>
          {loading ? <ActivityIndicator color={G} size="small" /> : (
            <>
              {/* Ban / OG toggles */}
              <View style={ad.actionRow}>
                <TouchableOpacity
                  style={[ad.actionBtn, banned ? ad.actionBtnGreen : ad.actionBtnRed]}
                  disabled={busy !== null}
                  onPress={() => patch({ accountStatus: banned ? 'active' : 'suspended' }, 'ban')}
                >
                  {busy === 'ban' ? <ActivityIndicator size="small" color={banned ? G : colors.red} />
                    : <Text style={[ad.actionBtnText, { color: banned ? G : colors.red }]}>{banned ? 'UNBAN / ACTIVATE' : 'BAN (SUSPEND)'}</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[ad.actionBtn, og ? ad.actionBtnAmber : ad.actionBtnGreen]}
                  disabled={busy !== null || !detail}
                  onPress={() => patch({ ogStatus: !og }, 'og')}
                >
                  {busy === 'og' ? <ActivityIndicator size="small" color={G} />
                    : <Text style={[ad.actionBtnText, { color: og ? colors.amber : G }]}>{og ? 'REVOKE OG' : 'GRANT OG'}</Text>}
                </TouchableOpacity>
              </View>

              {/* Chill score editor */}
              {detail && (
                <View style={ad.chillRow}>
                  <Text style={ad.chillLabel}>CHILL SCORE</Text>
                  <View style={ad.chillInputWrap}>
                    <TextInput
                      style={ad.chillInput}
                      value={chillEdit}
                      onChangeText={v => setChillEdit(v.replace(/[^0-9]/g, '').slice(0, 3))}
                      keyboardType="number-pad"
                      maxLength={3}
                      selectTextOnFocus
                      placeholderTextColor={colors.textFaint}
                      placeholder="0–100"
                    />
                    <Text style={ad.chillUnit}>/ 100</Text>
                  </View>
                  <TouchableOpacity
                    style={[ad.chillSaveBtn, chillSaving && { opacity: 0.5 }]}
                    onPress={saveChillScore}
                    disabled={chillSaving || chillEdit === String(currentChill)}
                  >
                    {chillSaving
                      ? <ActivityIndicator size="small" color={G} />
                      : <Text style={ad.chillSaveBtnText}>SAVE</Text>
                    }
                  </TouchableOpacity>
                </View>
              )}

              {/* Driver booking gates (read from detail for rider-quality settings) */}
              {detail && isDriver && (
                <View style={ad.gateBlock}>
                  <Text style={ad.gateTitle}>RIDER GATES (driver-set)</Text>
                  <Text style={ad.gateLine}>
                    Min chill: {detail.minRiderChillScore ?? 0} · OG only: {detail.requireOgStatus ? 'yes' : 'no'} · Advance notice: {detail.advanceNoticeHours ?? 0}h
                  </Text>
                </View>
              )}

              {detail && (
                <Text style={ad.userMeta}>
                  OG: {og ? 'yes' : 'no'} · tier: {detail.tier ?? '—'} · chill: {currentChill ?? '—'} · disputes: {detail.disputeCount ?? 0}{detail.handle ? ` · @${detail.handle}` : ''}
                </Text>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

function UsersSection({ token }: { token: string | null }) {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<typeof USER_TYPES[number]>('all');
  const [status, setStatus] = useState<typeof USER_STATUSES[number]>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: number, replace: boolean, term: string) => {
    if (!token) return;
    setLoading(true);
    try {
      const qp = new URLSearchParams({ page: String(p) });
      if (term.trim()) qp.set('search', term.trim());
      if (type !== 'all') qp.set('type', type);
      if (status !== 'all') qp.set('status', status);
      const res = await apiClient<{ users: AdminUserRow[]; total: number }>(`/admin/users?${qp.toString()}`, token);
      setTotal(res.total ?? 0);
      setUsers(prev => replace ? (res.users ?? []) : [...prev, ...(res.users ?? [])]);
    } catch { /* keep */ }
    finally { setLoading(false); }
  }, [token, type, status]);

  // Debounced search; filter changes also reset to page 1 (load identity changes)
  useEffect(() => {
    const timer = setTimeout(() => { setPage(1); void load(1, true, search); }, 350);
    return () => clearTimeout(timer);
  }, [search, load]);

  const hasMore = users.length < total;

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
      <View style={ad.searchWrap}>
        <Ionicons name="search" size={13} color={colors.textFaint} />
        <TextInput style={ad.searchInput} placeholder="Search name, handle, phone…" placeholderTextColor={colors.textFaint}
          value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} />
      </View>
      <View style={ad.chipRow}>
        {USER_TYPES.map(t => (
          <TouchableOpacity key={t} style={[ad.chip, type === t && ad.chipActive]} onPress={() => setType(t)}>
            <Text style={[ad.chipText, type === t && ad.chipTextActive]}>{t.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
        <View style={ad.chipDivider} />
        {USER_STATUSES.map(st => (
          <TouchableOpacity key={st} style={[ad.chip, status === st && ad.chipActive]} onPress={() => setStatus(st)}>
            <Text style={[ad.chipText, status === st && ad.chipTextActive]}>{st.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={ad.countLine}>{total} user{total === 1 ? '' : 's'}</Text>

      {loading && users.length === 0 ? <ActivityIndicator color={G} style={{ marginTop: 28 }} />
        : users.length === 0 ? <EmptyState msg="No users match" />
        : users.map(u => (
          <UserCard key={u.id} user={u} token={token}
            onChanged={(p) => setUsers(prev => prev.map(x => x.id === u.id ? { ...x, ...p } : x))} />
        ))}

      {hasMore && !loading && (
        <TouchableOpacity style={ad.loadMore} onPress={() => { const np = page + 1; setPage(np); void load(np, false, search); }}>
          <Text style={ad.loadMoreText}>LOAD MORE ({users.length}/{total})</Text>
        </TouchableOpacity>
      )}
      {loading && users.length > 0 && <ActivityIndicator color={G} size="small" />}
    </ScrollView>
  );
}

const ad = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  chipActive: { borderColor: colors.greenBorder, backgroundColor: colors.greenDim },
  chipText: { fontFamily: fonts.mono, fontSize: 8, color: colors.textFaint, letterSpacing: 0.8 },
  chipTextActive: { color: G },
  chipDivider: { width: 1, height: 12, backgroundColor: colors.border, marginHorizontal: 2 },

  card: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.textPrimary, letterSpacing: 0.5, flex: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardPrice: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.textPrimary },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 0.8 },
  route: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary },

  funnel: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  funnelStat: { alignItems: 'center', flex: 1 },
  funnelVal: { fontFamily: fonts.monoBold, fontSize: 15, color: colors.textPrimary },
  funnelLbl: { fontFamily: fonts.mono, fontSize: 7, color: colors.textFaint, letterSpacing: 1, marginTop: 1 },

  lookup: { marginTop: 4, marginLeft: spacing.md, paddingLeft: spacing.md, borderLeftWidth: 1, borderLeftColor: colors.border, gap: 6 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 6 },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.textPrimary, padding: 0 },
  driverCard: { backgroundColor: colors.cardAlt, borderRadius: radius.cardInner, padding: 8, gap: 3 },
  driverName: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.textPrimary },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  checkText: { fontFamily: fonts.body, fontSize: 11, color: colors.textTertiary, flex: 1 },

  loadMore: { alignItems: 'center', paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.greenBorder, backgroundColor: colors.greenDim, marginTop: 4 },
  loadMoreText: { fontFamily: fonts.monoBold, fontSize: 10, color: G, letterSpacing: 1 },

  typeTag: { fontFamily: fonts.mono, fontSize: 8, color: colors.textFaint, letterSpacing: 0.8 },
  userMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.textTertiary },
  countLine: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 1 },
  actions: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border, gap: 6 },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1 },
  actionBtnRed: { borderColor: colors.redBorder, backgroundColor: colors.redDim },
  actionBtnGreen: { borderColor: colors.greenBorder, backgroundColor: colors.greenDim },
  actionBtnAmber: { borderColor: colors.amberBorder, backgroundColor: colors.amberDim },
  actionBtnText: { fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 0.8 },

  // Chill score editor
  chillRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
  chillLabel: { fontFamily: fonts.mono, fontSize: 8, color: colors.textFaint, letterSpacing: 1, flex: 1 },
  chillInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.cardAlt, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 8, paddingVertical: 4 },
  chillInput: { fontFamily: fonts.monoBold, fontSize: 15, color: colors.textPrimary, minWidth: 36, textAlign: 'center', padding: 0 },
  chillUnit: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint },
  chillSaveBtn: { backgroundColor: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorder, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 5 },
  chillSaveBtnText: { fontFamily: fonts.monoBold, fontSize: 9, color: G, letterSpacing: 0.8 },

  // Driver rider-gate readout
  gateBlock: { backgroundColor: colors.cardAlt, borderRadius: radius.cardInner, padding: 8, gap: 3 },
  gateTitle: { fontFamily: fonts.mono, fontSize: 7, color: colors.textFaint, letterSpacing: 1.5 },
  gateLine: { fontFamily: fonts.body, fontSize: 11, color: colors.textTertiary },
});

const TABS = [
  { key: 'activity', label: 'ACTIVITY', icon: 'stats-chart' as const },
  { key: 'revenue',  label: 'REVENUE',  icon: 'cash' as const },
  { key: 'messages', label: 'MESSAGES', icon: 'chatbubbles' as const },
  { key: 'safety',   label: 'SAFETY',   icon: 'shield' as const },
  { key: 'growth',   label: 'GROWTH',   icon: 'trending-up' as const },
  { key: 'ai',       label: 'AI',       icon: 'sparkles' as const },
  { key: 'blasts',   label: 'BLASTS',   icon: 'radio' as const },
  { key: 'users',    label: 'USERS',    icon: 'people' as const },
];

// ── Main Sheet ────────────────────────────────────────────────────────────────

interface AdminSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function AdminSheet({ visible, onClose }: AdminSheetProps) {
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const translateY = useRef(new Animated.Value(SHEET_H)).current;
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [days, setDays] = useState<DayFilter>(7);
  const [market, setMarket] = useState<MarketSlug>('all');

  // Fetch token when visible
  useEffect(() => {
    if (visible) {
      getToken().then(t => setToken(t ?? null));
    }
  }, [visible, getToken]);

  // Slide animation
  useEffect(() => {
    Animated.spring(translateY, {
      toValue: visible ? 0 : SHEET_H,
      useNativeDriver: true,
      damping: 22,
      stiffness: 220,
    }).start();
  }, [visible, translateY]);

  // Swipe-to-close
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.5) {
          onClose();
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 22 }).start();
        }
      },
    }),
  ).current;

  const renderSection = () => {
    const props = { days, market, token };
    switch (tab) {
      case 0: return <ActivitySection {...props} />;
      case 1: return <RevenueSection {...props} />;
      case 2: return <MessagesSection token={token} />;
      case 3: return <SafetySection token={token} />;
      case 4: return <GrowthSection {...props} />;
      case 5: return <AISection {...props} />;
      case 6: return <BlastsSection token={token} market={market} />;
      case 7: return <UsersSection token={token} />;
      default: return null;
    }
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        {/* Background tap-to-close — absolute behind the sheet, never intercepts sheet touches */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          style={[s.sheet, { paddingBottom: insets.bottom + spacing.md, transform: [{ translateY }] }]}
        >
          {/* Drag handle — only this zone claims touches for swipe-to-dismiss */}
          <View {...pan.panHandlers} style={s.handleZone}>
            <View style={s.handle} />
          </View>

          {/* Header */}
          <View style={s.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={s.adminBadge}>
                <Text style={s.adminBadgeText}>⚡</Text>
              </View>
              <Text style={s.headerTitle}>SUPER ADMIN</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Filters — single compact row */}
          <View style={s.filtersRow}>
            {/* Market: compact dropdown-style selector */}
            <TouchableOpacity
              style={s.marketBtn}
              onPress={() => {
                const idx = MARKET_OPTS.indexOf(market as typeof MARKET_OPTS[number]);
                setMarket(MARKET_OPTS[(idx + 1) % MARKET_OPTS.length]);
              }}
            >
              <Text style={s.marketBtnText}>{market.toUpperCase()}</Text>
              <Ionicons name="chevron-down" size={9} color={colors.textFaint} />
            </TouchableOpacity>

            <View style={s.filterDivider} />

            {/* Time: tiny chips */}
            {TIME_OPTS.map(o => (
              <TouchableOpacity
                key={o.days}
                style={[s.timeChip, days === o.days && s.timeChipActive]}
                onPress={() => setDays(o.days as DayFilter)}
              >
                <Text style={[s.timeChipText, days === o.days && s.timeChipTextActive]}>
                  {o.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Tab bar */}
          <View style={s.tabBar}>
            {TABS.map((t, i) => (
              <TouchableOpacity
                key={t.key}
                style={[s.tabItem, tab === i && s.tabItemActive]}
                onPress={() => setTab(i)}
              >
                <Ionicons name={t.icon} size={18} color={tab === i ? G : colors.textFaint} />
                <Text style={[s.tabLabel, tab === i && s.tabLabelActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Section content */}
          <View style={s.content}>
            {renderSection()}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: SHEET_H, backgroundColor: '#0e0e0e',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  handleZone: { alignItems: 'center', paddingVertical: spacing.sm },
  handle: { width: 36, height: 3, borderRadius: 2, backgroundColor: colors.border },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingBottom: spacing.xs,
  },
  adminBadge: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: colors.greenDim, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.greenBorder,
  },
  adminBadgeText: { fontSize: 14 },
  headerTitle: { fontFamily: fonts.monoBold, fontSize: 13, color: G, letterSpacing: 2 },

  filtersRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: 5,
    gap: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  marketBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: radius.pill, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.greenBorder,
  },
  marketBtnText: { fontFamily: fonts.monoBold, fontSize: 8, color: G, letterSpacing: 1 },
  filterDivider: { width: 1, height: 12, backgroundColor: colors.border, marginHorizontal: 2 },

  timeChip: {
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.pill,
    alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  timeChipActive: { borderColor: colors.greenBorder, backgroundColor: colors.greenDim },
  timeChipText: { fontFamily: fonts.mono, fontSize: 8, color: colors.textFaint, letterSpacing: 0.8 },
  timeChipTextActive: { color: G },

  tabBar: {
    flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tabItem: {
    flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3,
  },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: G },
  tabLabel: { fontFamily: fonts.mono, fontSize: 7, color: colors.textFaint, letterSpacing: 0.5 },
  tabLabelActive: { color: G },

  content: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
});

const sc = StyleSheet.create({
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: {
    flex: 1, minWidth: '45%', backgroundColor: colors.card, borderRadius: radius.cardInner,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  cardAccent: { borderColor: colors.greenBorder, backgroundColor: colors.greenDim },
  val: { fontFamily: fonts.display, fontSize: 24, color: colors.textPrimary },
  label: { fontFamily: fonts.mono, fontSize: 8, color: colors.textFaint, letterSpacing: 1 },
  sub: { fontFamily: fonts.mono, fontSize: 8, color: colors.textFaint },

  sectionHdr: {
    fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 2,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.card, borderRadius: radius.cardInner,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  rowTitle: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary },
  rowSub: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint },
  tag: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.5 },
  avatar: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center',
    justifyContent: 'center', borderWidth: 1,
  },
  badge: {
    minWidth: 20, height: 20, borderRadius: 10, backgroundColor: G,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { fontFamily: fonts.monoBold, fontSize: 10, color: colors.bg },

  breakEven: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  costRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  costLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary, letterSpacing: 1 },
  costInput: {
    width: 90, backgroundColor: colors.cardAlt, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    fontFamily: fonts.mono, fontSize: 13, color: colors.textPrimary,
    borderWidth: 1, borderColor: colors.border, textAlign: 'right',
  },
  saveBtn: {
    backgroundColor: G, borderRadius: radius.pill, paddingVertical: 10,
    alignItems: 'center',
  },
  saveBtnText: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.bg, letterSpacing: 1.5 },

  pricingCard: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  modeBtn: {
    flex: 1, paddingVertical: 10, borderRadius: radius.pill,
    alignItems: 'center', backgroundColor: colors.cardAlt,
    borderWidth: 1, borderColor: colors.border,
  },
  modeBtnActive: { borderColor: colors.greenBorder, backgroundColor: colors.greenDim },
  modeBtnText: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 1 },
  depositHint: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feeRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.cardAlt, borderRadius: radius.cardInner,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },

  msgBubble: {
    alignSelf: 'flex-start', backgroundColor: colors.card,
    borderRadius: 12, padding: spacing.sm, marginBottom: 6,
    maxWidth: '80%', borderWidth: 1, borderColor: colors.border,
  },
  msgOut: { alignSelf: 'flex-end', backgroundColor: G, borderColor: G },
  msgText: { fontFamily: fonts.body, fontSize: 13, color: colors.textPrimary },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  replyRow: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end',
    marginTop: spacing.sm,
  },
  replyInput: {
    flex: 1, backgroundColor: colors.card, borderRadius: radius.cardInner,
    padding: spacing.md, fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary,
    borderWidth: 1, borderColor: colors.border, maxHeight: 80,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: G,
    alignItems: 'center', justifyContent: 'center',
  },

  insightCard: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.lg, gap: spacing.sm, borderWidth: 1, borderColor: colors.border,
  },
  insightLabel: {
    fontFamily: fonts.mono, fontSize: 9, color: G, letterSpacing: 2,
  },
  insightScore: { fontFamily: fonts.display, fontSize: 22 },
  insightTitle: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.textPrimary, letterSpacing: 0.5 },
  insightBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary, lineHeight: 20 },

  runBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, backgroundColor: G, borderRadius: radius.pill, paddingVertical: 14,
  },
  runBtnText: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.bg, letterSpacing: 1.5 },
});
