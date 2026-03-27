// Driver Service Menu Operations
// Platform catalog, driver menu config, ride add-ons

import { sql } from './client';
import type { ServiceMenuItem, DriverServiceMenuItem, RideAddOn } from './types';

const FREE_TIER_MAX_ITEMS = 5;

// ============================================
// PLATFORM CATALOG
// ============================================

export async function getPlatformMenuItems(): Promise<ServiceMenuItem[]> {
  const rows = await sql`
    SELECT * FROM service_menu_items
    WHERE is_active = true
    ORDER BY sort_order
  `;
  return rows as ServiceMenuItem[];
}

// ============================================
// DRIVER MENU
// ============================================

export async function getDriverMenu(driverId: string): Promise<DriverServiceMenuItem[]> {
  const rows = await sql`
    SELECT
      dsm.*,
      COALESCE(dsm.custom_name, smi.name) as name,
      COALESCE(dsm.custom_icon, smi.icon) as icon,
      COALESCE(smi.category, 'custom') as category
    FROM driver_service_menu dsm
    LEFT JOIN service_menu_items smi ON dsm.item_id = smi.id
    WHERE dsm.driver_id = ${driverId} AND dsm.is_active = true
    ORDER BY dsm.sort_order, dsm.created_at
  `;
  return rows as DriverServiceMenuItem[];
}

export async function getDriverMenuForRider(driverId: string): Promise<DriverServiceMenuItem[]> {
  const rows = await sql`
    SELECT
      dsm.id, dsm.price, dsm.pricing_type, dsm.unit_label, dsm.item_id,
      COALESCE(dsm.custom_name, smi.name) as name,
      COALESCE(dsm.custom_icon, smi.icon) as icon,
      COALESCE(smi.category, 'custom') as category
    FROM driver_service_menu dsm
    LEFT JOIN service_menu_items smi ON dsm.item_id = smi.id
    WHERE dsm.driver_id = ${driverId} AND dsm.is_active = true
    ORDER BY dsm.sort_order, dsm.created_at
  `;
  return rows as DriverServiceMenuItem[];
}

export async function getDriverMenuCount(driverId: string): Promise<{ total: number; custom: number }> {
  const rows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE is_active = true) as total,
      COUNT(*) FILTER (WHERE is_active = true AND item_id IS NULL) as custom
    FROM driver_service_menu
    WHERE driver_id = ${driverId}
  `;
  return {
    total: Number(rows[0]?.total ?? 0),
    custom: Number(rows[0]?.custom ?? 0),
  };
}

export function checkTierLimit(
  tier: 'free' | 'hmu_first',
  currentCount: { total: number; custom: number },
  _isCustom: boolean
): { allowed: boolean; upgradeRequired: boolean; reason?: string } {
  if (tier === 'hmu_first') return { allowed: true, upgradeRequired: false };

  if (currentCount.total >= FREE_TIER_MAX_ITEMS) {
    return {
      allowed: false,
      upgradeRequired: true,
      reason: `You've reached ${FREE_TIER_MAX_ITEMS} menu items. Upgrade to HMU First for unlimited items.`,
    };
  }

  return { allowed: true, upgradeRequired: false };
}

export async function upsertDriverMenuItem(
  driverId: string,
  item: {
    item_id?: string;
    custom_name?: string;
    custom_icon?: string;
    price: number;
    pricing_type: string;
    unit_label?: string;
  }
): Promise<DriverServiceMenuItem> {
  if (item.item_id) {
    // Platform item — upsert by driver_id + item_id
    const rows = await sql`
      INSERT INTO driver_service_menu (driver_id, item_id, custom_name, price, pricing_type, unit_label, is_active)
      VALUES (${driverId}, ${item.item_id}, ${item.custom_name ?? null}, ${item.price}, ${item.pricing_type}, ${item.unit_label ?? null}, true)
      ON CONFLICT (driver_id, item_id)
      DO UPDATE SET price = EXCLUDED.price, pricing_type = EXCLUDED.pricing_type,
        unit_label = EXCLUDED.unit_label, custom_name = EXCLUDED.custom_name, is_active = true
      RETURNING *
    `;
    return rows[0] as DriverServiceMenuItem;
  } else {
    // Custom item
    const rows = await sql`
      INSERT INTO driver_service_menu (driver_id, custom_name, custom_icon, price, pricing_type, unit_label, is_active)
      VALUES (${driverId}, ${item.custom_name ?? 'Custom Fee'}, ${item.custom_icon ?? '💲'}, ${item.price}, ${item.pricing_type}, ${item.unit_label ?? null}, true)
      RETURNING *
    `;
    return rows[0] as DriverServiceMenuItem;
  }
}

export async function updateDriverMenuItem(
  driverId: string,
  menuItemId: string,
  updates: { price?: number; is_active?: boolean; custom_name?: string; custom_icon?: string }
): Promise<DriverServiceMenuItem | null> {
  // Editing an item always re-activates it (unless explicitly deactivating)
  const isActive = updates.is_active ?? true;
  const rows = await sql`
    UPDATE driver_service_menu
    SET
      price = COALESCE(${updates.price ?? null}, price),
      is_active = ${isActive},
      custom_name = COALESCE(${updates.custom_name ?? null}, custom_name),
      custom_icon = COALESCE(${updates.custom_icon ?? null}, custom_icon)
    WHERE id = ${menuItemId} AND driver_id = ${driverId}
    RETURNING *
  `;
  return (rows[0] as DriverServiceMenuItem) ?? null;
}

export async function removeDriverMenuItem(driverId: string, menuItemId: string): Promise<void> {
  await sql`
    UPDATE driver_service_menu
    SET is_active = false
    WHERE id = ${menuItemId} AND driver_id = ${driverId}
  `;
}

export async function deleteCustomMenuItem(driverId: string, menuItemId: string): Promise<void> {
  await sql`
    DELETE FROM driver_service_menu
    WHERE id = ${menuItemId} AND driver_id = ${driverId} AND item_id IS NULL
  `;
}

// ============================================
// RIDE ADD-ONS
// ============================================

export async function addRideAddOn(
  rideId: string,
  menuItemId: string,
  quantity: number = 1
): Promise<RideAddOn> {
  // Look up the menu item to get name + price
  const itemRows = await sql`
    SELECT dsm.id, dsm.price, dsm.pricing_type, dsm.unit_label,
      COALESCE(dsm.custom_name, smi.name) as name
    FROM driver_service_menu dsm
    LEFT JOIN service_menu_items smi ON dsm.item_id = smi.id
    WHERE dsm.id = ${menuItemId}
  `;
  if (!itemRows[0]) throw new Error('Menu item not found');
  const item = itemRows[0] as Record<string, unknown>;

  const unitPrice = Number(item.price);
  const subtotal = Math.round(unitPrice * quantity * 100) / 100;

  const rows = await sql`
    INSERT INTO ride_add_ons (ride_id, menu_item_id, name, unit_price, quantity, subtotal, added_by, status)
    VALUES (${rideId}, ${menuItemId}, ${item.name}, ${unitPrice}, ${quantity}, ${subtotal}, 'rider', 'pre_selected')
    RETURNING *
  `;
  return rows[0] as RideAddOn;
}

export async function getRideAddOns(rideId: string): Promise<RideAddOn[]> {
  const rows = await sql`
    SELECT * FROM ride_add_ons
    WHERE ride_id = ${rideId}
    ORDER BY added_at
  `;
  return rows as RideAddOn[];
}

export async function updateAddOnStatus(
  addOnId: string,
  status: string,
  adjustedAmount?: number,
  disputeReason?: string
): Promise<RideAddOn | null> {
  const finalAmount = status === 'adjusted' && adjustedAmount !== undefined
    ? adjustedAmount
    : status === 'removed'
    ? 0
    : null;

  const rows = await sql`
    UPDATE ride_add_ons
    SET
      status = ${status},
      rider_adjusted_amount = ${adjustedAmount ?? null},
      dispute_reason = ${disputeReason ?? null},
      final_amount = COALESCE(${finalAmount}, subtotal),
      confirmed_at = CASE WHEN ${status} IN ('confirmed', 'adjusted') THEN NOW() ELSE confirmed_at END
    WHERE id = ${addOnId}
    RETURNING *
  `;
  return (rows[0] as RideAddOn) ?? null;
}

export async function removeRideAddOn(addOnId: string, rideId: string): Promise<void> {
  await sql`
    UPDATE ride_add_ons
    SET status = 'removed', final_amount = 0
    WHERE id = ${addOnId} AND ride_id = ${rideId}
  `;
}

export async function confirmAllAddOns(rideId: string): Promise<void> {
  await sql`
    UPDATE ride_add_ons
    SET status = 'confirmed', final_amount = subtotal, confirmed_at = NOW()
    WHERE ride_id = ${rideId} AND status = 'pre_selected'
  `;
}

export async function calculateAddOnTotal(rideId: string): Promise<number> {
  const rows = await sql`
    SELECT COALESCE(SUM(
      CASE
        WHEN status = 'removed' THEN 0
        WHEN status = 'adjusted' THEN COALESCE(rider_adjusted_amount, subtotal)
        WHEN status = 'disputed' THEN 0
        ELSE subtotal
      END
    ), 0) as total
    FROM ride_add_ons
    WHERE ride_id = ${rideId}
  `;
  return Number(rows[0]?.total ?? 0);
}
