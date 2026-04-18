// Driver FB Groups — admin-configurable list of Facebook groups where drivers can post links.

import { sql } from '@/lib/db/client';

export interface DriverFbGroup {
  id: string;
  market_slug: string;
  name: string;
  url: string;
  audience: string | null;
  suggested_caption: string | null;
  why_this_group: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export async function listFbGroups(marketSlug?: string, onlyActive = false): Promise<DriverFbGroup[]> {
  if (marketSlug && onlyActive) {
    return (await sql`
      SELECT * FROM driver_fb_groups
      WHERE market_slug = ${marketSlug} AND is_active = TRUE
      ORDER BY sort_order ASC, name ASC
    `) as DriverFbGroup[];
  }
  if (marketSlug) {
    return (await sql`
      SELECT * FROM driver_fb_groups
      WHERE market_slug = ${marketSlug}
      ORDER BY sort_order ASC, name ASC
    `) as DriverFbGroup[];
  }
  return (await sql`
    SELECT * FROM driver_fb_groups
    ORDER BY market_slug ASC, sort_order ASC, name ASC
  `) as DriverFbGroup[];
}

export interface FbGroupInput {
  market_slug: string;
  name: string;
  url: string;
  audience?: string | null;
  suggested_caption?: string | null;
  why_this_group?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export async function createFbGroup(input: FbGroupInput, createdBy: string): Promise<DriverFbGroup> {
  const rows = await sql`
    INSERT INTO driver_fb_groups (
      market_slug, name, url, audience, suggested_caption, why_this_group,
      sort_order, is_active, created_by, updated_by
    ) VALUES (
      ${input.market_slug}, ${input.name}, ${input.url},
      ${input.audience ?? null}, ${input.suggested_caption ?? null}, ${input.why_this_group ?? null},
      ${input.sort_order ?? 0}, ${input.is_active ?? true}, ${createdBy}, ${createdBy}
    )
    RETURNING *
  `;
  return rows[0] as DriverFbGroup;
}

export async function updateFbGroup(id: string, input: FbGroupInput, updatedBy: string): Promise<DriverFbGroup | null> {
  const rows = await sql`
    UPDATE driver_fb_groups
    SET
      market_slug = ${input.market_slug},
      name = ${input.name},
      url = ${input.url},
      audience = ${input.audience ?? null},
      suggested_caption = ${input.suggested_caption ?? null},
      why_this_group = ${input.why_this_group ?? null},
      sort_order = ${input.sort_order ?? 0},
      is_active = ${input.is_active ?? true},
      updated_by = ${updatedBy},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as DriverFbGroup) ?? null;
}

export async function deleteFbGroup(id: string): Promise<boolean> {
  const rows = await sql`DELETE FROM driver_fb_groups WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}
