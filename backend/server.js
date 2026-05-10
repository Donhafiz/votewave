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

/* =========================================================
   CORE SERVICES
========================================================= */
const connectDB = require("./src/config/db");
const User = require("./src/models/User");

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

app.use("/api/auth", authRoutes);
app.use("/api/elections", electionRoutes);
app.use("/api/elections/:electionId/candidates", candidateRoutes);
app.use("/api/elections/:electionId/votes", voteRoutes);
app.use("/api/users", userRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/payment", paymentRoutes);

/* =========================================================
   HEALTH CHECK
========================================================= */
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    time: new Date().toISOString(),
    env: process.env.NODE_ENV,
  });
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
   SAFE BOOTSTRAP (NO CRASH CHAIN)
========================================================= */
async function bootstrap() {
  try {
    console.log("⏳ Starting system bootstrap...");

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