/**
 * 工作流层（Workflow）公共入口
 */

// Parser
export { parseIntentGraph } from './parser';

// Planner
export {
  matchCapability,
  identifyParallelStages,
  identifyRisks,
  generateExecutionPlan,
} from './planner';

// Compiler
export { compileWorkflow } from './compiler';

// Listener
export { ChangeListener, classifyChange, mergeChangeLevel } from './listener';
export type { ChangeResponseHandler } from './listener';

// AI
export { IntentParser, validateIntentGraph, checkConsistency } from './ai';

// Types
export type {
  WorkflowDAG,
  WorkflowNode,
  WorkflowEdge,
  ExecutionPlan,
  ExecutionStage,
  TaskAssignment,
  RiskAssessment,
  CompiledWorkflow,
  SignalDefinition,
  ChangeLevel,
  IntentChange,
  ChangeBuffer,
  NaturalLanguageIntent,
  StructuredIntent,
  AIProvider,
  CheckpointPosition,
} from './types';
