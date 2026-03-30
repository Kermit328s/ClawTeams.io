/**
 * 权限模块统一导出
 */
export { PermissionService, type LayerLockConfig, type DerivedPermissions, type PermissionCheckOptions } from './permission.service';
export { createPermissionGuard, requireAdmin, requireTeamMembership, type PermissionGuardOptions } from './permission.middleware';
