/**
 * 存储服务接口测试
 * 验证 StorageService 和 PresignedUrlService 的接口完整性
 */

import type {
  IStorageService,
  StorageConfig,
  UploadParams,
  UploadResult,
  ObjectMeta,
  ListParams,
  ListResult,
  IPresignedUrlService,
  PresignedUrlParams,
  PresignedUploadParams,
  PresignedUrlResult,
} from '../../src/infra/storage';

import { StorageService, PresignedUrlService } from '../../src/infra/storage';

describe('Storage Service Interface', () => {
  describe('IStorageService', () => {
    it('should define all required methods', () => {
      // Verify that StorageService implements IStorageService
      const methods: (keyof IStorageService)[] = [
        'upload', 'download', 'delete', 'head', 'list', 'copy', 'exists',
      ];

      // Verify StorageService has the right prototype methods
      for (const method of methods) {
        expect(typeof StorageService.prototype[method]).toBe('function');
      }
    });

    it('should define correct StorageConfig shape', () => {
      const config: StorageConfig = {
        backend: 'r2',
        endpoint: 'https://example.com',
        region: 'auto',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        defaultBucket: 'my-bucket',
        forcePathStyle: false,
      };
      expect(config.backend).toBe('r2');
    });

    it('should support all StorageBackend types in config', () => {
      const backends: StorageConfig['backend'][] = ['r2', 's3', 'minio'];
      expect(backends).toHaveLength(3);
    });

    it('should define correct UploadParams shape', () => {
      const params: UploadParams = {
        key: 'test/file.txt',
        body: Buffer.from('hello'),
        contentType: 'text/plain',
        metadata: { custom: 'value' },
      };
      expect(params.key).toBe('test/file.txt');
    });

    it('should define correct UploadResult shape', () => {
      const result: UploadResult = {
        bucket: 'my-bucket',
        key: 'test/file.txt',
        etag: '"abc123"',
        size_bytes: 5,
      };
      expect(result.size_bytes).toBe(5);
    });

    it('should define correct ObjectMeta shape', () => {
      const meta: ObjectMeta = {
        key: 'test/file.txt',
        size_bytes: 1024,
        content_type: 'application/pdf',
        etag: '"abc123"',
        last_modified: new Date(),
        metadata: { custom: 'value' },
      };
      expect(meta.size_bytes).toBe(1024);
    });

    it('should define correct ListParams shape', () => {
      const params: ListParams = {
        bucket: 'my-bucket',
        prefix: 'docs/',
        maxKeys: 100,
        continuationToken: 'token123',
      };
      expect(params.prefix).toBe('docs/');
    });

    it('should define correct ListResult shape', () => {
      const result: ListResult = {
        objects: [],
        isTruncated: false,
        nextContinuationToken: undefined,
      };
      expect(result.isTruncated).toBe(false);
    });
  });

  describe('IPresignedUrlService', () => {
    it('should define all required methods', () => {
      const methods: (keyof IPresignedUrlService)[] = [
        'getDownloadUrl', 'getUploadUrl',
      ];

      for (const method of methods) {
        expect(typeof PresignedUrlService.prototype[method]).toBe('function');
      }
    });

    it('should define correct PresignedUrlParams shape', () => {
      const params: PresignedUrlParams = {
        key: 'docs/file.pdf',
        bucket: 'my-bucket',
        expiresIn: 3600,
      };
      expect(params.expiresIn).toBe(3600);
    });

    it('should define correct PresignedUploadParams shape', () => {
      const params: PresignedUploadParams = {
        key: 'uploads/new-file.txt',
        contentType: 'text/plain',
        maxSizeBytes: 10 * 1024 * 1024,
        metadata: { uploader: 'test' },
      };
      expect(params.maxSizeBytes).toBe(10 * 1024 * 1024);
    });

    it('should define correct PresignedUrlResult shape', () => {
      const result: PresignedUrlResult = {
        url: 'https://example.com/presigned',
        expires_at: new Date().toISOString(),
        method: 'GET',
        key: 'docs/file.pdf',
        bucket: 'my-bucket',
      };
      expect(result.method).toBe('GET');
    });
  });
});
