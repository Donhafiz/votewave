/**
 * Socket.IO Server - Real-time dashboard integration
 * Provides WebSocket connections for live voting updates and dashboard data
 */

import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as NetServer } from 'net';
import { logger } from '../../utils/logger';
import { DomainEvent } from '../../core/event-store/EventStore';
import voteProjection from '../../core/projections/VoteProjection';
import { ensureInitialized } from '../../core';

export interface SocketIoServerOptions {
  cors?: {
    origin: string | string[];
    credentials?: boolean;
  };
  transports?: string[];
  pingTimeout?: number;
  pingInterval?: number;
  maxHttpBufferSize?: number;
  allowEIO3?: boolean;
}

export interface DashboardRoom {
  electionId: string;
  type: 'election' | 'admin' | 'results' | 'analytics';
  permissions: string[];
  metadata?: Record<string, any>;
}

export interface ClientSession {
  socketId: string;
  userId?: string;
  userRole?: string;
  rooms: Set<string>;
  permissions: Set<string>;
  connectedAt: number;
  lastActivity: number;
  metadata: Record<string, any>;
}

export interface RealTimeEvent {
  type: string;
  data: any;
  timestamp: number;
  electionId?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface DashboardUpdate {
  type: 'vote_cast' | 'vote_cancelled' | 'statistics_update' | 'candidate_update' | 'election_update';
  electionId: string;
  data: any;
  timestamp: number;
}

export class SocketIoServer {
  private io: SocketIOServer;
  private httpServer: HttpServer;
  private options: Required<SocketIoServerOptions>;
  private clients: Map<string, ClientSession> = new Map();
  private rooms: Map<string, DashboardRoom> = new Map();
  private eventHandlers: Map<string, (data: any) => void> = new Map();
  private isConnected: boolean = false;

  constructor(httpServer: HttpServer, options: SocketIoServerOptions = {}) {
    this.httpServer = httpServer;
    this.options = {
      cors: options.cors || {
        origin: ['http://localhost:3000', 'http://localhost:3001'],
        credentials: true
      },
      transports: options.transports || ['websocket', 'polling'],
      pingTimeout: options.pingTimeout || 60000,
      pingInterval: options.pingInterval || 25000,
      maxHttpBufferSize: options.maxHttpBufferSize || 1e6,
      allowEIO3: options.allowEIO3 || false
    };

    this.io = new SocketIOServer(httpServer, {
      cors: this.options.cors,
      transports: this.options.transports,
      pingTimeout: this.options.pingTimeout,
      pingInterval: this.options.pingInterval,
      maxHttpBufferSize: this.options.maxHttpBufferSize,
      allowEIO3: this.options.allowEIO3
    });

    this.setupEventHandlers();
  }

  /**
   * Start the Socket.IO server
   */
  async start(): Promise<void> {
    try {
      // Ensure core system is initialized
      await ensureInitialized();

      // Setup event subscriptions
      this.setupEventSubscriptions();

      this.isConnected = true;
      logger.info('Socket.IO server started successfully', {
        transports: this.options.transports,
        cors: this.options.cors
      });

    } catch (error) {
      logger.error('Failed to start Socket.IO server', { error: error.message });
      throw error;
    }
  }

  /**
   * Stop the Socket.IO server
   */
  async stop(): Promise<void> {
    try {
      await this.io.close();
      this.isConnected = false;
      
      // Clear all data
      this.clients.clear();
      this.rooms.clear();
      this.eventHandlers.clear();

      logger.info('Socket.IO server stopped');

    } catch (error) {
      logger.error('Failed to stop Socket.IO server', { error: error.message });
      throw error;
    }
  }

  /**
   * Get server statistics
   */
  getStatistics(): {
    connectedClients: number;
    totalRooms: number;
    eventsSent: number;
    averageLatency: number;
    uptime: number;
  } {
    const connectedClients = this.clients.size;
    const totalRooms = this.rooms.size;
    
    // Calculate average latency (simplified)
    let totalLatency = 0;
    let latencyCount = 0;
    
    for (const client of this.clients.values()) {
      // This would be calculated from actual ping measurements
      // For now, using placeholder logic
      totalLatency += 50; // placeholder
      latencyCount++;
    }

    const averageLatency = latencyCount > 0 ? totalLatency / latencyCount : 0;

    return {
      connectedClients,
      totalRooms,
      eventsSent: 0, // Would be tracked with actual counters
      averageLatency,
      uptime: process.uptime() * 1000
    };
  }

  /**
   * Broadcast to all clients
   */
  broadcast(event: string, data: any): void {
    if (!this.isConnected) {
      logger.warn('Socket.IO server not connected, broadcast ignored');
      return;
    }

    this.io.emit(event, data);
    logger.debug('Broadcasted event to all clients', { event });
  }

  /**
   * Broadcast to specific room
   */
  broadcastToRoom(roomId: string, event: string, data: any): void {
    if (!this.isConnected) {
      logger.warn('Socket.IO server not connected, room broadcast ignored');
      return;
    }

    this.io.to(roomId).emit(event, data);
    logger.debug('Broadcasted event to room', { roomId, event });
  }

  /**
   * Send to specific client
   */
  sendToClient(socketId: string, event: string, data: any): void {
    if (!this.isConnected) {
      logger.warn('Socket.IO server not connected, client send ignored');
      return;
    }

    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit(event, data);
      logger.debug('Sent event to client', { socketId, event });
    } else {
      logger.warn('Client not found', { socketId });
    }
  }

  /**
   * Create dashboard room
   */
  createRoom(roomId: string, room: DashboardRoom): void {
    this.rooms.set(roomId, room);
    logger.debug('Dashboard room created', { roomId, type: room.type });
  }

  /**
   * Remove dashboard room
   */
  removeRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      // Remove all clients from the room
      this.io.in(roomId).socketsLeave(roomId);
      this.rooms.delete(roomId);
      logger.debug('Dashboard room removed', { roomId });
    }
  }

  /**
   * Get room information
   */
  getRoom(roomId: string): DashboardRoom | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Get all rooms
   */
  getAllRooms(): DashboardRoom[] {
    return Array.from(this.rooms.values());
  }

  /**
   * Get client session
   */
  getClient(socketId: string): ClientSession | undefined {
    return this.clients.get(socketId);
  }

  /**
   * Get all clients
   */
  getAllClients(): ClientSession[] {
    return Array.from(this.clients.values());
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });

    logger.debug('Socket.IO event handlers setup completed');
  }

  /**
   * Handle new client connection
   */
  private handleConnection(socket: Socket): void {
    const clientSession: ClientSession = {
      socketId: socket.id,
      rooms: new Set(),
      permissions: new Set(),
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      metadata: {}
    };

    this.clients.set(socket.id, clientSession);

    logger.info('Client connected', {
      socketId: socket.id,
      ip: socket.handshake.address,
      userAgent: socket.handshake.headers['user-agent']
    });

    // Setup client event handlers
    this.setupClientHandlers(socket);

    // Send welcome message
    socket.emit('connected', {
      socketId: socket.id,
      timestamp: Date.now(),
      serverTime: new Date().toISOString()
    });
  }

  /**
   * Setup client-specific event handlers
   */
  private setupClientHandlers(socket: Socket): void {
    // Authentication
    socket.on('authenticate', async (data) => {
      await this.handleAuthentication(socket, data);
    });

    // Join room
    socket.on('join_room', async (data) => {
      await this.handleJoinRoom(socket, data);
    });

    // Leave room
    socket.on('leave_room', async (data) => {
      await this.handleLeaveRoom(socket, data);
    });

    // Subscribe to election updates
    socket.on('subscribe_election', async (data) => {
      await this.handleSubscribeElection(socket, data);
    });

    // Unsubscribe from election updates
    socket.on('unsubscribe_election', async (data) => {
      await this.handleUnsubscribeElection(socket, data);
    });

    // Request current statistics
    socket.on('get_statistics', async (data) => {
      await this.handleGetStatistics(socket, data);
    });

    // Request election data
    socket.on('get_election_data', async (data) => {
      await this.handleGetElectionData(socket, data);
    });

    // Ping for latency measurement
    socket.on('ping', (data) => {
      socket.emit('pong', {
        timestamp: Date.now(),
        clientTimestamp: data?.timestamp
      });
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(socket, reason);
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error('Socket error', {
        socketId: socket.id,
        error: error.message
      });
    });
  }

  /**
   * Handle client authentication
   */
  private async handleAuthentication(socket: Socket, data: any): Promise<void> {
    try {
      const { token, userId, userRole } = data;
      
      // This would validate the token and extract user info
      // For now, we'll accept the provided data
      
      const clientSession = this.clients.get(socket.id);
      if (clientSession) {
        clientSession.userId = userId;
        clientSession.userRole = userRole;
        clientSession.metadata.authenticated = true;
        clientSession.lastActivity = Date.now();

        // Set permissions based on role
        this.setPermissions(clientSession, userRole);

        socket.emit('authenticated', {
          success: true,
          userId,
          userRole,
          permissions: Array.from(clientSession.permissions)
        });

        logger.info('Client authenticated', {
          socketId: socket.id,
          userId,
          userRole
        });
      }

    } catch (error) {
      socket.emit('authentication_error', {
        error: error.message
      });
      
      logger.error('Authentication failed', {
        socketId: socket.id,
        error: error.message
      });
    }
  }

  /**
   * Handle room join request
   */
  private async handleJoinRoom(socket: Socket, data: any): Promise<void> {
    try {
      const { roomId, metadata } = data;
      const clientSession = this.clients.get(socket.id);

      if (!clientSession) {
        socket.emit('join_room_error', { error: 'Client session not found' });
        return;
      }

      const room = this.rooms.get(roomId);
      if (!room) {
        socket.emit('join_room_error', { error: 'Room not found' });
        return;
      }

      // Check permissions
      if (!this.hasPermission(clientSession, room.permissions)) {
        socket.emit('join_room_error', { error: 'Insufficient permissions' });
        return;
      }

      // Join socket room
      socket.join(roomId);
      clientSession.rooms.add(roomId);
      clientSession.lastActivity = Date.now();

      // Send current room data
      await this.sendRoomData(socket, room);

      socket.emit('joined_room', {
        roomId,
        roomType: room.type,
        timestamp: Date.now()
      });

      logger.debug('Client joined room', {
        socketId: socket.id,
        roomId,
        roomType: room.type
      });

    } catch (error) {
      socket.emit('join_room_error', { error: error.message });
      logger.error('Failed to join room', {
        socketId: socket.id,
        error: error.message
      });
    }
  }

  /**
   * Handle room leave request
   */
  private async handleLeaveRoom(socket: Socket, data: any): Promise<void> {
    try {
      const { roomId } = data;
      const clientSession = this.clients.get(socket.id);

      if (!clientSession) {
        return;
      }

      socket.leave(roomId);
      clientSession.rooms.delete(roomId);
      clientSession.lastActivity = Date.now();

      socket.emit('left_room', {
        roomId,
        timestamp: Date.now()
      });

      logger.debug('Client left room', {
        socketId: socket.id,
        roomId
      });

    } catch (error) {
      logger.error('Failed to leave room', {
        socketId: socket.id,
        error: error.message
      });
    }
  }

  /**
   * Handle election subscription
   */
  private async handleSubscribeElection(socket: Socket, data: any): Promise<void> {
    try {
      const { electionId } = data;
      const roomId = `election_${electionId}`;

      // Create room if it doesn't exist
      if (!this.rooms.has(roomId)) {
        this.createRoom(roomId, {
          electionId,
          type: 'election',
          permissions: ['view_election'],
          metadata: {}
        });
      }

      // Join the room
      await this.handleJoinRoom(socket, { roomId });

      // Send current election data
      await this.sendElectionData(socket, electionId);

    } catch (error) {
      socket.emit('subscribe_election_error', { error: error.message });
      logger.error('Failed to subscribe to election', {
        socketId: socket.id,
        electionId: data.electionId,
        error: error.message
      });
    }
  }

  /**
   * Handle election unsubscription
   */
  private async handleUnsubscribeElection(socket: Socket, data: any): Promise<void> {
    try {
      const { electionId } = data;
      const roomId = `election_${electionId}`;

      await this.handleLeaveRoom(socket, { roomId });

    } catch (error) {
      logger.error('Failed to unsubscribe from election', {
        socketId: socket.id,
        electionId: data.electionId,
        error: error.message
      });
    }
  }

  /**
   * Handle statistics request
   */
  private async handleGetStatistics(socket: Socket, data: any): Promise<void> {
    try {
      const { electionId } = data;
      
      if (electionId) {
        const statistics = voteProjection.getStatistics(electionId);
        socket.emit('statistics_update', {
          electionId,
          statistics,
          timestamp: Date.now()
        });
      } else {
        // Send server statistics
        const serverStats = this.getStatistics();
        socket.emit('server_statistics', {
          statistics: serverStats,
          timestamp: Date.now()
        });
      }

    } catch (error) {
      socket.emit('statistics_error', { error: error.message });
      logger.error('Failed to get statistics', {
        socketId: socket.id,
        error: error.message
      });
    }
  }

  /**
   * Handle election data request
   */
  private async handleGetElectionData(socket: Socket, data: any): Promise<void> {
    try {
      const { electionId } = data;
      await this.sendElectionData(socket, electionId);

    } catch (error) {
      socket.emit('election_data_error', { error: error.message });
      logger.error('Failed to get election data', {
        socketId: socket.id,
        electionId: data.electionId,
        error: error.message
      });
    }
  }

  /**
   * Handle client disconnection
   */
  private handleDisconnection(socket: Socket, reason: string): void {
    const clientSession = this.clients.get(socket.id);
    
    if (clientSession) {
      logger.info('Client disconnected', {
        socketId: socket.id,
        userId: clientSession.userId,
        reason,
        duration: Date.now() - clientSession.connectedAt
      });

      this.clients.delete(socket.id);
    }
  }

  /**
   * Setup event subscriptions for real-time updates
   */
  private setupEventSubscriptions(): void {
    // Subscribe to vote events
    const eventBus = require('../../core/event-bus/EventBus').default;
    
    eventBus.subscribe('VoteCast', (event: DomainEvent) => {
      this.handleVoteCastEvent(event);
    });

    eventBus.subscribe('VoteCancelled', (event: DomainEvent) => {
      this.handleVoteCancelledEvent(event);
    });

    eventBus.subscribe('VoteVerified', (event: DomainEvent) => {
      this.handleVoteVerifiedEvent(event);
    });

    eventBus.subscribe('VoteInvalidated', (event: DomainEvent) => {
      this.handleVoteInvalidatedEvent(event);
    });

    logger.debug('Event subscriptions setup completed');
  }

  /**
   * Handle VoteCast event
   */
  private handleVoteCastEvent(event: DomainEvent): void {
    const update: DashboardUpdate = {
      type: 'vote_cast',
      electionId: event.aggregateId,
      data: event.payload,
      timestamp: event.timestamp
    };

    this.broadcastToRoom(`election_${event.aggregateId}`, 'vote_cast', update);
    
    // Update statistics
    const statistics = voteProjection.getStatistics(event.aggregateId);
    if (statistics) {
      this.broadcastToRoom(`election_${event.aggregateId}`, 'statistics_update', {
        electionId: event.aggregateId,
        statistics,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle VoteCancelled event
   */
  private handleVoteCancelledEvent(event: DomainEvent): void {
    const update: DashboardUpdate = {
      type: 'vote_cancelled',
      electionId: event.aggregateId,
      data: event.payload,
      timestamp: event.timestamp
    };

    this.broadcastToRoom(`election_${event.aggregateId}`, 'vote_cancelled', update);
    
    // Update statistics
    const statistics = voteProjection.getStatistics(event.aggregateId);
    if (statistics) {
      this.broadcastToRoom(`election_${event.aggregateId}`, 'statistics_update', {
        electionId: event.aggregateId,
        statistics,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle VoteVerified event
   */
  private handleVoteVerifiedEvent(event: DomainEvent): void {
    const update: DashboardUpdate = {
      type: 'statistics_update',
      electionId: event.aggregateId,
      data: event.payload,
      timestamp: event.timestamp
    };

    const statistics = voteProjection.getStatistics(event.aggregateId);
    if (statistics) {
      this.broadcastToRoom(`election_${event.aggregateId}`, 'statistics_update', {
        electionId: event.aggregateId,
        statistics,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle VoteInvalidated event
   */
  private handleVoteInvalidatedEvent(event: DomainEvent): void {
    const update: DashboardUpdate = {
      type: 'statistics_update',
      electionId: event.aggregateId,
      data: event.payload,
      timestamp: event.timestamp
    };

    const statistics = voteProjection.getStatistics(event.aggregateId);
    if (statistics) {
      this.broadcastToRoom(`election_${event.aggregateId}`, 'statistics_update', {
        electionId: event.aggregateId,
        statistics,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Send room data to client
   */
  private async sendRoomData(socket: Socket, room: DashboardRoom): Promise<void> {
    if (room.type === 'election' && room.electionId) {
      await this.sendElectionData(socket, room.electionId);
    }
  }

  /**
   * Send election data to client
   */
  private async sendElectionData(socket: Socket, electionId: string): Promise<void> {
    const statistics = voteProjection.getStatistics(electionId);
    const trends = voteProjection.getTrends(electionId);
    const participation = voteProjection.getParticipation(electionId);

    socket.emit('election_data', {
      electionId,
      statistics,
      trends: trends ? Object.fromEntries(trends) : null,
      participation,
      timestamp: Date.now()
    });
  }

  /**
   * Set permissions based on user role
   */
  private setPermissions(clientSession: ClientSession, userRole?: string): void {
    const rolePermissions: Record<string, string[]> = {
      admin: ['view_all', 'manage_elections', 'view_analytics', 'manage_users'],
      moderator: ['view_all', 'manage_elections', 'view_analytics'],
      election_official: ['view_assigned', 'manage_assigned_elections'],
      observer: ['view_all', 'view_analytics'],
      voter: ['view_public']
    };

    const permissions = rolePermissions[userRole || 'voter'] || [];
    clientSession.permissions = new Set(permissions);
  }

  /**
   * Check if client has required permissions
   */
  private hasPermission(clientSession: ClientSession, requiredPermissions: string[]): boolean {
    return requiredPermissions.every(permission => 
      clientSession.permissions.has(permission)
    );
  }
}

export default SocketIoServer;
