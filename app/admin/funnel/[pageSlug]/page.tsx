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
    fetch(`/api/admin/funnel/personas${qs}`)
      .then((r) => r.json())
      .then((data) => setPersonas((data.personas || []).filter((p: { is_active: boolean }) => p.is_active)))
      .catch(() => {});
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
    fetch(`/api/admin/funnel/layouts?page_slug=${pageSlug}&stage=${stage}&market_id=${selectedMarketId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.layout?.sections && Array.isArray(data.layout.sections)) {
          setLayout(data.layout.sections);
        } else {
          // Default layout
          setLayout(pageSections.map((s) => ({ sectionKey: s.sectionKey, visible: true })));
        }
      })
      .catch(() => {});
  }, [pageSlug, stage, selectedMarketId]);

  useEffect(() => { fetchLayout(); }, [fetchLayout]);

  // Fetch zone content for current stage
  const fetchZones = useCallback(() => {
    if (!selectedMarketId) return;
    fetch(`/api/admin/funnel/zones?page=${pageSlug}&market_id=${selectedMarketId}&stage=${stage}`)
      .then((r) => r.json())
      .then((data) => setZones(data.zones || []))
      .catch(() => {});
  }, [pageSlug, selectedMarketId, stage]);

  useEffect(() => { fetchZones(); }, [fetchZones]);

  // Save layout
  const saveLayout = async (newLayout: SectionLayoutEntry[]) => {
    if (!selectedMarketId) return;
    setSavingLayout(true);
    await fetch('/api/admin/funnel/layouts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_slug: pageSlug,
        stage,
        market_id: selectedMarketId,
        sections: newLayout,
      }),
    });
    setSavingLayout(false);
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
    if (dbZone?.variant_content) return dbZone.variant_content;
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

  // Save zone content
  const saveZone = async (zoneKey: string) => {
    if (!selectedMarketId) return;
    setSaving(true);
    const content = editedContent[zoneKey];
    const dbZone = zones.find((z) => z.zone_key === zoneKey);
    const zoneId = dbZone?.id;

    if (!zoneId) {
      console.error('[CMS] Zone not found in DB:', zoneKey);
      alert(`Zone "${zoneKey}" not found. Try clicking "Seed Zones" on the Funnel CMS dashboard first.`);
      setSaving(false);
      return;
    }

    // Build utm_targets based on stage + persona selection
    const utmTargets: Record<string, string[]> = {};
    if (stage !== 'awareness') utmTargets.utm_funnel = [stage];
    if (persona) utmTargets.utm_persona = [persona];
    const hasTargets = Object.keys(utmTargets).length > 0;

    // Build variant name from targeting
    let variantName = 'control';
    if (persona && stage !== 'awareness') variantName = `persona_${persona}_stage_${stage}`;
    else if (persona) variantName = `persona_${persona}`;
    else if (stage !== 'awareness') variantName = `stage_${stage}`;

    const targetLabel = [persona, stage !== 'awareness' ? stage : null].filter(Boolean).join(' + ') || 'default';
    const saveStatus = needsApproval ? 'pending_approval' : 'published';

    try {
      const res = await fetch('/api/admin/funnel/variants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('[CMS] Save failed:', err);
        alert(`Save failed: ${err.error || res.statusText}`);
        setSaving(false);
        return;
      }
      // Clear edit state and refresh
      setEditedContent((prev) => {
        const next = { ...prev };
        delete next[zoneKey];
        return next;
      });
      fetchZones();
    } catch (e) {
      console.error('[CMS] Save error:', e);
      alert(`Save error: ${e}`);
    } finally {
      setSaving(false);
    }
  };

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

                          return (
                            <div key={zoneKey}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--admin-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {meta.displayName}
                                  {stage !== 'awareness' && (
                                    <span style={{
                                      fontSize: 8, padding: '1px 5px', borderRadius: 3, fontWeight: 700,
                                      background: zones.find(z => z.zone_key === zoneKey)?.has_stage_override
                                        ? 'rgba(0,230,118,0.1)' : 'rgba(255,179,0,0.1)',
                                      color: zones.find(z => z.zone_key === zoneKey)?.has_stage_override
                                        ? '#00E676' : '#FFB300',
                                    }}>
                                      {zones.find(z => z.zone_key === zoneKey)?.has_stage_override ? 'CUSTOM' : 'DEFAULT'}
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
