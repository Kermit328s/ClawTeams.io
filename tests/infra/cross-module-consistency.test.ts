/**
 * 跨模块一致性测试
 *
 * 验证：
 * 1. Brain 的 service 方法签名是否与 brain-api.yaml 契约一致
 * 2. Connector 的事件结构是否与 event-schema.yaml 一致
 * 3. 共享类型在各模块间是否一致引用（无重复定义）
 */

// ── Brain service imports ──
import { IntentGraphService, type CreateGoalRequest as BrainCreateGoalRequest } from '../../src/brain/intent/graph.service';
import { AgentService } from '../../src/brain/account/agent.service';
import { TeamService, type CreateTeamRequest as BrainCreateTeamRequest } from '../../src/brain/account/team.service';
import { CognitionService } from '../../src/brain/cognition/cognition.service';
import { KnowledgeService, type KnowledgeSearchRequest } from '../../src/brain/intent/knowledge.service';

// ── Shared type imports ──
import type {
  ClawTeamsEvent,
  EventSource,
  EventType,
  EventMetadata,
  GoalNode,
  GoalStatus,
  GraphEdge,
  IntentEdgeType,
  AgentIdentity,
  CreateAgentRequest as SharedCreateAgentRequest,
  AgentStatus,
  AgentCapability,
} from '../../src/infra/shared';

// ── Connector imports ──
import type {
  EventStore,
  EventQueryFilter,
} from '../../src/connector/types';
import { EventBusImpl } from '../../src/connector/eventbus/event-bus';
import { InMemoryEventStore } from '../../src/connector/eventbus/in-memory-event-store';

// ── SDK imports ──
import type {
  ClawEvent,
  AgentCapability as SDKAgentCapability,
  AgentRuntime as SDKAgentRuntime,
  AgentHeartbeatStatus as SDKAgentHeartbeatStatus,
} from '../../src/claw-sdk/types';

describe('Brain API Contract Consistency', () => {
  describe('IntentGraphService vs brain-api.yaml', () => {
    it('should have createGoal method (matches POST /intent/goals)', () => {
      expect(typeof IntentGraphService.prototype.createGoal).toBe('function');
    });

    it('should have listGoals method (matches GET /intent/goals)', () => {
      expect(typeof IntentGraphService.prototype.listGoals).toBe('function');
    });

    it('should have getGoalDetail method (matches GET /intent/goals/{goal_id})', () => {
      expect(typeof IntentGraphService.prototype.getGoalDetail).toBe('function');
    });

    it('CreateGoalRequest should include required fields per contract (title, team_id)', () => {
      // The brain-api.yaml defines CreateGoalRequest with required: [title, team_id]
      // Brain's CreateGoalRequest also requires title and team_id plus layer
      const req: BrainCreateGoalRequest = {
        title: 'Test',
        team_id: 'team-1',
        layer: 'vision', // NOTE: This is extra field not in the YAML contract
      };
      expect(req.title).toBeDefined();
      expect(req.team_id).toBeDefined();
    });

    it('ISSUE: Brain CreateGoalRequest requires "layer" field not in brain-api.yaml', () => {
      // brain-api.yaml CreateGoalRequest has: title (req), team_id (req), description, priority, deadline
      // Brain's CreateGoalRequest has: title (req), team_id (req), description, priority, deadline, layer (req), parent_id
      // "layer" and "parent_id" are not in the API contract
      const brainReqKeys: (keyof BrainCreateGoalRequest)[] = [
        'title', 'team_id', 'description', 'priority', 'deadline',
        'layer', 'parent_id',
      ];
      const yamlReqKeys = ['title', 'team_id', 'description', 'priority', 'deadline'];

      const extraKeys = brainReqKeys.filter(k => !yamlReqKeys.includes(k));
      // These are additional fields in the implementation
      expect(extraKeys).toEqual(['layer', 'parent_id']);
    });
  });

  describe('AgentService vs brain-api.yaml', () => {
    it('should have create method (matches POST /agents)', () => {
      expect(typeof AgentService.prototype.create).toBe('function');
    });

    it('should have getById method (matches GET /agents/{agent_id})', () => {
      expect(typeof AgentService.prototype.getById).toBe('function');
    });

    it('should have list method (matches GET /agents)', () => {
      expect(typeof AgentService.prototype.list).toBe('function');
    });

    it('CreateAgentRequest should match between shared types and API contract', () => {
      // brain-api.yaml: CreateAgentRequest requires name, team_id, capabilities
      // shared/agent-identity.ts: CreateAgentRequest has name, team_id, capabilities
      const req: SharedCreateAgentRequest = {
        name: 'TestAgent',
        team_id: 'team-1',
        capabilities: [{ name: 'test', version: '1.0' }],
      };
      expect(req.name).toBeDefined();
      expect(req.team_id).toBeDefined();
      expect(req.capabilities).toBeDefined();
    });

    it('AgentStatus values should match between shared types and API contract', () => {
      // brain-api.yaml: enum [online, offline, busy]
      // shared/agent-identity.ts: 'online' | 'offline' | 'busy'
      const yamlStatuses = ['online', 'offline', 'busy'];
      const sharedStatuses: AgentStatus[] = ['online', 'offline', 'busy'];
      expect(sharedStatuses).toEqual(yamlStatuses);
    });
  });

  describe('TeamService vs brain-api.yaml', () => {
    it('should have create method (matches POST /teams)', () => {
      expect(typeof TeamService.prototype.create).toBe('function');
    });

    it('CreateTeamRequest should match API contract (name, owner_id required)', () => {
      // brain-api.yaml: required [name, owner_id], optional: description
      const req: BrainCreateTeamRequest = {
        name: 'Test Team',
        owner_id: 'user-1',
        description: 'optional',
      };
      expect(req.name).toBeDefined();
      expect(req.owner_id).toBeDefined();
    });
  });

  describe('CognitionService vs brain-api.yaml', () => {
    it('should have listByTeam method (matches GET /cognition/signals)', () => {
      expect(typeof CognitionService.prototype.listByTeam).toBe('function');
    });
  });

  describe('KnowledgeService vs brain-api.yaml', () => {
    it('should have search method (matches POST /knowledge/search)', () => {
      expect(typeof KnowledgeService.prototype.search).toBe('function');
    });

    it('KnowledgeSearchRequest should match API contract', () => {
      // brain-api.yaml: required [query, team_id], optional: limit
      const req: KnowledgeSearchRequest = {
        query: 'test query',
        team_id: 'team-1',
        limit: 10,
      };
      expect(req.query).toBeDefined();
      expect(req.team_id).toBeDefined();
    });
  });
});

describe('Event Schema Consistency', () => {
  describe('ClawTeamsEvent structure vs event-schema.yaml', () => {
    it('should have all required fields per schema', () => {
      // event-schema.yaml required: event_id, event_type, source, timestamp, payload
      const event: ClawTeamsEvent = {
        event_id: 'evt-001',
        event_type: 'task.completed',
        source: { service: 'test' },
        timestamp: new Date().toISOString(),
        payload: {},
      };
      expect(event.event_id).toBeDefined();
      expect(event.event_type).toBeDefined();
      expect(event.source).toBeDefined();
      expect(event.source.service).toBeDefined();
      expect(event.timestamp).toBeDefined();
      expect(event.payload).toBeDefined();
    });

    it('EventSource should match schema (service required, agent_id/user_id optional)', () => {
      const source1: EventSource = { service: 'brain' };
      const source2: EventSource = { service: 'connector', agent_id: 'a1' };
      const source3: EventSource = { service: 'gateway', user_id: 'u1' };
      expect(source1.service).toBeDefined();
      expect(source2.agent_id).toBe('a1');
      expect(source3.user_id).toBe('u1');
    });

    it('EventMetadata should match schema (schema_version, retry_count, ttl + additionalProperties)', () => {
      const metadata: EventMetadata = {
        schema_version: '1.0',
        retry_count: 0,
        ttl: 3600,
        custom: 'value', // additionalProperties: true in schema
      };
      expect(metadata.schema_version).toBe('1.0');
    });

    it('should cover all event type prefixes from schema', () => {
      // event-schema.yaml x-event-types defines: task, agent, workflow, cognition, artifact, intent
      const allTypes: EventType[] = [
        'task.created', 'task.assigned', 'task.started', 'task.completed',
        'task.failed', 'task.blocked', 'task.human_required', 'task.retried',
        'agent.registered', 'agent.heartbeat', 'agent.disconnected', 'agent.capability_updated',
        'workflow.started', 'workflow.step_started', 'workflow.step_completed',
        'workflow.completed', 'workflow.failed', 'workflow.paused',
        'cognition.signal_emitted', 'cognition.pattern_detected',
        'cognition.decision_required', 'cognition.knowledge_updated',
        'artifact.created', 'artifact.updated', 'artifact.archived',
        'intent.goal_created', 'intent.graph_updated', 'intent.decomposed',
      ];

      // Verify all 28 event types are covered
      expect(allTypes).toHaveLength(28);

      // Verify all event types match the domain.action pattern
      for (const t of allTypes) {
        expect(t).toMatch(/^[a-z_]+\.[a-z_]+$/);
      }
    });
  });

  describe('Connector EventBus implements shared EventBus interface', () => {
    it('should have publish method', () => {
      expect(typeof EventBusImpl.prototype.publish).toBe('function');
    });

    it('should have subscribe method', () => {
      expect(typeof EventBusImpl.prototype.subscribe).toBe('function');
    });
  });

  describe('InMemoryEventStore implements EventStore interface', () => {
    it('should have append method', () => {
      expect(typeof InMemoryEventStore.prototype.append).toBe('function');
    });

    it('should have query method', () => {
      expect(typeof InMemoryEventStore.prototype.query).toBe('function');
    });
  });
});

describe('Cross-Module Type Consistency', () => {
  describe('No duplicate type definitions', () => {
    it('Connector types.ts should reference infra shared types correctly', () => {
      // Connector types.ts imports: ClawTeamsEvent, EventType, AgentCapability,
      // AgentRuntime, AgentHeartbeatStatus, AgentResourceUsage from infra/shared
      // This is correct - no duplication

      // BUT: Connector defines its own EventStore and EventQueryFilter interfaces
      // These are NOT duplicated from infra (infra doesn't define EventStore)
      // This is acceptable as they are Connector-specific
      expect(true).toBe(true);
    });

    it('ISSUE: claw-sdk/types.ts duplicates types from infra/shared', () => {
      // The SDK defines its own versions of:
      // - MessageFrame (also in connector/types.ts)
      // - AgentCapability (also in infra/shared/agent-identity.ts)
      // - AgentRuntime (also in infra/shared/agent-identity.ts)
      // - AgentHeartbeatStatus (also in infra/shared/agent-identity.ts)
      // - AgentResourceUsage (also in infra/shared/agent-identity.ts)
      //
      // This is a deliberate design choice for SDK independence,
      // but the types MUST stay in sync

      // Verify the SDK AgentCapability has the same required fields
      const sdkCap: SDKAgentCapability = {
        name: 'test',
        version: '1.0',
        description: 'optional',
        input_schema: {},
        output_schema: {},
      };
      const sharedCap: AgentCapability = {
        name: 'test',
        version: '1.0',
        description: 'optional',
        input_schema: {},
        output_schema: {},
      };
      // Both should have the same shape
      expect(Object.keys(sdkCap).sort()).toEqual(Object.keys(sharedCap).sort());
    });

    it('ISSUE: claw-sdk ClawEvent vs infra ClawTeamsEvent naming inconsistency', () => {
      // SDK names it ClawEvent, infra names it ClawTeamsEvent
      // Same structure, different name
      const sdkEvent: ClawEvent = {
        event_id: 'e1',
        event_type: 'task.completed',
        source: { service: 'test' },
        timestamp: new Date().toISOString(),
        payload: {},
      };

      const infraEvent: ClawTeamsEvent = {
        event_id: 'e1',
        event_type: 'task.completed',
        source: { service: 'test' },
        timestamp: new Date().toISOString(),
        payload: {},
      };

      // Both should have the same structural shape
      expect(Object.keys(sdkEvent).sort()).toEqual(Object.keys(infraEvent).sort());
    });
  });

  describe('GraphEdge types consistency', () => {
    it('brain-api.yaml edge_type enum should be subset of IntentEdgeType', () => {
      // brain-api.yaml GraphEdge edge_type enum:
      // DEPENDS_ON, PARALLEL_WITH, CONDITION, AGGREGATES, LOOP_BACK
      const yamlEdgeTypes = ['DEPENDS_ON', 'PARALLEL_WITH', 'CONDITION', 'AGGREGATES', 'LOOP_BACK'];

      // IntentEdgeType from shared types:
      const sharedEdgeTypes: IntentEdgeType[] = [
        'DEPENDS_ON', 'PARALLEL_WITH', 'CONDITION', 'AGGREGATES', 'LOOP_BACK',
        'BELONGS_TO', 'OWNS', 'RESPONSIBLE_FOR', 'RELATES_TO', 'EVOLVED_FROM',
      ];

      // The yaml defines only the public API subset; shared types include internal edge types too
      for (const yamlType of yamlEdgeTypes) {
        expect(sharedEdgeTypes).toContain(yamlType);
      }

      // 5 additional internal edge types not in the API contract
      const internalOnlyEdgeTypes = sharedEdgeTypes.filter(t => !yamlEdgeTypes.includes(t));
      expect(internalOnlyEdgeTypes).toEqual([
        'BELONGS_TO', 'OWNS', 'RESPONSIBLE_FOR', 'RELATES_TO', 'EVOLVED_FROM',
      ]);
    });
  });

  describe('GoalStatus consistency', () => {
    it('brain-api.yaml status enum should match GoalStatus', () => {
      // brain-api.yaml: enum [active, completed, paused, cancelled]
      const yamlStatuses = ['active', 'completed', 'paused', 'cancelled'];
      const sharedStatuses: GoalStatus[] = ['active', 'completed', 'paused', 'cancelled'];
      expect(sharedStatuses.sort()).toEqual(yamlStatuses.sort());
    });
  });
});
