/**
 * VoteWave Server Entry (Production Realtime Bootstrap)
 * CQRS + Event Sourcing + Socket.IO (Phase 4 Ready)
 */

import express, { Application, Request, Response } from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import dotenv from "dotenv";
import { Server as SocketIOServer } from "socket.io";

import { logger } from "./utils/logger";

// ✅ FIXED PATHS (IMPORTANT)
import { initializeCoreSystem, getSystemHealth } from "./core";

import { registerVoteCommandHandlers } from "./domain/vote/VoteCommands";
import { registerElectionCommandHandlers } from "./domain/election/ElectionCommands";
import { registerUserCommandHandlers } from "./domain/user/UserCommands";

import { MongoEventStore } from "./infrastructure/mongodb/MongoEventStore";
import { MongoProjectionStore } from "./infrastructure/mongodb/MongoProjectionStore";

import { ReplayEngine } from "./core/replay/ReplayEngine";
import { MultiRegionSimulator } from "./infrastructure/replication/MultiRegionSimulator";

import { ApiGateway } from "./routes/gateway/ApiGateway";

import commandRoutes from "./routes/commands";
import voteQueries from "./routes/queries/voteQueries";

import { setSocketServer } from "./realtime/eventBus";
import { initializeSocketBridge } from "./realtime/socketBridge";

dotenv.config();

/**
 * ENV
 */
const PORT = Number(process.env.PORT || 3001);
const NODE_ENV = process.env.NODE_ENV || "development";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/votewave";

/**
 * CONFIG
 */
interface ServerConfig {
  port: number;
  nodeEnv: string;
  mongodbUri: string;
  enableWebSocket: boolean;
  enableReplayEngine: boolean;
  enableMultiRegion: boolean;
}

/**
 * SERVER
 */
class VoteWaveServer {
  private app: Application;
  private httpServer: http.Server;
  private io: SocketIOServer | null = null;

  private mongoEventStore: MongoEventStore | null = null;
  private mongoProjectionStore: MongoProjectionStore | null = null;

  private replayEngine: ReplayEngine | null = null;
  private multiRegionSimulator: MultiRegionSimulator | null = null;

  private apiGateway: ApiGateway;
  private config: ServerConfig;

  constructor(config?: Partial<ServerConfig>) {
    this.config = {
      port: config?.port ?? PORT,
      nodeEnv: config?.nodeEnv ?? NODE_ENV,
      mongodbUri: config?.mongodbUri ?? MONGODB_URI,
      enableWebSocket: config?.enableWebSocket ?? true,
      enableReplayEngine: config?.enableReplayEngine ?? false,
      enableMultiRegion: config?.enableMultiRegion ?? false
    };

    this.app = express();
    this.httpServer = http.createServer(this.app);
    this.apiGateway = new ApiGateway();

    logger.info("VoteWave initialized", {
      port: this.config.port,
      env: this.config.nodeEnv
    });
  }

  async start(): Promise<void> {
    try {
      this.setupMiddleware();
      await this.initializeCore();
      await this.setupDatabase();

      if (this.config.enableWebSocket) {
        await this.setupWebSocket();
      }

      await this.setupRoutes();
      await this.startHttpServer();

      this.setupGracefulShutdown();

      logger.info("VoteWave running", {
        port: this.config.port,
        realtime: !!this.io
      });

    } catch (error) {
      logger.error("Server startup failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  private setupMiddleware(): void {
    this.app.use(helmet());
    this.app.use(cors({ origin: "*", credentials: true }));
    this.app.use(compression());
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true }));

    logger.info("Middleware ready");
  }

  private async initializeCore(): Promise<void> {
    await initializeCoreSystem();

    registerVoteCommandHandlers();
    registerElectionCommandHandlers();
    registerUserCommandHandlers();

    logger.info("CQRS core initialized");
  }

  private async setupDatabase(): Promise<void> {
    this.mongoEventStore = new MongoEventStore({
      connectionString: this.config.mongodbUri,
      databaseName: "votewave_events",
      enableIndexing: true,
      enableCompression: true
    });

    await this.mongoEventStore.connect();

    this.mongoProjectionStore = new MongoProjectionStore({
      connectionString: this.config.mongodbUri,
      databaseName: "votewave_projections",
      enableIndexing: true,
      enableCompression: true
    });

    await this.mongoProjectionStore.connect();

    logger.info("MongoDB connected");
  }

  private async setupWebSocket(): Promise<void> {
    this.io = new SocketIOServer(this.httpServer, {
      cors: { origin: "*", credentials: true },
      transports: ["websocket", "polling"]
    });

    setSocketServer(this.io);
    initializeSocketBridge(this.io);

    this.io.on("connection", (socket) => {
      logger.info("Client connected", { socketId: socket.id });

      socket.emit("system:ready", { status: "connected" });

      socket.on("join-election", (id: string) =>
        socket.join(`election:${id}`)
      );

      socket.on("leave-election", (id: string) =>
        socket.leave(`election:${id}`)
      );

      socket.on("disconnect", () =>
        logger.info("Client disconnected", { socketId: socket.id })
      );
    });

    logger.info("Realtime WebSocket initialized");
  }

  private async setupRoutes(): Promise<void> {
    this.app.use(this.apiGateway.getRouter());

    this.app.use("/api/commands", commandRoutes);
    this.app.use("/api/queries/votes", voteQueries);

    this.app.get("/api/health", async (_req, res) => {
      const health = await getSystemHealth();

      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        health
      });
    });

    this.app.get("/", (_req, res) => {
      res.json({
        name: "VoteWave",
        version: "2.0.0",
        realtime: !!this.io,
        status: "running"
      });
    });

    this.app.use("*", (_req, res) => {
      res.status(404).json({ success: false, message: "Route not found" });
    });

    logger.info("Routes initialized");
  }

  private async startHttpServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer.listen(this.config.port, () => {
        logger.info(`Server listening on ${this.config.port}`);
        resolve();
      });

      this.httpServer.on("error", reject);
    });
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Shutdown signal: ${signal}`);

      try {
        await this.mongoEventStore?.disconnect();
        await this.mongoProjectionStore?.disconnect();
        this.io?.close();

        this.httpServer.close(() => {
          logger.info("HTTP server closed cleanly");
          process.exit(0);
        });

      } catch (error) {
        logger.error("Shutdown failed", {
          error: error instanceof Error ? error.message : String(error)
        });

        process.exit(1);
      }
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  }
}

/**
 * BOOTSTRAP
 */
async function bootstrap(): Promise<void> {
  const server = new VoteWaveServer({
    enableWebSocket: true,
    enableReplayEngine: false,
    enableMultiRegion: false
  });

  await server.start();
}

if (require.main === module) {
  bootstrap().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export default VoteWaveServer;