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
const fs = require("fs");
const os = require("os");

const { Server } = require("socket.io");

const connectDB = require("./src/config/db");
const { initializeSocket } = require("./src/utils/socketService");
const { errorHandler, notFound } = require("./src/middleware");
const User = require("./src/models/User");

const dashboardRoutes = require("./src/api/dashboard/dashboard.routes");
const { bootstrapERIECluster } = require("./src/core/erie/erie.router");

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
  },
});

app.set("io", io);

/* attach io to request */
app.use((req, _, next) => {
  req.io = io;
  next();
});

/* =========================================================
   DATABASE INIT
========================================================= */
async function bootstrap() {
  await connectDB();
  await createAdminUser();

  // 🚀 ERIE CLUSTER (AI + REALTIME INTELLIGENCE CORE)
  await bootstrapERIECluster(4);

  // 🚀 SOCKET INITIALIZATION (if you have adapter layer)
  if (initializeSocket) {
    await initializeSocket(server, io);
  }
}

bootstrap();

/* =========================================================
   ADMIN AUTO-CREATION
========================================================= */
async function createAdminUser() {
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
}

/* =========================================================
   SOCKET LOGIC (CLEAN + MULTI-TENANT READY)
========================================================= */
io.on("connection", (socket) => {
  console.log("🟢 Client:", socket.id);

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
    console.log("🔴 Disconnected:", socket.id);
  });
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

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

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

app.use("/api", notFound);

/* =========================================================
   STATIC FRONTEND
========================================================= */
const frontendPath = path.join(__dirname, "..", "frontend");

app.use(express.static(frontendPath));

/* =========================================================
   ERROR HANDLING
========================================================= */
app.use(errorHandler);

/* =========================================================
   REALTIME ENGINE (SAFE WRAPPER)
========================================================= */
const realtime = {
  voteUpdate: async (electionId) => {
    const Vote = require("./src/models/Vote");
    const total = await Vote.countDocuments({ electionId });

    io.to(`election:${electionId}`).emit("voteUpdate", {
      electionId,
      totalVotes: total,
    });
  },

  electionUpdate: (data) => {
    io.to(`tenant:${data.tenantId}`).emit("electionUpdate", data);
  },

  userUpdate: async () => {
    const totalUsers = await User.countDocuments();

    io.emit("userUpdate", { totalUsers });
  },

  systemAlert: (msg) => {
    io.to("admins").emit("systemAlert", {
      message: msg,
      time: new Date(),
    });
  },
};

/* =========================================================
   PROCESS SAFETY
========================================================= */
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err.message);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err.message);
});

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

module.exports = { app, server, io, realtime };