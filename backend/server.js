require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const session = require("express-session");
const passport = require("./src/config/passport");
const path = require("path");
const os = require("os");

const { Server } = require("socket.io");
const { logger, createRequestLogger } = require("./src/utils/logger");
const { requestTracer, performanceTracker, errorTracer } = require("./src/middleware/requestTracer");
const { metricsCollector, healthMonitor, performanceMonitor, alertManager } = require("./src/utils/monitoring");

/* =========================================================
   CORE SERVICES
========================================================= */
const connectDB = require("./src/config/db");
const User = require("./src/models/User");
const { validateEnvironment } = require("./src/config/envValidator");

const { initializeSocket } = require("./src/utils/socketService");
const { errorHandler, notFound } = require("./src/middleware");

/* =========================================================
   ERIE v8 (NEW STREAM CORE)
========================================================= */
const { bootstrapERIEv8 } = require("./src/core/erie/v8/erie.v8");

/* =========================================================
   ROUTES
========================================================= */
const {
  authRoutes,
  electionRoutes,
  candidateRoutes,
  voteRoutes,
  userRoutes,
  aiRoutes,
  adminRoutes,
  paymentRoutes,
} = require("./src/routes");

const { sanitizeInput } = require("./src/middleware/inputValidator");
const { authLimiter, voteLimiter, uploadLimiter } = require("./src/middleware/rateLimit");

const dashboardRoutes = require("./src/api/dashboard/dashboard.routes");

/* =========================================================
   APP + SERVER
========================================================= */
const app = express();
const server = http.createServer(app);

/* =========================================================
   SOCKET.IO
========================================================= */
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"],
  },
});

app.set("io", io);

app.use((req, _, next) => {
  req.io = io;
  next();
});

/* =========================================================
   REQUEST TRACING
========================================================= */
app.use(requestTracer);
app.use(performanceTracker);

/* =========================================================
   REQUEST LOGGING
========================================================= */
app.use((req, res, next) => {
  req.logger = createRequestLogger(req);
  next();
});

/* =========================================================
   MIDDLEWARE
========================================================= */
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(cors({ origin: "*", credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(compression());

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

/* =========================================================
   SESSION + PASSPORT
========================================================= */
app.use(
  session({
    secret: process.env.SESSION_SECRET || "votewave-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 86400000,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

/* =========================================================
   ROUTES
========================================================= */
app.use("/api/dashboard", dashboardRoutes);

// Apply global security middleware
app.use(sanitizeInput);

// Apply rate limiting to API routes
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/elections", apiLimiter, electionRoutes);
app.use("/api/elections/:electionId/candidates", apiLimiter, candidateRoutes);
app.use("/api/elections/:electionId/votes", voteLimiter, voteRoutes);
app.use("/api/users", apiLimiter, userRoutes);
app.use("/api/ai", apiLimiter, aiRoutes);
app.use("/api/admin", apiLimiter, adminRoutes);
app.use("/api/payment", apiLimiter, paymentRoutes);

/* =========================================================
   ROOT ROUTE
========================================================= */
app.get("/", (req, res) => {
  res.json({
    message: "VoteWave API Server",
    status: "Running",
    version: "1.0.0",
    endpoints: {
      health: "/api/health",
      auth: "/api/auth",
      elections: "/api/elections",
      admin: "/api/admin",
      users: "/api/users",
      ai: "/api/ai",
      payment: "/api/payment",
    },
    documentation: "API endpoints available above",
  });
});

/* =========================================================
   HEALTH CHECK WITH MONITORING
========================================================= */
app.get("/api/health", (req, res) => {
  const startTime = Date.now();
  
  // Check all services
  const healthResults = await healthMonitor.checkAllServices();
  
  const response = {
    status: healthResults.overall ? "OK" : "DEGRADED",
    time: new Date().toISOString(),
    env: process.env.NODE_ENV,
    services: Object.fromEntries(healthResults.services),
    metrics: metricsCollector.getMetrics(),
    alerts: alertManager.getRecentAlerts(5),
    uptime: process.uptime(),
    responseTime: Date.now() - startTime
  };

  // Log health check with monitoring data
  if (healthResults.overall) {
    logger.info('System health check passed', {
      services: healthResults.services,
      metrics: response.metrics,
      responseTime: response.responseTime
    });
  } else {
    logger.warn('System health check failed', {
      services: healthResults.services,
      failedServices: Array.from(healthResults.services.entries())
        .filter(([name, status]) => status.status !== 'healthy')
        .map(([name]) => name)
    });
  }

  res.status(healthResults.overall ? 200 : 503).json(response);
});

/* =========================================================
   STATIC FRONTEND
========================================================= */
const frontendPath = path.join(__dirname, "frontend");
app.use(express.static(frontendPath));

/* =========================================================
   ERROR HANDLING
========================================================= */
app.use(notFound);
app.use(errorHandler);

/* =========================================================
   ADMIN BOOTSTRAP
========================================================= */
async function createAdminUser() {
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) return;

    const exists = await User.findOne({ email: adminEmail });
    if (exists) return;

    await User.create({
      firstName: process.env.ADMIN_FIRST_NAME || "Admin",
      lastName: process.env.ADMIN_LAST_NAME || "User",
      email: adminEmail,
      password: adminPassword,
      role: "admin",
      isVerified: true,
    });

    console.log(`✅ Admin created: ${adminEmail}`);
  } catch (err) {
    console.error("Admin creation failed:", err.message);
  }
}

/* =========================================================
   SOCKET EVENTS
========================================================= */
io.on("connection", (socket) => {
  console.log("🟢 Client connected:", socket.id);

  socket.on("tenant:join", (tenantId) => {
    socket.join(`tenant:${tenantId}`);
  });

  socket.on("election:join", (id) => {
    socket.join(`election:${id}`);
  });

  socket.on("joinAdmin", () => {
    socket.join("admins");
  });

  socket.on("disconnect", () => {
    console.log("🔴 Client disconnected:", socket.id);
  });
});

/* =========================================================
   ENVIRONMENT VALIDATION
========================================================= */
const envValidation = validateEnvironment();
if (!envValidation.isValid) {
  process.exit(1);
}

/* =========================================================
   SAFE BOOTSTRAP (NO CRASH CHAIN)
========================================================= */
async function bootstrap() {
  try {
    console.log("⏳ Starting system bootstrap...");
    console.log(`🔧 Environment: ${envValidation.config.environment}`);

    /* 1. DATABASE FIRST */
    await connectDB();
    console.log("✅ Database connected");

    /* 2. ADMIN */
    await createAdminUser();

    /* 3. SOCKET INIT */
    if (initializeSocket) {
      await initializeSocket(server, io);
      console.log("✅ Socket initialized");
    }

    /* 4. ERIE v8 START (CRITICAL STREAM LAYER) */
    try {
      await bootstrapERIEv8(4);
      console.log("🚀 ERIE v8 cluster started");
    } catch (err) {
      console.error("⚠️ ERIE v8 failed to start:", err.message);
      console.log("⚠️ System will continue WITHOUT streaming layer");
    }

    console.log("🚀 SYSTEM BOOTSTRAP COMPLETE");
  } catch (err) {
    console.error("❌ Fatal bootstrap error:", err.message);
    process.exit(1);
  }
}

bootstrap();

/* =========================================================
   SERVER START
========================================================= */
const PORT = process.env.PORT || 5000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 Network: http://${getLocalIP()}:${PORT}`);
});

/* =========================================================
   HELPERS
========================================================= */
function getLocalIP() {
  const nets = os.networkInterfaces();

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }

  return "127.0.0.1";
}

/* =========================================================
   PROCESS SAFETY
========================================================= */
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err.message);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err.message);
});

module.exports = { app, server, io };