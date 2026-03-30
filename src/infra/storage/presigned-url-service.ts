/**
 * 预签名 URL 生成服务
 * 支持上传和下载预签名 URL
 */

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageService } from './storage-service';

// ─── 预签名 URL 参数 ───
export interface PresignedUrlParams {
  /** 对象键 */
  key: string;
  /** 存储桶（不传则使用默认桶） */
  bucket?: string;
  /** URL 有效期（秒），默认 3600 */
  expiresIn?: number;
}

// ─── 上传预签名 URL 参数 ───
export interface PresignedUploadParams extends PresignedUrlParams {
  /** 限制上传的 Content-Type */
  contentType?: string;
  /** 限制上传文件大小上限（字节） */
  maxSizeBytes?: number;
  /** 自定义元数据 */
  metadata?: Record<string, string>;
}

// ─── 预签名 URL 结果 ───
export interface PresignedUrlResult {
  /** 预签名 URL */
  url: string;
  /** 过期时间 */
  expires_at: string;
  /** HTTP 方法 */
  method: 'GET' | 'PUT';
  /** 对象键 */
  key: string;
  /** 存储桶 */
  bucket: string;
}

// ─── 预签名 URL 服务接口 ───
export interface IPresignedUrlService {
  /** 生成下载预签名 URL */
  getDownloadUrl(params: PresignedUrlParams): Promise<PresignedUrlResult>;
  /** 生成上传预签名 URL */
  getUploadUrl(params: PresignedUploadParams): Promise<PresignedUrlResult>;
}

// ─── 预签名 URL 服务实现 ───
export class PresignedUrlService implements IPresignedUrlService {
  private storageService: StorageService;

  constructor(storageService: StorageService) {
    this.storageService = storageService;
  }

  async getDownloadUrl(params: PresignedUrlParams): Promise<PresignedUrlResult> {
    const bucket = params.bucket ?? this.storageService.getDefaultBucket();
    const expiresIn = params.expiresIn ?? 3600;

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: params.key,
    });

    const url = await getSignedUrl(this.storageService.getClient(), command, {
      expiresIn,
    });

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    return {
      url,
      expires_at: expiresAt,
      method: 'GET',
      key: params.key,
      bucket,
    };
  }

  async getUploadUrl(params: PresignedUploadParams): Promise<PresignedUrlResult> {
    const bucket = params.bucket ?? this.storageService.getDefaultBucket();
    const expiresIn = params.expiresIn ?? 3600;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      ContentType: params.contentType,
      Metadata: params.metadata,
    });

    const url = await getSignedUrl(this.storageService.getClient(), command, {
      expiresIn,
    });

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    return {
      url,
      expires_at: expiresAt,
      method: 'PUT',
      key: params.key,
      bucket,
    };
  }
}
