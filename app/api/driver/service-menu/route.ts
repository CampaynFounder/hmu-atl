import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import {
  getPlatformMenuItems,
  getDriverMenu,
  getDriverMenuCount,
  checkTierLimit,
  upsertDriverMenuItem,
  updateDriverMenuItem,
  removeDriverMenuItem,
  deleteCustomMenuItem,
} from '@/lib/db/service-menu';

// GET — Returns driver's menu + platform catalog
export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userRows = await sql`
      SELECT id, tier FROM users WHERE clerk_id = ${clerkId} LIMIT 1
    `;
    if (!userRows.length) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = userRows[0] as { id: string; tier: string };
    const userId = user.id;
    const tier = user.tier as 'free' | 'hmu_first';

    const [menu, catalog, counts] = await Promise.all([
      getDriverMenu(userId),
      getPlatformMenuItems(),
      getDriverMenuCount(userId),
    ]);

    return NextResponse.json({
      menu,
      catalog,
      counts,
      tier,
      limits: {
        maxItems: tier === 'hmu_first' ? null : 5,
        maxCustom: null,
      },
    });
  } catch (error) {
    console.error('Service menu GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load service menu' },
      { status: 500 }
    );
  }
}

// POST — Add/enable a menu item
export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userRows = await sql`
      SELECT id, tier FROM users WHERE clerk_id = ${clerkId} LIMIT 1
    `;
    if (!userRows.length) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = userRows[0] as { id: string; tier: string };
    const userId = user.id;
    const tier = user.tier as 'free' | 'hmu_first';

    let body: {
      item_id?: string;
      custom_name?: string;
      custom_icon?: string;
      price: number;
      pricing_type: string;
      unit_label?: string;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (body.price === undefined || !body.pricing_type) {
      return NextResponse.json({ error: 'price and pricing_type are required' }, { status: 400 });
    }

    const counts = await getDriverMenuCount(userId);
    const isCustom = !body.item_id;
    const limitCheck = checkTierLimit(tier, counts, isCustom);

    if (!limitCheck.allowed) {
      return NextResponse.json(
        { error: 'upgrade_required', reason: limitCheck.reason },
        { status: 403 }
      );
    }

    const item = await upsertDriverMenuItem(userId, body);

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error('Service menu POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add menu item' },
      { status: 500 }
    );
  }
}

// PATCH — Update price, toggle active, rename custom
export async function PATCH(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userRows = await sql`
      SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1
    `;
    if (!userRows.length) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = (userRows[0] as { id: string }).id;

    let body: {
      menu_item_id: string;
      price?: number;
      is_active?: boolean;
      custom_name?: string;
      custom_icon?: string;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (!body.menu_item_id) {
      return NextResponse.json({ error: 'menu_item_id is required' }, { status: 400 });
    }

    const { menu_item_id, ...updates } = body;
    const item = await updateDriverMenuItem(userId, menu_item_id, updates);

    return NextResponse.json(item);
  } catch (error) {
    console.error('Service menu PATCH error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update menu item' },
      { status: 500 }
    );
  }
}

// DELETE — Remove/deactivate item
export async function DELETE(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userRows = await sql`
      SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1
    `;
    if (!userRows.length) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = (userRows[0] as { id: string }).id;

    let body: { menu_item_id: string; permanent?: boolean };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (!body.menu_item_id) {
      return NextResponse.json({ error: 'menu_item_id is required' }, { status: 400 });
    }

    // Soft-delete first so the item disappears from the driver's menu even if
    // a hard delete is blocked. Works for both custom and platform items —
    // deleteCustomMenuItem only touches custom rows (item_id IS NULL).
    await removeDriverMenuItem(userId, body.menu_item_id);

    if (body.permanent) {
      try {
        await deleteCustomMenuItem(userId, body.menu_item_id);
      } catch (err: unknown) {
        // 23503 = FK violation: item is referenced by ride_add_ons from a past
        // ride. Soft delete already succeeded, so the UI is consistent. The
        // denormalized name/price in ride_add_ons keeps that history intact.
        const code = (err as { code?: string })?.code;
        const msg = err instanceof Error ? err.message : '';
        if (code !== '23503' && !msg.includes('violates foreign key')) throw err;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Service menu DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove menu item' },
      { status: 500 }
    );
  }
}
