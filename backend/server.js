require("dotenv").config();

/* =========================================================
   CORE IMPORTS
========================================================= */
const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const session = require("express-session");
const passport = require("./config/passport");
const path = require("path");
const os = require("os");
const responseTime = require("response-time");

/* =========================================================
   SOCKET.IO
========================================================= */
const { Server } = require("socket.io");
const { initializeSocket } = require("./utils/socketService");

/* =========================================================
   DATABASE + CORE
========================================================= */
const connectDB = require("./config/db");
const User = require("./models/User");

const { bootstrapERIECluster } = require("./core/erie/erie.router");
const { bootstrapERIEOrchestrator } = require("./core/erie/erie.orchestrator");

/* =========================================================
   OBSERVABILITY
========================================================= */
const requestTracer = require("./src/observability/tracing");

const {
  httpRequestCounter,
  httpDurationHistogram,
} = require("./src/observability/metrics");

const prometheusRoutes = require("./src/observability/prometheus");

const {
  getSystemHealth,
} = require("./src/observability/health.monitor");

/* =========================================================
   MIDDLEWARE
========================================================= */
const { errorHandler, notFound } = require("./middleware");

/* =========================================================
   ROUTES
========================================================= */
const dashboardRoutes = require("./src/api/dashboard/dashboard.routes");

const {
  authRoutes,
  electionRoutes,
  candidateRoutes,
  voteRoutes,
  userRoutes,
  aiRoutes,
  adminRoutes,
  paymentRoutes,
} = require("./routes");

/* =========================================================
   APP + SERVER
========================================================= */
const app = express();
const server = http.createServer(app);

/* =========================================================
   SOCKET.IO (SINGLE SOURCE OF TRUTH)
========================================================= */
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"],
    credentials: true,
  },

  transports: ["websocket", "polling"],

  pingTimeout: 60000,
  pingInterval: 25000,
});

/* =========================================================
   APP GLOBALS
========================================================= */
app.set("io", io);

app.use((req, _, next) => {
  req.io = io;
  next();
});

/* =========================================================
   DATABASE + CORE BOOTSTRAP
========================================================= */
async function bootstrap() {
  try {
    console.log("🚀 Bootstrapping VoteWave...");

    /* DATABASE */
    await connectDB();
    console.log("✅ MongoDB Connected");

    /* ADMIN */
    await createAdminUser();

    /* ERIE CLUSTER */
    await bootstrapERIECluster(
      Number(process.env.ERIE_CLUSTER_SIZE) || 4
    );

    console.log("✅ ERIE Cluster Online");

    /* ERIE ORCHESTRATOR */
    await bootstrapERIEOrchestrator();

    console.log("✅ ERIE Orchestrator Online");

    /* SOCKET REDIS ADAPTER */
    if (initializeSocket) {
      await initializeSocket(server);
      console.log("✅ Socket Layer Initialized");
    }

    console.log("🔥 VoteWave Core Ready");
  } catch (err) {
    console.error("❌ Bootstrap failed:", err);
    process.exit(1);
  }
}

bootstrap();

/* =========================================================
   AUTO CREATE ADMIN
========================================================= */
async function createAdminUser() {
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) return;

    const exists = await User.findOne({
      email: adminEmail,
    });

    if (exists) return;

    await User.create({
      firstName:
        process.env.ADMIN_FIRST_NAME || "System",

      lastName:
        process.env.ADMIN_LAST_NAME || "Administrator",

      email: adminEmail,
      password: adminPassword,

      role: "superadmin",

      isVerified: true,
    });

    console.log(`✅ Admin created: ${adminEmail}`);
  } catch (err) {
    console.error("❌ Admin bootstrap error:", err.message);
  }
}

/* =========================================================
   SOCKET.IO CORE
========================================================= */
io.on("connection", (socket) => {
  console.log(`🟢 Socket connected: ${socket.id}`);

  /* =========================
     MULTI-TENANT ROOMS
  ========================== */

  socket.on("tenant:join", (tenantId) => {
    socket.join(`tenant:${tenantId}`);

    console.log(
      `🏢 Tenant room joined: tenant:${tenantId}`
    );
  });

  socket.on("election:join", (electionId) => {
    socket.join(`election:${electionId}`);

    console.log(
      `🗳 Election room joined: election:${electionId}`
    );
  });

  socket.on("joinAdmin", () => {
    socket.join("admins");

    console.log("👮 Admin connected");
  });

  /* =========================
     SOCKET HEALTH
  ========================== */

  socket.on("ping:health", () => {
    socket.emit("pong:health", {
      status: "alive",
      timestamp: Date.now(),
    });
  });

  /* =========================
     DISCONNECT
  ========================== */

  socket.on("disconnect", (reason) => {
    console.log(
      `🔴 Socket disconnected: ${socket.id} (${reason})`
    );
  });
});

/* =========================================================
   SECURITY MIDDLEWARE
========================================================= */
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
    credentials: true,
  })
);

/* =========================================================
   BODY PARSERS
========================================================= */
app.use(express.json({ limit: "10mb" }));

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  })
);

/* =========================================================
   PERFORMANCE
========================================================= */
app.use(compression());

/* =========================================================
   OBSERVABILITY
========================================================= */
app.use(requestTracer);

app.use(
  responseTime((req, res, time) => {
    httpRequestCounter.inc({
      method: req.method,
      route: req.path,
      status: res.statusCode,
    });

    httpDurationHistogram.observe(
      {
        method: req.method,
        route: req.path,
      },
      time / 1000
    );
  })
);

/* =========================================================
   SESSION
========================================================= */
app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "votewave-session-secret",

    resave: false,

    saveUninitialized: false,

    cookie: {
      secure:
        process.env.NODE_ENV === "production",

      httpOnly: true,

      sameSite: "lax",

      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

/* =========================================================
   PASSPORT
========================================================= */
app.use(passport.initialize());
app.use(passport.session());

/* =========================================================
   LOGGING
========================================================= */
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

/* =========================================================
   OBSERVABILITY ROUTES
========================================================= */
app.use("/metrics", prometheusRoutes);

/* =========================================================
   API ROUTES
========================================================= */
app.use("/api/dashboard", dashboardRoutes);

app.use("/api/auth", authRoutes);

app.use("/api/elections", electionRoutes);

app.use(
  "/api/elections/:electionId/candidates",
  candidateRoutes
);

app.use(
  "/api/elections/:electionId/votes",
  voteRoutes
);

app.use("/api/users", userRoutes);

app.use("/api/ai", aiRoutes);

app.use("/api/admin", adminRoutes);

app.use("/api/payment", paymentRoutes);

/* =========================================================
   HEALTH CHECK
========================================================= */
app.get("/api/health", async (_, res) => {
  const health = await getSystemHealth();

  res.status(200).json({
    success: true,
    system: "VoteWave",

    timestamp: new Date().toISOString(),

    ...health,
  });
});

/* =========================================================
   404 HANDLER
========================================================= */
app.use("/api", notFound);

/* =========================================================
   STATIC FRONTEND
========================================================= */
const frontendPath = path.join(
  __dirname,
  "..",
  "frontend"
);

app.use(express.static(frontendPath));

app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({
      success: false,
      message: "API route not found",
    });
  }

  res.sendFile(
    path.join(frontendPath, "index.html")
  );
});

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */
app.use(errorHandler);

/* =========================================================
   REALTIME HELPERS
========================================================= */
const realtime = {
  voteUpdate: async ({
    electionId,
    tenantId,
    totalVotes,
  }) => {
    io.to(`election:${electionId}`).emit(
      "vote:update",
      {
        electionId,
        tenantId,
        totalVotes,
      }
    );
  },

  electionUpdate: (payload) => {
    io.to(`tenant:${payload.tenantId}`).emit(
      "election:update",
      payload
    );
  },

  dashboardUpdate: (payload) => {
    io.to(`tenant:${payload.tenantId}`).emit(
      "dashboard:update",
      payload
    );
  },

  fraudAlert: (payload) => {
    io.to("admins").emit(
      "fraud:alert",
      payload
    );
  },

  systemAlert: (message) => {
    io.to("admins").emit(
      "system:alert",
      {
        message,
        time: new Date(),
      }
    );
  },
};

/* =========================================================
   PROCESS SAFETY
========================================================= */
process.on("unhandledRejection", (err) => {
  console.error(
    "❌ Unhandled Rejection:",
    err
  );
});

process.on("uncaughtException", (err) => {
  console.error(
    "❌ Uncaught Exception:",
    err
  );
});

/* =========================================================
   SERVER START
========================================================= */
const PORT = process.env.PORT || 5000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("╔══════════════════════════════════════╗");
  console.log("║        🚀 VoteWave SaaS Core         ║");
  console.log("╠══════════════════════════════════════╣");
  console.log(
    `║ 🌐 Local:   http://localhost:${PORT}`
  );
  console.log(
    `║ 📡 Network: http://${getLocalIP()}:${PORT}`
  );
  console.log(
    `║ 🧠 ERIE:    ACTIVE`
  );
  console.log(
    `║ 🤖 ML:      ACTIVE`
  );
  console.log(
    `║ 🔐 Fraud:   ACTIVE`
  );
  console.log("╚══════════════════════════════════════╝");
  console.log("");
});

/* =========================================================
   HELPERS
========================================================= */
function getLocalIP() {
  const nets = os.networkInterfaces();

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (
        net.family === "IPv4" &&
        !net.internal
      ) {
        return net.address;
      }
    }
  }

  return "127.0.0.1";
}

/* ========================================================= */

module.exports = {
  app,
  server,
  io,
  realtime,
};