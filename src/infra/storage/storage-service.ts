/**
 * 对象存储服务接口与实现
 * 兼容 R2 / MinIO / S3
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';

// ─── 存储配置 ───
export interface StorageConfig {
  /** 存储后端类型 */
  backend: 'r2' | 's3' | 'minio';
  /** S3 兼容端点 */
  endpoint: string;
  /** 区域 */
  region: string;
  /** 访问密钥 ID */
  accessKeyId: string;
  /** 秘密访问密钥 */
  secretAccessKey: string;
  /** 默认存储桶 */
  defaultBucket: string;
  /** 是否强制路径风格访问（MinIO 需要） */
  forcePathStyle?: boolean;
}

// ─── 上传参数 ───
export interface UploadParams {
  bucket?: string;
  key: string;
  body: Buffer | Readable | string;
  contentType?: string;
  metadata?: Record<string, string>;
}

// ─── 上传结果 ───
export interface UploadResult {
  bucket: string;
  key: string;
  etag?: string;
  size_bytes: number;
}

// ─── 对象元数据 ───
export interface ObjectMeta {
  key: string;
  size_bytes: number;
  content_type?: string;
  etag?: string;
  last_modified?: Date;
  metadata?: Record<string, string>;
}

// ─── 列表参数 ───
export interface ListParams {
  bucket?: string;
  prefix?: string;
  maxKeys?: number;
  continuationToken?: string;
}

// ─── 列表结果 ───
export interface ListResult {
  objects: ObjectMeta[];
  isTruncated: boolean;
  nextContinuationToken?: string;
}

// ─── 存储服务接口 ───
export interface IStorageService {
  upload(params: UploadParams): Promise<UploadResult>;
  download(key: string, bucket?: string): Promise<{ body: Readable; meta: ObjectMeta }>;
  delete(key: string, bucket?: string): Promise<void>;
  head(key: string, bucket?: string): Promise<ObjectMeta>;
  list(params?: ListParams): Promise<ListResult>;
  copy(sourceKey: string, destKey: string, sourceBucket?: string, destBucket?: string): Promise<void>;
  exists(key: string, bucket?: string): Promise<boolean>;
}

// ─── S3 兼容存储服务实现 ───
export class StorageService implements IStorageService {
  private client: S3Client;
  private defaultBucket: string;
  private backend: string;

  constructor(config: StorageConfig) {
    const s3Config: S3ClientConfig = {
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle ?? (config.backend === 'minio'),
    };

    this.client = new S3Client(s3Config);
    this.defaultBucket = config.defaultBucket;
    this.backend = config.backend;
  }

  async upload(params: UploadParams): Promise<UploadResult> {
    const bucket = params.bucket ?? this.defaultBucket;
    const body = params.body;

    let sizeBytes = 0;
    if (Buffer.isBuffer(body)) {
      sizeBytes = body.length;
    } else if (typeof body === 'string') {
      sizeBytes = Buffer.byteLength(body, 'utf-8');
    }

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: body,
      ContentType: params.contentType,
      Metadata: params.metadata,
    });

    const result = await this.client.send(command);

    return {
      bucket,
      key: params.key,
      etag: result.ETag,
      size_bytes: sizeBytes,
    };
  }

  async download(
    key: string,
    bucket?: string,
  ): Promise<{ body: Readable; meta: ObjectMeta }> {
    const targetBucket = bucket ?? this.defaultBucket;

    const command = new GetObjectCommand({
      Bucket: targetBucket,
      Key: key,
    });

    const result = await this.client.send(command);

    const meta: ObjectMeta = {
      key,
      size_bytes: result.ContentLength ?? 0,
      content_type: result.ContentType,
      etag: result.ETag,
      last_modified: result.LastModified,
      metadata: result.Metadata,
    };

    return {
      body: result.Body as Readable,
      meta,
    };
  }

  async delete(key: string, bucket?: string): Promise<void> {
    const targetBucket = bucket ?? this.defaultBucket;

    const command = new DeleteObjectCommand({
      Bucket: targetBucket,
      Key: key,
    });

    await this.client.send(command);
  }

  async head(key: string, bucket?: string): Promise<ObjectMeta> {
    const targetBucket = bucket ?? this.defaultBucket;

    const command = new HeadObjectCommand({
      Bucket: targetBucket,
      Key: key,
    });

    const result = await this.client.send(command);

    return {
      key,
      size_bytes: result.ContentLength ?? 0,
      content_type: result.ContentType,
      etag: result.ETag,
      last_modified: result.LastModified,
      metadata: result.Metadata,
    };
  }

  async list(params?: ListParams): Promise<ListResult> {
    const bucket = params?.bucket ?? this.defaultBucket;

    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: params?.prefix,
      MaxKeys: params?.maxKeys ?? 1000,
      ContinuationToken: params?.continuationToken,
    });

    const result = await this.client.send(command);

    const objects: ObjectMeta[] = (result.Contents ?? []).map((obj) => ({
      key: obj.Key ?? '',
      size_bytes: obj.Size ?? 0,
      etag: obj.ETag,
      last_modified: obj.LastModified,
    }));

    return {
      objects,
      isTruncated: result.IsTruncated ?? false,
      nextContinuationToken: result.NextContinuationToken,
    };
  }

  async copy(
    sourceKey: string,
    destKey: string,
    sourceBucket?: string,
    destBucket?: string,
  ): Promise<void> {
    const srcBucket = sourceBucket ?? this.defaultBucket;
    const dstBucket = destBucket ?? this.defaultBucket;

    const command = new CopyObjectCommand({
      Bucket: dstBucket,
      Key: destKey,
      CopySource: `${srcBucket}/${sourceKey}`,
    });

    await this.client.send(command);
  }

  async exists(key: string, bucket?: string): Promise<boolean> {
    try {
      await this.head(key, bucket);
      return true;
    } catch (err: unknown) {
      const error = err as { name?: string };
      if (error.name === 'NotFound' || error.name === 'NoSuchKey') {
        return false;
      }
      throw err;
    }
  }

  /** 获取底层 S3Client（供 PresignedUrlService 使用） */
  getClient(): S3Client {
    return this.client;
  }

  /** 获取默认 bucket */
  getDefaultBucket(): string {
    return this.defaultBucket;
  }

  /** 获取后端类型 */
  getBackend(): string {
    return this.backend;
  }
}
