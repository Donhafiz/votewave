require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const session = require('express-session');
const passport = require('./config/passport');
const path = require('path');
const fs = require('fs');

const connectDB = require('./config/db');
const { initializeSocket } = require('./utils/socketService');
const { errorHandler, notFound } = require('./middleware');
const User = require('./models/User');

const {
  authRoutes,
  electionRoutes,
  candidateRoutes,
  voteRoutes,
  userRoutes,
  aiRoutes,
  adminRoutes,
  paymentRoutes,
} = require('./routes');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Auto-create admin user on startup if configured
const createAdminUser = async () => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminFirstName = process.env.ADMIN_FIRST_NAME || 'Admin';
    const adminLastName = process.env.ADMIN_LAST_NAME || 'User';

    if (!adminEmail || !adminPassword) return;

    const existingAdmin = await User.findOne({ email: adminEmail });
    if (existingAdmin) return;

    await User.create({
      firstName: adminFirstName,
      lastName: adminLastName,
      email: adminEmail,
      password: adminPassword,
      role: 'admin',
      isVerified: true,
    });

    console.log(`✅ Admin user created: ${adminEmail}`);
  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
  }
};

// Connect to Database
connectDB().then(() => createAdminUser());

// ========================================
// SOCKET.IO INITIALIZATION (UPGRADED)
// ========================================
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Make io globally accessible everywhere
app.set('io', io);

// Attach socket helpers to requests
app.use((req, res, next) => {
  req.io = io;
  next();
});
io.on('connection', (socket) => {
  console.log(`⚡ Client connected: ${socket.id}`);

  // Join admin room
  socket.on('joinAdmin', () => {
    socket.join('admins');
    console.log('👮 Admin joined real-time channel');
  });

  // Optional: voter tracking room
  socket.on('joinVoter', (userId) => {
    socket.join(`voter_${userId}`);
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

// Security Middleware - Disabled CSP for development
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// CORS - Allow all origins for development and mobile access
app.use(cors({
  origin: '*',
  credentials: true,
}));

// Body Parsing Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression Middleware
app.use(compression());

// Session Middleware for OAuth
app.use(session({
  secret: process.env.SESSION_SECRET || 'votewave-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Passport Middleware
app.use(passport.initialize());
app.use(passport.session());

// Logging Middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ========================================
// FRONTEND STATIC FILE SERVING
// ========================================
const frontendPath = path.join(__dirname, '..', 'frontend');

// Verify frontend path exists
if (fs.existsSync(frontendPath)) {
  console.log(`📁 Frontend path found: ${frontendPath}`);
} else {
  console.warn(`⚠️ Frontend path not found: ${frontendPath}`);
}

// Serve static files (CSS, JS, images, etc.)
app.use(express.static(frontendPath));

// ========================================
// API Routes
// ========================================
app.use('/api/auth', authRoutes);
app.use('/api/elections', electionRoutes);
app.use('/api/elections/:electionId/candidates', candidateRoutes);
app.use('/api/elections/:electionId/votes', voteRoutes);
app.use('/api/users', userRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payment', paymentRoutes);

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'VoteWave API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// API 404 Handler
app.use('/api', notFound);

// FRONTEND SHORTCUTS
app.get(['/login', '/register', '/auth/login', '/auth/register'], (req, res) => {
  const frontendPath = path.join(__dirname, '..', 'frontend');
  const target = req.path.endsWith('/login') ? '/auth/login.html' : '/auth/register.html';
  return res.sendFile(path.join(frontendPath, target));
});

// ========================================
// FRONTEND ROUTES - Serve HTML files
// ========================================
// Handle all frontend routes
app.get('*', (req, res) => {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }

  // Build the file path
  let requestedFile = req.path === '/' ? '/index.html' : req.path;
  
  // If accessing /frontend/ paths directly
  if (requestedFile.startsWith('/frontend/')) {
    requestedFile = requestedFile.replace('/frontend', '');
  }

  const filePath = path.join(frontendPath, requestedFile);

  // Check if file exists
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    // Set proper MIME types
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
    };
    res.setHeader('Content-Type', mimeTypes[ext] || 'text/plain');
    return res.sendFile(filePath);
  }

  // Fallback to index.html for SPA-like behavior
  const indexPath = path.join(frontendPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }

  // If nothing works
  res.status(404).send(`
    <!DOCTYPE html>
    <html>
    <head><title>VoteWave - Page Not Found</title>
    <style>body{font-family:Arial;display:flex;align-items:center;justify-content:center;height:100vh;background:#0f172a;color:white;text-align:center;}</style>
    </head>
    <body><div><h1>404</h1><p>Page not found</p><p>Available: <a href="/frontend/index.html" style="color:#6366f1;">Homepage</a></p></div></body>
    </html>
  `);
});

// Global Error Handler
app.use(errorHandler);

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err.message);
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  server.close(() => process.exit(1));
});

// ========================================
// START SERVER
// ========================================
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0'; // Listen on all network interfaces

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   🚀 VoteWave Server Running             ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║   🌐 Local:    http://localhost:${PORT}      ║`);
  console.log(`║   📱 Network:  http://${getLocalIP()}:${PORT}   ║`);
  console.log(`║   📁 Frontend: ${frontendPath}`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
});

// Helper to get local IP
function getLocalIP() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '192.168.x.x';
}
// ========================================
// REAL-TIME EVENT HELPERS
// ========================================
const realtime = {
  voteUpdate: async (electionId) => {
    const Vote = require('./models/Vote');
    const totalVotes = await Vote.countDocuments({ electionId });

    io.emit('voteUpdate', {
      electionId,
      totalVotes
    });
  },

  electionUpdate: (data) => {
    io.emit('electionUpdate', data);
  },

  userUpdate: async () => {
    const User = require('./models/User');
    const totalUsers = await User.countDocuments();

    io.emit('userUpdate', {
      totalUsers
    });
  },

  systemAlert: (message) => {
    io.to('admins').emit('systemAlert', {
      message,
      time: new Date()
    });
  }
};
module.exports = { app, server, io, realtime };