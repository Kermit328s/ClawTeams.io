/**
 * 存储服务统一导出
 */
export {
  StorageService,
  type IStorageService,
  type StorageConfig,
  type UploadParams,
  type UploadResult,
  type ObjectMeta,
  type ListParams,
  type ListResult,
} from './storage-service';

export {
  PresignedUrlService,
  type IPresignedUrlService,
  type PresignedUrlParams,
  type PresignedUploadParams,
  type PresignedUrlResult,
} from './presigned-url-service';
