/**
 * Event Store - Mock implementation for build
 * This is a temporary mock to fix import errors during build
 */

export interface DomainEvent {
  id: string;
  type: string;
  aggregateId: string;
  aggregateType: string;
  version: number;
  timestamp: number;
  payload: any;
  metadata?: any;
}

export class EventStore {
  async append(_event: DomainEvent): Promise<void> {
    // Mock implementation
  }

  async getByAggregate(aggregateId: string): Promise<any> {
    return {
      aggregateId,
      aggregateType: 'mock',
      events: [],
      version: 0
    };
  }

  async getEvents(_filter?: any): Promise<DomainEvent[]> {
    return [];
  }
}

// Create and export a singleton instance
const eventStore = new EventStore();
export default eventStore;
