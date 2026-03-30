/**
 * Infra 共享类型完整性测试
 * 验证所有共享类型可以正确导入和使用
 */

import type {
  // events.ts
  EventDomain,
  TaskEventType,
  AgentEventType,
  WorkflowEventType,
  CognitionEventType,
  ArtifactEventType,
  IntentEventType,
  EventType,
  EventSource,
  EventMetadata,
  ClawTeamsEvent,
  EventHandler,
  EventBus,

  // agent-identity.ts
  AgentCapability,
  AgentRuntime,
  AgentStatus,
  AgentHeartbeatStatus,
  AgentResourceUsage,
  AgentIdentity,
  CreateAgentRequest,
  CreateAgentResponse,
  AgentSession,

  // intent-graph.ts
  IntentNodeType,
  IntentEdgeType,
  GoalStatus,
  TaskState,
  Priority,
  BaseNode,
  GoalNode,
  TaskNode,
  DecisionNode,
  HumanNode,
  CognitionNode,
  DecisionOption,
  GraphEdge,
  IntentSubGraph,
  IntentNode,

  // artifact.ts
  ArtifactType,
  StorageBackend,
  ArtifactVisibility,
  ArtifactStorage,
  ArtifactAccessControl,
  Artifact,
  CreateArtifactRequest,

  // cognition.ts
  CognitiveSignalType,
  CognitiveSignal,
  CognitionRecord,
  CognitionEvolution,
  PatternDetection,
  QualityAssessment,
  QualityDimension,

  // permissions.ts
  ResourceType,
  Action,
  Permission,
  Role,
  BuiltinRoleName,
  PermissionBinding,
  PermissionCheckRequest,
  PermissionCheckResult,

  // task-input.ts
  ResultType,
  StructuredResult,
  ContextSnapshot,
  StateUnit,
  TaskInput,
  TaskContext,
} from '../../src/infra/shared';

import { BUILTIN_ROLES } from '../../src/infra/shared';

describe('Shared Types - Completeness', () => {
  describe('Event types', () => {
    it('should have all event domains', () => {
      const domains: EventDomain[] = [
        'task', 'agent', 'workflow', 'cognition', 'artifact', 'intent',
      ];
      expect(domains).toHaveLength(6);
    });

    it('should construct a valid ClawTeamsEvent', () => {
      const event: ClawTeamsEvent = {
        event_id: 'evt-001',
        event_type: 'task.completed',
        source: { service: 'test' },
        timestamp: new Date().toISOString(),
        payload: { result: 'success' },
      };
      expect(event.event_id).toBe('evt-001');
      expect(event.event_type).toBe('task.completed');
    });

    it('should allow optional fields in ClawTeamsEvent', () => {
      const event: ClawTeamsEvent = {
        event_id: 'evt-002',
        event_type: 'agent.registered',
        source: { service: 'brain', agent_id: 'a1', user_id: 'u1' },
        timestamp: new Date().toISOString(),
        correlation_id: 'corr-001',
        causation_id: 'cause-001',
        payload: {},
        metadata: {
          schema_version: '1.0',
          retry_count: 0,
          ttl: 3600,
          custom_field: 'value',
        },
      };
      expect(event.metadata?.schema_version).toBe('1.0');
    });

    it('should type-check all TaskEventType values', () => {
      const taskEvents: TaskEventType[] = [
        'task.created', 'task.assigned', 'task.started', 'task.completed',
        'task.failed', 'task.blocked', 'task.human_required', 'task.retried',
      ];
      expect(taskEvents).toHaveLength(8);
    });

    it('should type-check all AgentEventType values', () => {
      const agentEvents: AgentEventType[] = [
        'agent.registered', 'agent.heartbeat', 'agent.disconnected',
        'agent.capability_updated',
      ];
      expect(agentEvents).toHaveLength(4);
    });

    it('should type-check all CognitionEventType values', () => {
      const cogEvents: CognitionEventType[] = [
        'cognition.signal_emitted', 'cognition.pattern_detected',
        'cognition.decision_required', 'cognition.knowledge_updated',
      ];
      expect(cogEvents).toHaveLength(4);
    });
  });

  describe('Agent Identity types', () => {
    it('should construct a valid AgentIdentity', () => {
      const agent: AgentIdentity = {
        agent_id: 'a1',
        name: 'TestAgent',
        team_id: 't1',
        status: 'online',
        capabilities: [{ name: 'code_review', version: '1.0' }],
        roles: ['agent_worker'],
        api_key_hash: 'hash',
        api_key_prefix: 'ct_abcdefgh',
        created_at: new Date().toISOString(),
      };
      expect(agent.status).toBe('online');
    });

    it('should enforce AgentStatus values', () => {
      const statuses: AgentStatus[] = ['online', 'offline', 'busy'];
      expect(statuses).toHaveLength(3);
    });

    it('should enforce AgentHeartbeatStatus values', () => {
      const statuses: AgentHeartbeatStatus[] = [
        'idle', 'busy', 'overloaded', 'shutting_down',
      ];
      expect(statuses).toHaveLength(4);
    });
  });

  describe('Intent Graph types', () => {
    it('should construct a valid GoalNode', () => {
      const goal: GoalNode = {
        id: 'g1',
        type: 'Goal',
        title: 'Test Goal',
        status: 'active',
        priority: 'high',
        team_id: 't1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      expect(goal.type).toBe('Goal');
    });

    it('should construct a valid TaskNode', () => {
      const task: TaskNode = {
        id: 't1',
        type: 'Task',
        title: 'Test Task',
        task_type: 'code_review',
        state: 'pending',
        priority: 'medium',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      expect(task.state).toBe('pending');
    });

    it('should enforce all TaskState values', () => {
      const states: TaskState[] = [
        'pending', 'assigned', 'running', 'completed', 'failed',
        'blocked', 'human_required', 'cancelled',
      ];
      expect(states).toHaveLength(8);
    });

    it('should enforce all IntentEdgeType values', () => {
      const edgeTypes: IntentEdgeType[] = [
        'DEPENDS_ON', 'PARALLEL_WITH', 'CONDITION', 'AGGREGATES',
        'LOOP_BACK', 'BELONGS_TO', 'OWNS', 'RESPONSIBLE_FOR',
        'RELATES_TO', 'EVOLVED_FROM',
      ];
      expect(edgeTypes).toHaveLength(10);
    });

    it('should construct a valid GraphEdge', () => {
      const edge: GraphEdge = {
        id: 'e1',
        from_id: 'n1',
        to_id: 'n2',
        edge_type: 'DEPENDS_ON',
        created_at: new Date().toISOString(),
      };
      expect(edge.edge_type).toBe('DEPENDS_ON');
    });

    it('should construct a valid IntentSubGraph', () => {
      const subgraph: IntentSubGraph = {
        goal_id: 'g1',
        nodes: [],
        edges: [],
        version: 1,
      };
      expect(subgraph.version).toBe(1);
    });
  });

  describe('Artifact types', () => {
    it('should construct a valid Artifact', () => {
      const artifact: Artifact = {
        artifact_id: 'art-1',
        type: 'document',
        title: 'Test Doc',
        created_by: 'a1',
        created_at: new Date().toISOString(),
        version: 1,
        storage: {
          backend: 'r2',
          bucket: 'my-bucket',
          key: 'docs/test.pdf',
        },
        tags: ['test'],
        related_task_ids: ['t1'],
      };
      expect(artifact.type).toBe('document');
    });

    it('should enforce all ArtifactType values', () => {
      const types: ArtifactType[] = [
        'document', 'code', 'dataset', 'report', 'image',
        'video', 'config', 'model', 'composite',
      ];
      expect(types).toHaveLength(9);
    });
  });

  describe('Cognition types', () => {
    it('should construct a valid CognitionRecord', () => {
      const record: CognitionRecord = {
        cognition_id: 'cog-1',
        content: 'Test cognition',
        confidence: 0.8,
        tags: ['auto'],
        team_id: 't1',
        created_at: new Date().toISOString(),
        verified: false,
        reference_count: 0,
      };
      expect(record.confidence).toBe(0.8);
    });

    it('should construct a valid CognitionEvolution', () => {
      const evo: CognitionEvolution = {
        from_cognition_id: 'cog-1',
        to_cognition_id: 'cog-2',
        reason: 'New data',
        evolution_type: 'refinement',
        evolved_at: new Date().toISOString(),
      };
      expect(evo.evolution_type).toBe('refinement');
    });
  });

  describe('Permission types', () => {
    it('should have all BUILTIN_ROLES', () => {
      expect(BUILTIN_ROLES.TEAM_OWNER).toBe('team_owner');
      expect(BUILTIN_ROLES.TEAM_ADMIN).toBe('team_admin');
      expect(BUILTIN_ROLES.TEAM_MEMBER).toBe('team_member');
      expect(BUILTIN_ROLES.AGENT_WORKER).toBe('agent_worker');
      expect(BUILTIN_ROLES.AGENT_LEAD).toBe('agent_lead');
      expect(BUILTIN_ROLES.VIEWER).toBe('viewer');
    });

    it('should enforce all Action values', () => {
      const actions: Action[] = [
        'create', 'read', 'update', 'delete', 'execute', 'assign', 'admin',
      ];
      expect(actions).toHaveLength(7);
    });

    it('should enforce all ResourceType values', () => {
      const types: ResourceType[] = [
        'goal', 'task', 'workflow', 'artifact', 'agent', 'team',
        'cognition', 'knowledge',
      ];
      expect(types).toHaveLength(8);
    });

    it('should construct a valid PermissionCheckRequest', () => {
      const req: PermissionCheckRequest = {
        subject_type: 'agent',
        subject_id: 'a1',
        resource_type: 'task',
        resource_id: 't1',
        action: 'execute',
      };
      expect(req.action).toBe('execute');
    });
  });

  describe('Task Input types', () => {
    it('should construct a valid StateUnit', () => {
      const unit: StateUnit = {
        task_id: 't1',
        agent_id: 'a1',
        state: 'completed',
        result: { type: 'json', data: { output: 'ok' } },
        artifact_ids: [],
        timestamp: new Date().toISOString(),
        version: 1,
        upstream_task_ids: [],
        downstream_task_ids: [],
      };
      expect(unit.state).toBe('completed');
    });

    it('should construct a valid TaskInput', () => {
      const input: TaskInput = {
        task_id: 't1',
        task_type: 'code_review',
        title: 'Review PR #42',
        priority: 'medium',
        parameters: { repo: 'test' },
        upstream_state_units: [],
        available_artifact_ids: [],
        context: {
          goal_id: 'g1',
          workflow_id: 'wf1',
          team_id: 't1',
          intent_graph_version: 1,
          dag_position: { depth: 0, parallel_count: 1, is_leaf: true },
        },
      };
      expect(input.task_type).toBe('code_review');
    });
  });
});
