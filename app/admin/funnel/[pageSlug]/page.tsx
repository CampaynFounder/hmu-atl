'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMarket } from '@/app/admin/components/market-context';
import { PAGE_SLUGS } from '@/lib/cms/zone-registry';
import { getSectionsForPage, getDefaultSectionOrder, type SectionDefinition } from '@/lib/cms/section-registry';
import { ZONE_REGISTRY } from '@/lib/cms/zone-registry';
import { StageSelector } from './components/stage-selector';
import { ZoneEditor } from './components/zone-editor';
import { useAdminAuth } from '@/app/admin/components/admin-auth-context';
import type { SectionLayoutEntry } from '@/lib/cms/types';

type InheritedFrom = 'custom' | 'persona_stage' | 'persona' | 'stage' | 'control' | 'default';

// Badge that shows where the zone's current content is coming from, so the
// admin can immediately tell whether they're editing a persona/stage-specific
// override or an inherited default. Saving always writes to the target variant
// for the current (stage, persona) — other personas are never overwritten.
function getInheritanceBadge(
  inherited: InheritedFrom | undefined,
  stage: string,
  persona: string | null,
): { label: string; bg: string; fg: string; tooltip: string } | null {
  // Awareness + no persona = the default view. Only show a badge if content is
  // actually missing (nothing to indicate otherwise).
  const isDefaultView = stage === 'awareness' && !persona;
  if (isDefaultView && (!inherited || inherited === 'control' || inherited === 'custom')) return null;

  if (!inherited || inherited === 'default') {
    return {
      label: 'NEW', bg: 'rgba(150,150,150,0.1)', fg: '#999',
      tooltip: 'No content yet for any persona or stage. Edit to create.',
    };
  }
  if (inherited === 'custom') {
    const target = [persona, stage !== 'awareness' ? stage : null].filter(Boolean).join(' + ') || 'default';
    return {
      label: 'CUSTOM', bg: 'rgba(0,230,118,0.1)', fg: '#00E676',
      tooltip: `Content is customized for ${target}. Only this view is affected when you save.`,
    };
  }
  if (inherited === 'persona_stage' || inherited === 'persona') {
    return {
      label: 'PERSONA', bg: 'rgba(68,138,255,0.1)', fg: '#448AFF',
      tooltip: 'Content inherited from this persona\'s default. Saving will create an override for this exact stage + persona.',
    };
  }
  if (inherited === 'stage') {
    return {
      label: 'STAGE', bg: 'rgba(255,179,0,0.1)', fg: '#FFB300',
      tooltip: 'Content inherited from the funnel stage default. Saving will create an override for this exact stage + persona.',
    };
  }
  // inherited === 'control'
  return {
    label: 'DEFAULT', bg: 'rgba(255,179,0,0.1)', fg: '#FFB300',
    tooltip: 'Content inherited from the base default. Saving will create an override for this exact stage + persona — other personas are not affected.',
  };
}

interface ZoneData {
  id: string;
  zone_key: string;
  zone_type: string;
  display_name: string;
  constraints: { maxChars?: number };
  variant_id: string | null;
  variant_content: unknown;
  variant_status: string | null;
  has_stage_override: boolean;
  inherited_from?: InheritedFrom;
  target_variant_name?: string;
}

export default function SectionBuilderPage() {
  const params = useParams();
  const pageSlug = params.pageSlug as string;
  const { selectedMarketId } = useMarket();
  const { canEdit, canPublish, admin } = useAdminAuth();
  const isReadOnly = !canEdit('grow.funnel');
  const canSelfPublish = canPublish('grow.funnel');
  const needsApproval = admin?.requiresPublishApproval && !canSelfPublish;
  const pageInfo = PAGE_SLUGS.find((p) => p.slug === pageSlug);
  const pageSections = getSectionsForPage(pageSlug);

  const [stage, setStage] = useState('awareness');
  const [persona, setPersona] = useState<string | null>(null);
  const [personas, setPersonas] = useState<Array<{ slug: string; label: string; color: string; audience: string }>>([]);
  const [layout, setLayout] = useState<SectionLayoutEntry[]>([]);
  const [zones, setZones] = useState<ZoneData[]>([]);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Fetch personas for this market
  useEffect(() => {
    if (!selectedMarketId) return;
    // Determine audience from page slug
    const audience = pageSlug.startsWith('driver') ? 'driver' : pageSlug.startsWith('rider') ? 'rider' : '';
    const qs = `?market_id=${selectedMarketId}${audience ? `&audience=${audience}` : ''}`;
    fetch(`/api/admin/funnel/personas${qs}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setPersonas((data.personas || []).filter((p: { is_active: boolean }) => p.is_active)))
      .catch((e) => console.error('[CMS] personas fetch failed:', e));
  }, [selectedMarketId, pageSlug]);

  // Reset state when stage, persona, or page changes
  useEffect(() => {
    const defaultLayout: SectionLayoutEntry[] = pageSections.map((s) => ({
      sectionKey: s.sectionKey,
      visible: true,
    }));
    setLayout(defaultLayout);
    setEditedContent({});
    setExpandedSection(null);
  }, [pageSlug, stage, persona]);

  // Fetch existing layout for this stage
  const fetchLayout = useCallback(() => {
    if (!selectedMarketId) return;
    fetch(`/api/admin/funnel/layouts?page_slug=${pageSlug}&stage=${stage}&market_id=${selectedMarketId}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`layout ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data.layout?.sections && Array.isArray(data.layout.sections)) {
          setLayout(data.layout.sections);
        } else {
          // Default layout
          setLayout(pageSections.map((s) => ({ sectionKey: s.sectionKey, visible: true })));
        }
      })
      .catch((e) => {
        console.error('[CMS] layout fetch failed:', e);
        setLoadError(`Failed to load layout: ${e.message || e}`);
      });
  }, [pageSlug, stage, selectedMarketId]);

  useEffect(() => { fetchLayout(); }, [fetchLayout]);

  // Fetch zone content for current stage + persona.
  // persona is included so the server can return the persona-specific variant
  // (falling back through persona_stage → persona → stage → control), ensuring
  // an admin editing persona B never sees persona A's content.
  const fetchZones = useCallback(async () => {
    if (!selectedMarketId) return;
    try {
      const personaParam = persona ? `&persona=${encodeURIComponent(persona)}` : '';
      const r = await fetch(
        `/api/admin/funnel/zones?page=${pageSlug}&market_id=${selectedMarketId}&stage=${stage}${personaParam}`,
        { cache: 'no-store' },
      );
      if (!r.ok) throw new Error(`zones ${r.status}`);
      const data = await r.json();
      setZones(data.zones || []);
      setLoadError(null);
    } catch (e) {
      console.error('[CMS] zones fetch failed:', e);
      setLoadError(`Failed to load zones: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [pageSlug, selectedMarketId, stage, persona]);

  useEffect(() => { fetchZones(); }, [fetchZones]);

  // Save layout
  const saveLayout = async (newLayout: SectionLayoutEntry[]) => {
    if (!selectedMarketId) return;
    setSavingLayout(true);
    try {
      const res = await fetch('/api/admin/funnel/layouts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          page_slug: pageSlug,
          stage,
          market_id: selectedMarketId,
          sections: newLayout,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('[CMS] Layout save failed:', err);
        alert(`Layout save failed: ${err.error || res.statusText}`);
      }
    } catch (e) {
      console.error('[CMS] Layout save error:', e);
      alert(`Layout save error: ${e}`);
    } finally {
      setSavingLayout(false);
    }
  };

  // Drag end handler
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = layout.findIndex((s) => s.sectionKey === active.id);
    const newIndex = layout.findIndex((s) => s.sectionKey === over.id);
    const newLayout = arrayMove(layout, oldIndex, newIndex);
    setLayout(newLayout);
    saveLayout(newLayout);
  };

  // Toggle section visibility
  const toggleVisibility = (sectionKey: string) => {
    const newLayout = layout.map((s) =>
      s.sectionKey === sectionKey ? { ...s, visible: !s.visible } : s
    );
    setLayout(newLayout);
    saveLayout(newLayout);
  };

  // Get zone content (from DB or registry default)
  const getZoneContent = (zoneKey: string): unknown => {
    if (editedContent[zoneKey] !== undefined) return editedContent[zoneKey];
    const dbZone = zones.find((z) => z.zone_key === zoneKey);
    // Explicit null/undefined check — empty strings and other falsy values ('', 0, false) are valid saved content
    if (dbZone && dbZone.variant_content !== undefined && dbZone.variant_content !== null) {
      return dbZone.variant_content;
    }
    const regEntry = ZONE_REGISTRY.find((z) => z.pageSlug === pageSlug && z.zoneKey === zoneKey);
    return regEntry?.defaultContent;
  };

  const getZoneMeta = (zoneKey: string) => {
    const dbZone = zones.find((z) => z.zone_key === zoneKey);
    const regEntry = ZONE_REGISTRY.find((z) => z.pageSlug === pageSlug && z.zoneKey === zoneKey);
    return {
      zoneType: regEntry?.zoneType || 'text',
      displayName: regEntry?.displayName || zoneKey,
      constraints: regEntry?.constraints || {},
      variantId: dbZone?.variant_id || null,
    };
  };

  // Save zone content. Returns true on success so callers (Save All) can detect failure.
  // Accepts an explicit snapshot of stage/persona/content so batched saves are not
  // vulnerable to stale closures if the user switches stage mid-batch.
  const saveZoneWith = async (
    zoneKey: string,
    content: unknown,
    snapStage: string,
    snapPersona: string | null,
  ): Promise<boolean> => {
    if (!selectedMarketId) return false;
    setSaving(true);
    const dbZone = zones.find((z) => z.zone_key === zoneKey);
    const zoneId = dbZone?.id;

    if (!zoneId) {
      console.error('[CMS] Zone not found in DB:', zoneKey);
      alert(`Zone "${zoneKey}" not found. Try clicking "Seed Zones" on the Funnel CMS dashboard first.`);
      setSaving(false);
      return false;
    }

    // Build utm_targets based on snapshot stage + persona
    const utmTargets: Record<string, string[]> = {};
    if (snapStage !== 'awareness') utmTargets.utm_funnel = [snapStage];
    if (snapPersona) utmTargets.utm_persona = [snapPersona];
    const hasTargets = Object.keys(utmTargets).length > 0;

    // Build variant name from targeting
    let variantName = 'control';
    if (snapPersona && snapStage !== 'awareness') variantName = `persona_${snapPersona}_stage_${snapStage}`;
    else if (snapPersona) variantName = `persona_${snapPersona}`;
    else if (snapStage !== 'awareness') variantName = `stage_${snapStage}`;

    const targetLabel = [snapPersona, snapStage !== 'awareness' ? snapStage : null].filter(Boolean).join(' + ') || 'default';
    const saveStatus = needsApproval ? 'pending_approval' : 'published';

    try {
      const res = await fetch('/api/admin/funnel/variants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          zone_id: zoneId,
          market_id: selectedMarketId,
          variant_name: variantName,
          content,
          utm_targets: hasTargets ? utmTargets : undefined,
          change_summary: needsApproval ? `Submitted for approval (${targetLabel})` : `Updated for ${targetLabel}`,
          save_status: saveStatus,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('[CMS] Save failed:', payload);
        alert(`Save failed: ${payload.error || res.statusText || 'Unknown error'}`);
        return false;
      }

      // Merge the authoritative saved variant into local zones so the UI reflects
      // exactly what the server wrote — no refetch race, no stale cache.
      // Only override the displayed variant_content if the snapshot matches
      // what the admin is currently viewing (same stage/persona), so a batch save
      // across stages doesn't overwrite the on-screen zone with a different stage's content.
      const savedVariant = payload.variant as
        | { id: string; content: unknown; status: string | null }
        | undefined;
      const viewingSameTarget = snapStage === stage && snapPersona === persona;
      if (savedVariant && viewingSameTarget) {
        setZones((prev) =>
          prev.map((z) =>
            z.zone_key === zoneKey
              ? {
                  ...z,
                  variant_id: savedVariant.id,
                  variant_content: savedVariant.content,
                  variant_status: savedVariant.status,
                  has_stage_override: snapStage !== 'awareness' || !!snapPersona,
                  // After a successful save for the current target, this zone
                  // is now customized for this exact (stage, persona) combo —
                  // no longer inherited from a less-specific variant.
                  inherited_from: 'custom',
                }
              : z,
          ),
        );
      }

      // Clear the in-memory edit for this zone only if the user is still viewing
      // the same target. Otherwise leave it intact — the user may still want to
      // see their edit on the current view.
      if (viewingSameTarget) {
        setEditedContent((prev) => {
          const next = { ...prev };
          delete next[zoneKey];
          return next;
        });
      }
      return true;
    } catch (e) {
      console.error('[CMS] Save error:', e);
      alert(`Save error: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Thin wrapper — single-zone Save button path. Takes current render state.
  const saveZone = (zoneKey: string) =>
    saveZoneWith(zoneKey, editedContent[zoneKey], stage, persona);

  // Get section definition
  const getSectionDef = (key: string): SectionDefinition | undefined =>
    pageSections.find((s) => s.sectionKey === key);

  return (
    <div style={{ padding: '24px', maxWidth: 800 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Link href="/admin/funnel" style={{ color: 'var(--admin-text-muted)', textDecoration: 'none', fontSize: 14 }}>
          &larr; Funnel CMS
        </Link>
        <span style={{ color: 'var(--admin-text-faint)' }}>/</span>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--admin-text)' }}>
          {pageInfo?.label || pageSlug}
        </h1>
        <a href={`${pageInfo?.path}?utm_funnel=${stage}${persona ? `&utm_persona=${persona}` : ''}`} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 12, color: 'var(--admin-text-muted)', textDecoration: 'underline', marginLeft: 'auto' }}>
          Preview {[stage, persona].filter(Boolean).join(' + ')} &rarr;
        </a>
      </div>

      {/* Load error banner — makes failures visible instead of silent */}
      {loadError && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, marginBottom: 16,
          background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.3)',
          color: '#FF5252', fontSize: 12, fontWeight: 600,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        }}>
          <span>⚠ {loadError}</span>
          <button
            onClick={() => { setLoadError(null); fetchZones(); fetchLayout(); }}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
              background: '#FF5252', color: '#000', border: 'none', cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Read-only banner */}
      {isReadOnly && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, marginBottom: 16,
          background: 'rgba(68,138,255,0.08)', border: '1px solid rgba(68,138,255,0.2)',
          color: '#448AFF', fontSize: 12, fontWeight: 600,
        }}>
          You have view-only access to this page
        </div>
      )}

      {/* Stage + Persona Selectors */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: 'var(--admin-text-faint)', marginBottom: 4, textTransform: 'uppercase' }}>Funnel Stage</div>
          <StageSelector selected={stage} onSelect={setStage} />
        </div>
        {personas.length > 0 && (
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: 'var(--admin-text-faint)', marginBottom: 4, textTransform: 'uppercase' }}>Persona</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                onClick={() => setPersona(null)}
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: !persona ? '2px solid var(--admin-text-muted)' : '2px solid var(--admin-border)',
                  background: !persona ? 'var(--admin-bg-active)' : 'transparent',
                  color: !persona ? 'var(--admin-text)' : 'var(--admin-text-secondary)',
                }}
              >
                All (default)
              </button>
              {personas.map((p) => (
                <button
                  key={p.slug}
                  onClick={() => setPersona(persona === p.slug ? null : p.slug)}
                  style={{
                    padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: persona === p.slug ? `2px solid ${p.color}` : '2px solid var(--admin-border)',
                    background: persona === p.slug ? `${p.color}15` : 'transparent',
                    color: persona === p.slug ? p.color : 'var(--admin-text-secondary)',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Section Builder */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={layout.map((s) => s.sectionKey)} strategy={verticalListSortingStrategy}>
          <div style={{ display: 'grid', gap: 8 }}>
            {layout.map((entry) => {
              const def = getSectionDef(entry.sectionKey);
              if (!def) return null;
              const isExpanded = expandedSection === entry.sectionKey;

              return (
                <SortableSection
                  key={entry.sectionKey}
                  id={entry.sectionKey}
                  def={def}
                  visible={entry.visible}
                  expanded={isExpanded}
                  onToggleVisibility={() => toggleVisibility(entry.sectionKey)}
                  onToggleExpand={() => setExpandedSection(isExpanded ? null : entry.sectionKey)}
                >
                  {isExpanded && (
                    <div style={{ padding: '16px 20px 20px', borderTop: '1px solid var(--admin-border)' }}>
                      <div style={{ display: 'grid', gap: 14 }}>
                        {def.zones.map((zoneKey) => {
                          const meta = getZoneMeta(zoneKey);
                          const content = getZoneContent(zoneKey);
                          const hasEdit = editedContent[zoneKey] !== undefined;

                          const zoneMeta = zones.find((z) => z.zone_key === zoneKey);
                          const inherited = zoneMeta?.inherited_from;
                          const badge = getInheritanceBadge(inherited, stage, persona);
                          return (
                            <div key={zoneKey}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--admin-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {meta.displayName}
                                  {badge && (
                                    <span
                                      title={badge.tooltip}
                                      style={{
                                        fontSize: 8, padding: '1px 5px', borderRadius: 3, fontWeight: 700,
                                        background: badge.bg, color: badge.fg,
                                      }}
                                    >
                                      {badge.label}
                                    </span>
                                  )}
                                </label>
                                {hasEdit && !isReadOnly && (
                                  <button
                                    onClick={() => saveZone(zoneKey)}
                                    disabled={saving}
                                    style={{
                                      padding: '3px 12px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                                      background: needsApproval ? '#FFB300' : '#00E676', color: '#000', border: 'none', cursor: 'pointer',
                                      opacity: saving ? 0.5 : 1,
                                    }}
                                  >
                                    {needsApproval ? 'Submit for Approval' : 'Save'}
                                  </button>
                                )}
                              </div>
                              <ZoneEditor
                                zoneKey={zoneKey}
                                zoneType={meta.zoneType}
                                content={hasEdit ? editedContent[zoneKey] : content}
                                constraints={meta.constraints}
                                onChange={(val) => setEditedContent((prev) => ({ ...prev, [zoneKey]: val }))}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </SortableSection>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* Floating Save All button — visible when any zone has unsaved edits */}
      {Object.keys(editedContent).length > 0 && !isReadOnly && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 100,
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 24px', borderRadius: 12,
          background: '#00E676', color: '#000',
          boxShadow: '0 4px 20px rgba(0,230,118,0.4)',
          fontSize: 14, fontWeight: 700,
        }}>
          <span>{Object.keys(editedContent).length} unsaved change{Object.keys(editedContent).length > 1 ? 's' : ''}</span>
          <button
            onClick={async () => {
              // Snapshot state at click time so a user switching stage/persona
              // mid-batch cannot redirect in-flight saves to a different variant.
              const snapStage = stage;
              const snapPersona = persona;
              const snapEdits = { ...editedContent };
              let failed = 0;
              for (const key of Object.keys(snapEdits)) {
                const ok = await saveZoneWith(key, snapEdits[key], snapStage, snapPersona);
                if (!ok) failed++;
              }
              if (failed > 0) {
                alert(`${failed} zone${failed > 1 ? 's' : ''} failed to save. Check console for details.`);
              }
            }}
            disabled={saving}
            style={{
              padding: '6px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: '#000', color: '#00E676', border: 'none', cursor: 'pointer',
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save All'}
          </button>
          <button
            onClick={() => setEditedContent({})}
            style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 11,
              background: 'transparent', color: '#000', border: '1px solid rgba(0,0,0,0.2)', cursor: 'pointer',
            }}
          >
            Discard
          </button>
        </div>
      )}

      {savingLayout && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, padding: '8px 16px', borderRadius: 8, background: '#00E676', color: '#000', fontSize: 12, fontWeight: 600 }}>
          Layout saved
        </div>
      )}
    </div>
  );
}

// Sortable section card
function SortableSection({
  id,
  def,
  visible,
  expanded,
  onToggleVisibility,
  onToggleExpand,
  children,
}: {
  id: string;
  def: SectionDefinition;
  visible: boolean;
  expanded: boolean;
  onToggleVisibility: () => void;
  onToggleExpand: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : visible ? 1 : 0.4,
    background: 'var(--admin-bg-elevated)',
    border: `1px solid ${expanded ? 'var(--admin-text-faint)' : 'var(--admin-border)'}`,
    borderRadius: 12,
    overflow: 'hidden',
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
        cursor: 'pointer',
      }}>
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          style={{ cursor: 'grab', fontSize: 14, color: 'var(--admin-text-faint)', touchAction: 'none' }}
        >
          ⠿
        </div>

        {/* Section icon + label */}
        <div onClick={onToggleExpand} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>{def.icon}</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--admin-text)' }}>{def.label}</div>
            <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>{def.description}</div>
          </div>
        </div>

        {/* Visibility toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }}
          style={{
            padding: '4px 8px', borderRadius: 6, fontSize: 14, border: 'none',
            background: 'transparent', cursor: 'pointer',
            color: visible ? 'var(--admin-text)' : 'var(--admin-text-faint)',
          }}
          title={visible ? 'Visible' : 'Hidden'}
        >
          {visible ? '👁' : '👁‍🗨'}
        </button>

        {/* Expand chevron */}
        <button
          onClick={onToggleExpand}
          style={{
            padding: '4px 8px', borderRadius: 6, fontSize: 12, border: 'none',
            background: 'transparent', cursor: 'pointer', color: 'var(--admin-text-muted)',
            transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s',
          }}
        >
          ▼
        </button>
      </div>

      {children}
    </div>
  );
}
