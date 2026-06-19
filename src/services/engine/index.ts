import type { EventStore } from '../../events/event-store.js';
import type { ServiceDeps } from '../deps.js';
import { createEngineCommitmentService } from './commitment-service.js';
import { createEngineSwitchService } from './switch-service.js';
import { createEngineStepService } from './step-service.js';
import { createEngineDigestService } from './digest-service.js';

export function createEngineServices(eventStore: EventStore, deps: ServiceDeps) {
  return {
    commitment: createEngineCommitmentService(eventStore, deps),
    switch: createEngineSwitchService(eventStore, deps),
    step: createEngineStepService(eventStore, deps),
    digest: createEngineDigestService(eventStore, deps),
  };
}

export type EngineServices = ReturnType<typeof createEngineServices>;
