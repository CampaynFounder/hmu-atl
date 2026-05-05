// Audit event names for the admin_dashboards feature.
//
// Convention: <feature>.<thing>.<verb> — matches the data_room.* / chill_config.*
// pattern already in use. Pass to logAdminAction(admin.id, EVENT, target_type,
// target_id, details). target_type is always 'admin_dashboard' or
// 'admin_dashboard_role_grant'; target_id is the dashboard id.

export const DASHBOARD_AUDIT = {
  CREATED: 'dashboard.created',
  UPDATED: 'dashboard.updated',
  DELETED: 'dashboard.deleted',
  ROLE_GRANTED: 'dashboard.role_granted',
  ROLE_REVOKED: 'dashboard.role_revoked',
  VIEWED: 'dashboard.viewed', // one row per render of a dashboard, not per block
} as const;

export type DashboardAuditEvent = (typeof DASHBOARD_AUDIT)[keyof typeof DASHBOARD_AUDIT];

// target_type values used alongside the events above. Keeping them as
// constants prevents drift between callers.
export const DASHBOARD_AUDIT_TARGET = {
  DASHBOARD: 'admin_dashboard',
  ROLE_GRANT: 'admin_dashboard_role_grant',
} as const;

export type DashboardAuditTarget = (typeof DASHBOARD_AUDIT_TARGET)[keyof typeof DASHBOARD_AUDIT_TARGET];
