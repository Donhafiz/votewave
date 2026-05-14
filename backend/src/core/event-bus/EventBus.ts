/**
 * Event Bus - Mock implementation for build
 * This is a temporary mock to fix import errors during build
 */

export interface EventSubscription {
  eventType: string;
  handler: (event: any) => void;
}

export class EventBus {
  private subscriptions: Map<string, EventSubscription[]> = new Map();

  async publish(event: any): Promise<void> {
    // Mock implementation
    const subscriptions = this.subscriptions.get(event.type) || [];
    for (const subscription of subscriptions) {
      try {
        await subscription.handler(event);
      } catch (error) {
        // Handle error
      }
    }
  }

  subscribe(eventType: string, handler: (event: any) => void): void {
    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, []);
    }
    this.subscriptions.get(eventType)!.push({ eventType, handler });
  }

  unsubscribe(eventType: string, handler: (event: any) => void): void {
    const subscriptions = this.subscriptions.get(eventType) || [];
    const index = subscriptions.findIndex(sub => sub.handler === handler);
    if (index > -1) {
      subscriptions.splice(index, 1);
    }
  }
}

// Create and export a singleton instance
const eventBus = new EventBus();
export default eventBus;
