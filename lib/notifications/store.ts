import { neon } from '@neondatabase/serverless';

type NotificationType =
  | 'ride_accepted'
  | 'driver_arrived'
  | 'ride_completed'
  | 'dispute_update'
  | 'payment_received'
  | 'promotion';

type NotificationPriority = 'normal' | 'high' | 'urgent';

interface StoreNotificationArgs {
  userId: string;
  notificationType: NotificationType;
  title: string;
  message: string;
  priority?: NotificationPriority;
  relatedEntityType?: string;
  relatedEntityId?: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Persist a notification record to Neon.
 */
export async function storeNotification(
  args: StoreNotificationArgs
): Promise<string> {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    INSERT INTO notifications (
      user_id,
      notification_type,
      title,
      message,
      priority,
      is_read,
      related_entity_type,
      related_entity_id,
      action_url,
      metadata,
      created_at
    ) VALUES (
      ${args.userId},
      ${args.notificationType},
      ${args.title},
      ${args.message},
      ${args.priority ?? 'normal'},
      false,
      ${args.relatedEntityType ?? null},
      ${args.relatedEntityId ?? null},
      ${args.actionUrl ?? null},
      ${args.metadata ? JSON.stringify(args.metadata) : null},
      NOW()
    )
    RETURNING id
  `;
  return rows[0].id as string;
}
