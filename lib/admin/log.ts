import sql from './db';

export async function logAdminAction(
  adminUserId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await sql`
    INSERT INTO admin_actions
      (admin_user_id, action, target_type, target_id, metadata, created_at)
    VALUES
      (${adminUserId}, ${action}, ${targetType}, ${targetId},
       ${JSON.stringify(metadata ?? {})}::jsonb, NOW())
  `;
}
