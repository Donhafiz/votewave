import { Server } from 'socket.io';
import { realtimeBus } from './eventBus';
import { REALTIME_EVENTS } from './events';

export function initializeSocketBridge(io: Server) {
  console.log('[Realtime] Socket bridge initialized');

  // Vote events
  realtimeBus.on(REALTIME_EVENTS.VOTE_CAST, (data) => {
    io.emit('vote:cast', data);
  });

  realtimeBus.on(REALTIME_EVENTS.RESULTS_UPDATED, (data) => {
    io.emit('results:update', data);
  });

  realtimeBus.on(REALTIME_EVENTS.ELECTION_UPDATED, (data) => {
    io.emit('election:update', data);
  });

  realtimeBus.on(REALTIME_EVENTS.USER_ACTIVITY, (data) => {
    io.emit('user:activity', data);
  });
}