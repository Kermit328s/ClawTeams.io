/**
 * 数据库层导出
 *
 * Schema 定义文件：
 * - neo4j-schema.cypher  — Neo4j 图数据库约束和索引
 * - postgres-schema.sql  — PostgreSQL 表结构
 *
 * 本模块后续将包含数据库连接池和查询工具。
 */

// Neo4j schema 路径（供迁移脚本使用）
export const NEO4J_SCHEMA_PATH = __dirname + '/neo4j-schema.cypher';

// PostgreSQL schema 路径（供迁移脚本使用）
export const POSTGRES_SCHEMA_PATH = __dirname + '/postgres-schema.sql';
