/**
 * 档案（Artifact）类型定义
 * 对应 contracts/artifact-schema.yaml
 */

// ─── 档案类型 ───
export type ArtifactType =
  | 'document'
  | 'code'
  | 'dataset'
  | 'report'
  | 'image'
  | 'video'
  | 'config'
  | 'model'
  | 'composite';

// ─── 存储后端 ───
export type StorageBackend = 'r2' | 's3' | 'minio';

// ─── 可见性 ───
export type ArtifactVisibility = 'private' | 'team' | 'public';

// ─── 存储位置 ───
export interface ArtifactStorage {
  /** 存储后端 */
  backend: StorageBackend;
  /** 存储桶名 */
  bucket: string;
  /** 对象键 */
  key: string;
  /** 文件大小（字节） */
  size_bytes?: number;
  /** MIME 类型 */
  content_type?: string;
  /** SHA-256 校验和 */
  checksum_sha256?: string;
}

// ─── 访问控制 ───
export interface ArtifactAccessControl {
  /** 可见性 */
  visibility: ArtifactVisibility;
  /** 允许访问的龙虾列表（visibility=private 时生效） */
  allowed_agents?: string[];
  /** 允许访问的团队列表 */
  allowed_teams?: string[];
}

// ─── 档案实体 ───
export interface Artifact {
  /** 档案唯一标识 */
  artifact_id: string;
  /** 档案类型 */
  type: ArtifactType;
  /** 标题 */
  title: string;
  /** 描述 */
  description?: string;
  /** 创建者 ID（龙虾或用户） */
  created_by: string;
  /** 创建时间 */
  created_at: string;
  /** 更新时间 */
  updated_at?: string;
  /** 版本号 */
  version: number;
  /** 存储位置 */
  storage: ArtifactStorage;
  /** 标签 */
  tags: string[];
  /** 关联任务 ID 列表 */
  related_task_ids: string[];
  /** 访问控制 */
  access_control?: ArtifactAccessControl;
  /** 扩展元数据 */
  metadata?: Record<string, unknown>;
}

// ─── 创建档案请求 ───
export interface CreateArtifactRequest {
  type: ArtifactType;
  title: string;
  description?: string;
  storage: Omit<ArtifactStorage, 'backend'> & { backend?: StorageBackend };
  related_task_ids?: string[];
  tags?: string[];
  access_control?: ArtifactAccessControl;
}
