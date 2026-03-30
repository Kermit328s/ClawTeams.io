/**
 * API 网关统一导出
 */
export { createGateway, startGateway, type GatewayConfig, type AuthContext } from './server';
export { jwtAuthHook, verifyJwt, signJwt, type JwtPayload, JwtError } from './jwt-auth';
export {
  apiKeyAuthHook,
  hashApiKey,
  extractKeyPrefix,
  generateApiKey,
  ApiKeyError,
} from './api-key-auth';
