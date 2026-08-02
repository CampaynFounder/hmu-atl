'use client';

// Seed Data admin — create & delete seed drivers, riders, and advertisements.
// No-code: forms with inline media upload + live preview, list with delete.
// Super-admin only (enforced server-side).

import { useEffect, useRef, useState } from 'react';

type Market = { id: string; name: string; slug: string };
type Tab = 'driver' | 'rider' | 'ad';

interface SeedUser {
  id: string; role: 'driver' | 'rider'; handle: string | null; display_name: string | null;
  gender: string | null; market_slug: string | null; photo_url: string | null;
  video_url: string | null; created_at: string;
}
interface SeedComment {
  id: string; parent_id: string | null; content: string; seed_author_name: string | null;
  seed_author_handle: string | null; seed_author_avatar_url: string | null; created_at: string;
}
interface SeedCommentNode extends SeedComment { replies: SeedCommentNode[] }
interface SeedAd {
  id: string; surface: string; market_id: string | null; market_slug?: string | null;
  headline: string; body: string | null; cta_label: string | null; cta_url: string | null;
  media_url: string | null; poster_url: string | null; media_type: string | null;
  frequency: number; sort_order: number; is_active: boolean; created_at: string;
}

// ── styles ──────────────────────────────────────────────────────────────────
const card: React.CSSProperties = { background: '#141414', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 20, marginBottom: 20 };
const inp: React.CSSProperties = { background: '#0e0e0e', border: '1px solid #2a2a2a', borderRadius: 6, padding: '8px 10px', color: '#fff', fontSize: 13, width: '100%' };
const label: React.CSSProperties = { display: 'block', fontSize: 11, color: '#888', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 };
const field: React.CSSProperties = { marginBottom: 12 };
const btn = (bg: string, bd: string, c: string): React.CSSProperties => ({ background: bg, border: `1px solid ${bd}`, color: c, borderRadius: 8, padding: '9px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 600 });
const tabBtn = (active: boolean): React.CSSProperties => ({ background: active ? '#00E676' : 'transparent', border: `1px solid ${active ? '#00E676' : '#2a2a2a'}`, color: active ? '#000' : '#bbb', borderRadius: 8, padding: '8px 18px', fontSize: 13, cursor: 'pointer', fontWeight: 700 });

export default function SeedDataClient({ markets }: { markets: Market[] }) {
  const [tab, setTab] = useState<Tab>('driver');
  const [users, setUsers] = useState<SeedUser[]>([]);
  const [ads, setAds] = useState<SeedAd[]>([]);
  const [seedMode, setSeedMode] = useState<'off' | 'top'>('off');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function flash(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function loadUsers() {
    const r = await fetch('/api/admin/seed-users');
    if (r.ok) setUsers((await r.json()).users ?? []);
  }
  async function loadAds() {
    const r = await fetch('/api/admin/seed-ads');
    if (r.ok) setAds((await r.json()).ads ?? []);
  }
  async function loadConfig() {
    const r = await fetch('/api/admin/seed-config');
    if (r.ok) setSeedMode((await r.json()).mode ?? 'off');
  }
  async function setMode(mode: 'off' | 'top') {
    setSeedMode(mode); // optimistic
    const r = await fetch('/api/admin/seed-config', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }),
    });
    if (r.ok) flash(mode === 'top' ? 'Seed drivers pinned to top of browse' : 'Seed drivers use normal ranking');
    else { flash('Could not update placement', false); loadConfig(); }
  }
  useEffect(() => { loadUsers(); loadAds(); loadConfig(); }, []);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, color: '#fff' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>🌱 Seed Data</h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>
        Create demo drivers, riders, and promo ads that populate the native browse feeds.
        Seed profiles never receive real ride requests. Deleting a seed user also removes their comments.
      </p>

      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Feed placement</div>
          <div style={{ color: '#888', fontSize: 12 }}>
            Seed drivers rank realistically by default, so they sit deep in the swipe feed.
            Pin them to the top to showcase them (affects real riders in their market — turn off for normal ops).
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={tabBtn(seedMode === 'off')} onClick={() => setMode('off')}>Normal ranking</button>
          <button style={tabBtn(seedMode === 'top')} onClick={() => setMode('top')}>Pin seed to top</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button style={tabBtn(tab === 'driver')} onClick={() => setTab('driver')}>Drivers</button>
        <button style={tabBtn(tab === 'rider')} onClick={() => setTab('rider')}>Riders</button>
        <button style={tabBtn(tab === 'ad')} onClick={() => setTab('ad')}>Advertisements</button>
      </div>

      {tab === 'ad' ? (
        <AdSection markets={markets} ads={ads} reload={loadAds} flash={flash} />
      ) : (
        <UserSection
          role={tab}
          markets={markets}
          users={users.filter((u) => u.role === tab)}
          reload={loadUsers}
          flash={flash}
        />
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: toast.ok ? '#0b2a17' : '#2a0b0b', border: `1px solid ${toast.ok ? '#00E676' : '#ff5252'}`, color: toast.ok ? '#00E676' : '#ff8a8a', padding: '12px 18px', borderRadius: 10, fontSize: 13 }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── media upload widget ──────────────────────────────────────────────────────
function MediaUpload({ kind, label: lbl, value, mediaType, onDone }: {
  kind: 'driver' | 'rider' | 'ad' | 'comment';
  label: string;
  value: string | null;
  mediaType?: string | null;
  onDone: (r: { mediaUrl: string; posterUrl: string | null; mediaType: string }) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      const r = await fetch('/api/admin/seed-users/upload', { method: 'POST', body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Upload failed');
      onDone(data);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  const isVideo = mediaType === 'video' || (value?.match(/\.(mp4|webm|mov|3gp)$/i));

  return (
    <div style={field}>
      <span style={label}>{lbl}</span>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {value ? (
          isVideo ? (
            <video src={value} muted loop autoPlay playsInline style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', background: '#000' }} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', background: '#000' }} />
          )
        ) : (
          <div style={{ width: 64, height: 64, borderRadius: 8, background: '#0e0e0e', border: '1px dashed #333', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 20 }}>+</div>
        )}
        <input ref={ref} type="file" accept="image/*,video/*" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        <button type="button" style={btn('transparent', '#2a2a2a', '#bbb')} onClick={() => ref.current?.click()} disabled={busy}>
          {busy ? 'Uploading…' : value ? 'Replace' : 'Upload'}
        </button>
      </div>
    </div>
  );
}

// ── drivers / riders ─────────────────────────────────────────────────────────
function UserSection({ role, markets, users, reload, flash }: {
  role: 'driver' | 'rider'; markets: Market[]; users: SeedUser[];
  reload: () => void; flash: (m: string, ok?: boolean) => void;
}) {
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [gender, setGender] = useState('');
  const [marketId, setMarketId] = useState(markets[0]?.id ?? '');
  const [areas, setAreas] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [lgbtq, setLgbtq] = useState(false);
  const [vehicle, setVehicle] = useState({ make: '', model: '', year: '', color: '' });
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setHandle(''); setDisplayName(''); setGender(''); setAreas(''); setMinPrice('');
    setLgbtq(false); setVehicle({ make: '', model: '', year: '', color: '' });
    setPhotoUrl(null); setVideoUrl(null);
  }

  async function create() {
    if (!handle.trim() || !displayName.trim()) { flash('Handle and display name are required', false); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        role, handle, display_name: displayName, gender: gender || undefined,
        market_id: marketId || null, lgbtq_friendly: lgbtq,
        photo_url: photoUrl || undefined, video_url: videoUrl || undefined,
      };
      if (role === 'driver') {
        payload.area_slugs = areas.split(',').map((a) => a.trim()).filter(Boolean);
        if (minPrice) payload.min_price = Number(minPrice);
        payload.vehicle = {
          make: vehicle.make || undefined, model: vehicle.model || undefined,
          year: vehicle.year ? Number(vehicle.year) : undefined, color: vehicle.color || undefined,
        };
      } else if (areas.trim()) {
        payload.home_area_slug = areas.split(',')[0].trim();
      }
      const r = await fetch('/api/admin/seed-users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed to create');
      flash(`Seed ${role} @${data.handle} created`);
      reset();
      reload();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Failed', false);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string, h: string | null) {
    if (!confirm(`Delete seed ${role} @${h ?? ''}? This also deletes their comments.`)) return;
    const r = await fetch(`/api/admin/seed-users/${id}`, { method: 'DELETE' });
    if (r.ok) { flash('Deleted'); reload(); } else { flash('Delete failed', false); }
  }

  return (
    <>
      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>New seed {role}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={field}><span style={label}>Handle</span><input style={inp} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="atldriver1" /></div>
          <div style={field}><span style={label}>Display name</span><input style={inp} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Marcus" /></div>
          <div style={field}><span style={label}>Gender</span>
            <select style={inp} value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">—</option><option value="male">male</option><option value="female">female</option><option value="nonbinary">nonbinary</option>
            </select>
          </div>
          <div style={field}><span style={label}>Market</span>
            <select style={inp} value={marketId} onChange={(e) => setMarketId(e.target.value)}>
              <option value="">— none (all) —</option>
              {markets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div style={field}><span style={label}>{role === 'driver' ? 'Area slugs (comma)' : 'Home area slug'}</span><input style={inp} value={areas} onChange={(e) => setAreas(e.target.value)} placeholder="midtown, buckhead" /></div>
          {role === 'driver' && (
            <div style={field}><span style={label}>Min price ($)</span><input style={inp} type="number" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="15" /></div>
          )}
        </div>

        {role === 'driver' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            <div style={field}><span style={label}>Vehicle make</span><input style={inp} value={vehicle.make} onChange={(e) => setVehicle({ ...vehicle, make: e.target.value })} /></div>
            <div style={field}><span style={label}>Model</span><input style={inp} value={vehicle.model} onChange={(e) => setVehicle({ ...vehicle, model: e.target.value })} /></div>
            <div style={field}><span style={label}>Year</span><input style={inp} type="number" value={vehicle.year} onChange={(e) => setVehicle({ ...vehicle, year: e.target.value })} /></div>
            <div style={field}><span style={label}>Color</span><input style={inp} value={vehicle.color} onChange={(e) => setVehicle({ ...vehicle, color: e.target.value })} /></div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
          <MediaUpload kind={role} label="Photo" value={photoUrl} mediaType="photo" onDone={(r) => setPhotoUrl(r.mediaUrl)} />
          <MediaUpload kind={role} label="Video (autoplays in feed)" value={videoUrl} mediaType="video" onDone={(r) => setVideoUrl(r.mediaUrl)} />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 16px', fontSize: 13 }}>
          <input type="checkbox" checked={lgbtq} onChange={(e) => setLgbtq(e.target.checked)} /> LGBTQ+ friendly
        </label>

        <button style={btn('#00E676', '#00E676', '#000')} onClick={create} disabled={saving}>
          {saving ? 'Creating…' : `Create seed ${role}`}
        </button>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Seed {role}s ({users.length})</h2>
        {users.length === 0 ? <p style={{ color: '#666', fontSize: 13 }}>None yet.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {users.map((u) => (
              <SeedUserRow key={u.id} user={u} onDelete={() => remove(u.id, u.handle)} flash={flash} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── seed user row + its comment manager ─────────────────────────────────────
function SeedUserRow({ user, onDelete, flash }: {
  user: SeedUser; onDelete: () => void; flash: (m: string, ok?: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: '#0e0e0e', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10 }}>
        {user.photo_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={user.photo_url} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
          : <div style={{ width: 40, height: 40, borderRadius: 8, background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>{(user.display_name ?? '?')[0]}</div>}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{user.display_name} <span style={{ color: '#888', fontWeight: 400 }}>@{user.handle}</span></div>
          <div style={{ color: '#666', fontSize: 11 }}>{user.market_slug ?? 'all markets'} · {user.video_url ? '🎥 video' : 'no video'}</div>
        </div>
        <button style={btn('transparent', '#2a2a2a', '#bbb')} onClick={() => setOpen((o) => !o)}>💬 Comments</button>
        <button style={btn('transparent', '#552', '#c88')} onClick={onDelete}>Delete</button>
      </div>
      {open && <SeedCommentsManager userId={user.id} flash={flash} />}
    </div>
  );
}

function buildCommentTree(flat: SeedComment[]): SeedCommentNode[] {
  const byId = new Map<string, SeedCommentNode>();
  const roots: SeedCommentNode[] = [];
  flat.forEach((c) => byId.set(c.id, { ...c, replies: [] }));
  byId.forEach((n) => {
    if (n.parent_id && byId.has(n.parent_id)) byId.get(n.parent_id)!.replies.push(n);
    else roots.push(n);
  });
  return roots;
}

// Reusable composer — top-level (parentId null) or a reply (parentId set).
function SeedCommentComposer({ userId, parentId, onDone, flash }: {
  userId: string; parentId: string | null; onDone: () => void; flash: (m: string, ok?: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [content, setContent] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim() || !content.trim()) { flash('Username and comment are required', false); return; }
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/seed-users/${userId}/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorName: name, authorHandle: handle || null, avatarUrl, content, parentId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed');
      setName(''); setHandle(''); setContent(''); setAvatarUrl(null);
      onDone();
    } catch (e) { flash(e instanceof Error ? e.message : 'Failed', false); } finally { setSaving(false); }
  }

  return (
    <div style={{ background: parentId ? '#111' : 'transparent', borderRadius: 6, padding: parentId ? 8 : 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div><span style={label}>Username</span><input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="atlqueen" /></div>
        <div><span style={label}>Handle (optional)</span><input style={inp} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@atlqueen" /></div>
      </div>
      <div style={{ marginTop: 8 }}><span style={label}>{parentId ? 'Reply' : 'Comment'}</span>
        <textarea style={{ ...inp, minHeight: 48, resize: 'vertical' }} value={content} onChange={(e) => setContent(e.target.value)} maxLength={500} placeholder={parentId ? 'On time and super chill 💚' : 'She got me right on time, super chill 💚'} />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 4 }}>
        <MediaUpload kind="comment" label="Avatar" value={avatarUrl} mediaType="photo" onDone={(r) => setAvatarUrl(r.mediaUrl)} />
        <button style={btn('#00E676', '#00E676', '#000')} onClick={submit} disabled={saving}>{saving ? 'Saving…' : parentId ? 'Post reply' : 'Add comment'}</button>
      </div>
    </div>
  );
}

function SeedCommentTreeNode({ node, depth, onReply, onDelete, replyingTo, setReplyingTo, userId, reload, flash }: {
  node: SeedCommentNode; depth: number;
  onReply: (id: string) => void; onDelete: (id: string) => void;
  replyingTo: string | null; setReplyingTo: (id: string | null) => void;
  userId: string; reload: () => void; flash: (m: string, ok?: boolean) => void;
}) {
  return (
    <div style={{ marginLeft: depth > 0 ? 20 : 0, borderLeft: depth > 0 ? '1px solid #222' : 'none', paddingLeft: depth > 0 ? 8 : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: '#141414', borderRadius: 6 }}>
        {node.seed_author_avatar_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={node.seed_author_avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: 14, objectFit: 'cover' }} />
          : <div style={{ width: 28, height: 28, borderRadius: 14, background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 12 }}>{(node.seed_author_name ?? '?')[0]}</div>}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{node.seed_author_name}{node.seed_author_handle ? <span style={{ color: '#888', fontWeight: 400 }}> @{node.seed_author_handle}</span> : null}</div>
          <div style={{ fontSize: 12, color: '#bbb' }}>{node.content}</div>
        </div>
        <button style={btn('transparent', '#2a2a2a', '#bbb')} onClick={() => onReply(node.id)}>Reply</button>
        <button style={btn('transparent', '#552', '#c88')} title="Delete comment + its replies" onClick={() => onDelete(node.id)}>✕</button>
      </div>
      {replyingTo === node.id && (
        <div style={{ marginLeft: 20, marginTop: 6 }}>
          <SeedCommentComposer userId={userId} parentId={node.id} flash={flash} onDone={() => { setReplyingTo(null); reload(); }} />
        </div>
      )}
      {node.replies.map((r) => (
        <SeedCommentTreeNode key={r.id} node={r} depth={depth + 1} onReply={onReply} onDelete={onDelete}
          replyingTo={replyingTo} setReplyingTo={setReplyingTo} userId={userId} reload={reload} flash={flash} />
      ))}
    </div>
  );
}

function SeedCommentsManager({ userId, flash }: { userId: string; flash: (m: string, ok?: boolean) => void }) {
  const [flat, setFlat] = useState<SeedComment[]>([]);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  async function load() {
    const r = await fetch(`/api/admin/seed-users/${userId}/comments`);
    if (r.ok) setFlat((await r.json()).comments ?? []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId]);

  async function del(id: string) {
    const r = await fetch(`/api/admin/seed-comments/${id}`, { method: 'DELETE' });
    if (r.ok) { flash('Comment + replies deleted'); load(); } else flash('Delete failed', false);
  }

  const tree = buildCommentTree(flat);

  return (
    <div style={{ borderTop: '1px solid #222', padding: 12, background: '#0b0b0b' }}>
      <SeedCommentComposer userId={userId} parentId={null} flash={flash} onDone={load} />
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {tree.length === 0 ? <p style={{ color: '#555', fontSize: 12 }}>No seed comments yet.</p> : tree.map((n) => (
          <SeedCommentTreeNode key={n.id} node={n} depth={0} onReply={setReplyingTo} onDelete={del}
            replyingTo={replyingTo} setReplyingTo={setReplyingTo} userId={userId} reload={load} flash={flash} />
        ))}
      </div>
    </div>
  );
}

// ── advertisements ───────────────────────────────────────────────────────────
function AdSection({ markets, ads, reload, flash }: {
  markets: Market[]; ads: SeedAd[]; reload: () => void; flash: (m: string, ok?: boolean) => void;
}) {
  const [surface, setSurface] = useState('both');
  const [marketId, setMarketId] = useState('');
  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [frequency, setFrequency] = useState('6');
  const [saving, setSaving] = useState(false);

  function reset() {
    setSurface('both'); setMarketId(''); setHeadline(''); setBody(''); setCtaLabel(''); setCtaUrl('');
    setMediaUrl(null); setMediaType(null); setPosterUrl(null); setFrequency('6');
  }

  async function create() {
    if (!headline.trim()) { flash('Headline is required', false); return; }
    setSaving(true);
    try {
      const r = await fetch('/api/admin/seed-ads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surface, market_id: marketId || null, headline, body: body || null,
          cta_label: ctaLabel || null, cta_url: ctaUrl || null,
          media_url: mediaUrl, poster_url: posterUrl, media_type: mediaType,
          frequency: Number(frequency) || 6, is_active: true,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed');
      flash('Ad created'); reset(); reload();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Failed', false);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(ad: SeedAd) {
    const r = await fetch(`/api/admin/seed-ads/${ad.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !ad.is_active }) });
    if (r.ok) reload();
  }
  async function remove(id: string) {
    if (!confirm('Delete this ad?')) return;
    const r = await fetch(`/api/admin/seed-ads/${id}`, { method: 'DELETE' });
    if (r.ok) { flash('Deleted'); reload(); } else flash('Delete failed', false);
  }

  return (
    <>
      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>New advertisement</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div style={field}><span style={label}>Surface</span>
            <select style={inp} value={surface} onChange={(e) => setSurface(e.target.value)}>
              <option value="both">Both feeds</option><option value="rider_browse">Rider browse</option><option value="driver_browse">Driver browse</option>
            </select>
          </div>
          <div style={field}><span style={label}>Market</span>
            <select style={inp} value={marketId} onChange={(e) => setMarketId(e.target.value)}>
              <option value="">— all markets —</option>
              {markets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div style={field}><span style={label}>Show every N cards</span><input style={inp} type="number" min={1} value={frequency} onChange={(e) => setFrequency(e.target.value)} /></div>
        </div>
        <div style={field}><span style={label}>Headline</span><input style={inp} value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="HMU First — keep more of every ride" /></div>
        <div style={field}><span style={label}>Body</span><input style={inp} value={body} onChange={(e) => setBody(e.target.value)} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={field}><span style={label}>CTA label</span><input style={inp} value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Learn more" /></div>
          <div style={field}><span style={label}>CTA URL</span><input style={inp} value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://…" /></div>
        </div>
        <MediaUpload kind="ad" label="Media (photo or video)" value={mediaUrl} mediaType={mediaType} onDone={(r) => { setMediaUrl(r.mediaUrl); setMediaType(r.mediaType); setPosterUrl(r.posterUrl); }} />
        <button style={btn('#00E676', '#00E676', '#000')} onClick={create} disabled={saving}>{saving ? 'Creating…' : 'Create ad'}</button>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Advertisements ({ads.length})</h2>
        {ads.length === 0 ? <p style={{ color: '#666', fontSize: 13 }}>None yet.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ads.map((ad) => (
              <div key={ad.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, background: '#0e0e0e', borderRadius: 8, opacity: ad.is_active ? 1 : 0.5 }}>
                {ad.media_url && (ad.media_type === 'video'
                  ? <video src={ad.media_url} muted loop autoPlay playsInline style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={ad.poster_url ?? ad.media_url} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />)}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{ad.headline}</div>
                  <div style={{ color: '#666', fontSize: 11 }}>{ad.surface} · {ad.market_slug ?? 'all'} · every {ad.frequency}</div>
                </div>
                <button style={btn('transparent', '#2a2a2a', '#bbb')} onClick={() => toggle(ad)}>{ad.is_active ? 'Active' : 'Off'}</button>
                <button style={btn('transparent', '#552', '#c88')} onClick={() => remove(ad.id)}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
