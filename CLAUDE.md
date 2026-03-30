# CLAUDE.md -- ClawTeams Project Guide

> This file is the canonical onboarding reference for all agents and developers working on ClawTeams.

---

## 1. Project Overview

**ClawTeams** is a team collaboration operating system that eliminates context drift between team intent and execution reality. Instead of relying on meetings for alignment, ClawTeams maintains a persistent, machine-readable "Team Brain" that keeps everyone -- humans and AI agents ("lobsters") -- continuously synchronized.

**Core insight:** Meetings are a symptom of failed context alignment, not the solution.

**What ClawTeams is NOT:** a project management tool, an AI tool platform, collaboration software, or a simple automation tool. It is an operating system that keeps team intent and execution reality continuously aligned.

---

## 2. Architecture Overview (Three Layers)

```
Team Brain (Cloud Backend)
  Account module, Intent Graph, Cognition module, Permissions, Presentation
        |
Workflow Layer (Orchestration & Execution)
  Graph Parser, Temporal Compiler, Execution Strategy Engine, Change Listener
        |
Connection Layer (Event Bus + Adapters)
  Event Bus (Kafka/WebSocket), Output Hook, Context Injector, Event Subscriber, Protocol
        |
======= ClawTeams Protocol Boundary =======
        |
External Lobsters (OpenClaw / Third-party Agents)
  -- Not part of ClawTeams; independently deployed --
```

### Data Flow Summary

1. **Intent-to-Execution:** User conversation -> Brain updates Intent Graph -> Event broadcast -> Workflow compiles -> Task dispatched -> Lobster executes -> State written back -> Map updated
2. **Cognitive Feedback Loop:** Lobster execution data accumulates -> Deviation detected -> Cognition node written -> Event broadcast -> Workflow constraints updated
3. **Artifact Handoff:** Node A completes -> Artifact uploaded -> Event triggered -> Node B fetches artifact -> Continues execution

---

## 3. Code Directory Structure & Agent Mapping

```
ClawTeams.io/
|-- docs/                          # Requirements docs (read-only reference for all)
|   |-- 00_agent-collaboration.md  #   Architect maintains
|   |-- 01_infra.md                #   -> Infra agent
|   |-- 02_brain.md                #   -> Brain agent
|   |-- 03_workflow.md             #   -> Workflow agent
|   |-- 04_connector.md            #   -> Connector agent
|   +-- 05_frontend.md             #   -> Frontend agent
|
|-- contracts/                     # Shared interface contracts (Architect approves)
|   |-- brain-api.yaml             #   Brain external API (OpenAPI 3.0)
|   |-- workflow-api.yaml          #   Workflow external API (OpenAPI 3.0)
|   |-- event-schema.yaml          #   Event structure definition (JSON Schema)
|   |-- protocol-spec.yaml         #   Lobster <-> Brain communication protocol
|   |-- state-unit-schema.yaml     #   Minimal state unit (JSON Schema)
|   +-- artifact-schema.yaml       #   Artifact handoff format (JSON Schema)
|
|-- src/
|   |-- infra/                     # [Infra Agent] Infrastructure & data layer
|   |   |-- db/                    #   Database schemas, migrations
|   |   |-- storage/               #   R2/MinIO storage service
|   |   |-- gateway/               #   API gateway, auth middleware
|   |   +-- shared/                #   Shared TypeScript type definitions
|   |
|   |-- brain/                     # [Brain Agent] Team Brain
|   |   |-- account/               #   Account module (human + lobster + bindings)
|   |   |-- intent/                #   Intent Graph (CRUD + bidirectional mapping)
|   |   |-- cognition/             #   Cognition module (trigger + write + phases)
|   |   |-- permission/            #   Permission module (auto-derivation + locking)
|   |   +-- rollback/              #   Rollback mechanism
|   |
|   |-- workflow/                  # [Workflow Agent] Workflow layer
|   |   |-- parser/                #   Graph parser
|   |   |-- planner/               #   Execution strategy engine
|   |   |-- compiler/              #   Temporal code generator
|   |   |-- listener/              #   Change listener
|   |   +-- ai/                    #   AI-driven pipeline
|   |
|   |-- connector/                 # [Connector Agent] Connection layer
|   |   |-- eventbus/              #   Event bus (Kafka/WebSocket)
|   |   |-- adapter/               #   Adapters (Hook/Injector/Subscriber)
|   |   |-- protocol/              #   Communication protocol implementation
|   |   +-- sync/                  #   Lobster state sync, offline cache
|   |
|   |-- frontend/                  # [Frontend Agent] Frontend & conversation layer
|   |   |-- chat/                  #   Conversation layer (3 forms + bubbles + cards)
|   |   |-- map/                   #   Dynamic map (nodes + edges + visual feedback)
|   |   |-- realtime/              #   Real-time sync (WebSocket subscriptions)
|   |   +-- onboarding/            #   First-time onboarding flow
|   |
|   +-- claw-sdk/                  # [Connector Agent] Lobster SDK (open-source)
|
+-- tests/
    |-- infra/                     # Infra unit tests
    |-- brain/                     # Brain unit tests
    |-- workflow/                  # Workflow unit tests
    |-- connector/                 # Connector unit tests
    |-- frontend/                  # Frontend unit tests
    +-- integration/               # Integration tests (Architect owns)
```

### Agent -> Directory -> Contract Mapping

| Agent | Code Directory | Contract Files |
|-------|---------------|---------------|
| **Architect** | `contracts/`, `tests/integration/` | All (approval authority) |
| **Infra** | `src/infra/`, `proto/` | `state-unit-schema.yaml`, `artifact-schema.yaml` |
| **Brain** | `src/brain/` | `brain-api.yaml` |
| **Workflow** | `src/workflow/` | `workflow-api.yaml` |
| **Connector** | `src/connector/`, `src/claw-sdk/` | `event-schema.yaml`, `protocol-spec.yaml` |
| **Frontend** | `src/frontend/` | Consumer only (does not produce contracts) |

---

## 4. Technology Stack

| Component | Technology | Reason |
|-----------|-----------|--------|
| Workflow Engine | **Temporal** | Durable execution, long-running workflows, history replay, Signal mechanism |
| Intent Graph | **Neo4j** (or graph DB) | Node/edge relationships, versioning, semantic structure |
| Event Bus | **Kafka** or WebSocket pub/sub | Real-time event-driven architecture |
| Object Storage | **Cloudflare R2** (early) / **MinIO** (self-hosted) | R2 has no egress fees; MinIO is S3-compatible |
| Container Runtime | **Docker** | Cross-machine portability, one-click recovery |
| Backend Language | **TypeScript** (Node.js) | Shared types across all modules |
| Backend Deployment | **Monolith** (module-internal separation) | No premature microservice split; extract when bottlenecks appear |
| Package Manager | **npm workspaces** | Monorepo with workspace-level dependency management |

---

## 5. Development Constraints

### Boundary Rules

- **Each agent may ONLY modify files within its own directory.** No cross-boundary changes.
- `contracts/` modifications require **Architect approval**.
- `src/infra/shared/` is the shared type package. Maintained by Infra; all other agents import read-only.
- `src/claw-sdk/` belongs to the Connector agent (client-side protocol implementation).
- `tests/integration/` belongs to the Architect. Each agent owns its own unit tests under `tests/<module>/`.

### Contract Discipline

- Contracts are initialized by the Infra agent and approved by the Architect.
- Any agent may propose contract changes, but changes require Architect approval + confirmation from affected agents.
- Once published, implementations must be backward-compatible unless the Architect approves a breaking change.

### Code Conventions

- All shared types live in `src/infra/shared/` and are imported via `@shared/*` path alias.
- Cross-module imports use path aliases: `@infra/*`, `@brain/*`, `@workflow/*`, `@connector/*`, `@shared/*`.
- Event types must conform to `contracts/event-schema.yaml` (domain.action pattern, e.g. `task.completed`).
- State units must conform to `contracts/state-unit-schema.yaml`.
- Artifacts must conform to `contracts/artifact-schema.yaml`.

---

## 6. Development Phases & Startup Order

### Phase 0: Infrastructure (Infra works alone)

Infra delivers: minimal state unit definitions, database schemas, storage configuration, shared type package, API gateway.

No other agent can start until Infra deliverables are ready.

### Phase 1: Brain + Connector (parallel)

- **Brain:** Account module, Intent Graph CRUD, permission auto-derivation, cognition module.
- **Connector:** Event bus infrastructure, adapter scaffolding, protocol implementation.
- Both rely on Infra shared types for alignment.
- Mid-phase: Connector needs Brain's lobster account API (partial serial dependency).

### Phase 2: Workflow + Frontend (parallel)

- **Workflow:** Depends on Brain's Intent Graph API. Builds graph parser, Temporal compiler, execution strategy.
- **Frontend:** Depends on Brain API + Connector's WebSocket. Builds conversation layer, dynamic map, real-time sync.

### Phase 3: Integration Verification (Architect leads)

Full end-to-end: Conversation -> Intent Graph -> Workflow generation -> Event bus -> Lobster adaptation -> State writeback -> Map update.

### Dependency Graph

```
Infra (Phase 0)
  |
  +---> Brain (Phase 1) ----+---> Workflow (Phase 2)
  |                         +---> Frontend (Phase 2)
  +---> Connector (Phase 1) +---> Frontend (Phase 2)
                            +---> Workflow (Phase 2)
```

### How to Start Development

1. **Infra agent first:** Run `npm install` at root, then work in `src/infra/`. Deliver shared types and database schemas.
2. **Brain + Connector agents next:** Once Infra shared types are in `src/infra/shared/`, Brain and Connector can begin in parallel.
3. **Workflow + Frontend agents last:** Once Brain API and Connector event bus are operational.
4. **Integration tests:** After all modules deliver basic functionality, Architect runs `npm test -- --testPathPattern=integration`.

### Running Tests

```bash
# Install all workspace dependencies
npm install

# Run all tests
npm test

# Run integration tests only
npm test -- --testPathPattern=tests/integration

# Run a specific module's tests
npm test -- --testPathPattern=tests/brain
```

---

## 7. Key Contracts Quick Reference

| Contract File | Format | Purpose |
|--------------|--------|---------|
| `brain-api.yaml` | OpenAPI 3.0 | Brain's external REST API (goals, agents, cognition, teams) |
| `workflow-api.yaml` | OpenAPI 3.0 | Workflow's external REST API (tasks, workflows, state-units, artifacts) |
| `event-schema.yaml` | JSON Schema | Standard event structure for event bus communication |
| `protocol-spec.yaml` | Custom YAML | WebSocket protocol between lobsters and Brain (register, heartbeat, task assign, event subscribe) |
| `state-unit-schema.yaml` | JSON Schema | Minimal state unit -- what a lobster must leave after completing a task |
| `artifact-schema.yaml` | JSON Schema | Artifact handoff format between lobsters |
