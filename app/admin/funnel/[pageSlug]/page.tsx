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

  // Reset state when stage or page changes
  useEffect(() => {
    const defaultLayout: SectionLayoutEntry[] = pageSections.map((s) => ({
      sectionKey: s.sectionKey,
      visible: true,
    }));
    setLayout(defaultLayout);
    setEditedContent({});
    setExpandedSection(null);
  }, [pageSlug, stage]);

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

    // Find zone_id from DB zones or look it up
    let zoneId = dbZone ? (dbZone as unknown as { id: string }).id : null;
    if (!zoneId) {
      // Need to find zone ID from the zones list
      const allZones = zones as unknown as Array<{ id: string; zone_key: string }>;
      const match = allZones.find((z) => z.zone_key === zoneKey);
      zoneId = match?.id || null;
    }

    if (!zoneId) {
      // Zone not seeded yet
      setSaving(false);
      return;
    }

    const utmTargets = stage !== 'awareness' ? { utm_funnel: [stage] } : undefined;

    const saveStatus = needsApproval ? 'pending_approval' : 'published';

    await fetch('/api/admin/funnel/variants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        zone_id: zoneId,
        market_id: selectedMarketId,
        variant_name: stage === 'awareness' ? 'control' : `stage_${stage}`,
        content,
        utm_targets: utmTargets,
        change_summary: needsApproval ? `Submitted for approval (${stage} stage)` : `Updated for ${stage} stage`,
        save_status: saveStatus,
      }),
    });

    // Clear edit state and refresh
    setEditedContent((prev) => {
      const next = { ...prev };
      delete next[zoneKey];
      return next;
    });
    fetchZones();
    setSaving(false);
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
        <a href={`${pageInfo?.path}?utm_funnel=${stage}`} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 12, color: 'var(--admin-text-muted)', textDecoration: 'underline', marginLeft: 'auto' }}>
          Preview {stage} &rarr;
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

      {/* Stage Selector */}
      <div style={{ marginBottom: 20 }}>
        <StageSelector selected={stage} onSelect={setStage} />
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
