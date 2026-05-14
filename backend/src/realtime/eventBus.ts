import { EventEmitter } from 'events';

class RealtimeEventBus extends EventEmitter {
  emitVoteEvent(event: string, payload: any) {
    this.emit(event, payload);
  }

  broadcast(event: string, payload: any) {
    this.emit(event, payload);
  }
}

export const realtimeBus = new RealtimeEventBus();