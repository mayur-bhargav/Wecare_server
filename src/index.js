require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/database');
const NotificationService = require('./services/notificationService');
const User = require('./models/User');
const DaycareProvider = require('./models/DaycareProvider');
const authRoutes = require('./routes/auth');
const bookingRoutes = require('./routes/bookings');
const userRoutes = require('./routes/users');
const paymentRoutes = require('./routes/payments');
const reviewRoutes = require('./routes/reviews');
const cityRoutes = require('./routes/cities');
const providerRoutes = require('./routes/providers');
const notificationRoutes = require('./routes/notifications');
const adminRoutes = require('./routes/admin');
const messageRoutes = require('./routes/messages');
const photoRoutes = require('./routes/photos');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/cities', cityRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/photos', photoRoutes);

// ── WebRTC signaling (Socket.IO) ──
io.on('connection', (socket) => {
  console.log('[Server] New socket connected:', socket.id);

  socket.on('call:join', ({ conversationId, userId }) => {
    console.log('[Server] call:join — socket:', socket.id, 'conversationId:', conversationId, 'userId:', userId);
    if (conversationId) {
      socket.join(conversationId);
    }
    if (userId) {
      socket.join(`user:${userId}`);
    }
  });

  socket.on('call:offer', async (payload) => {
    console.log('[Server] call:offer — from:', payload?.fromUserId, 'to:', payload?.toUserId, 'conversationId:', payload?.conversationId, 'hasSdp:', !!payload?.sdp);
    if (!payload?.conversationId) return;
    socket.to(payload.conversationId).emit('call:offer', payload);
    if (payload?.toUserId) {
      socket.to(`user:${payload.toUserId}`).emit('call:offer', payload);
    }

    try {
      if (!payload?.toUserId || !payload?.toRole) return;
      const data = {
        type: 'call_invite',
        conversationId: String(payload.conversationId),
        fromUserId: String(payload.fromUserId || ''),
        fromName: String(payload.fromName || ''),
        toUserId: String(payload.toUserId || ''),
        toRole: String(payload.toRole || ''),
      };

      if (payload.toRole === 'parent') {
        const title = '📞 Incoming Call';
        const body = `${payload.fromName || 'Someone'} is calling you`;
        await NotificationService.sendToUser(payload.toUserId, { title, body, data });
      } else if (payload.toRole === 'daycare') {
        const daycare = await DaycareProvider.findById(payload.toUserId);
        if (daycare?.fcmToken) {
          await NotificationService.sendDataToToken(daycare.fcmToken, data);
        }
      }
    } catch (error) {
      console.error('Call invite push error:', error);
    }
  });

  socket.on('call:answer', (payload) => {
    console.log('[Server] call:answer — from:', payload?.fromUserId, 'to:', payload?.toUserId, 'conversationId:', payload?.conversationId);
    if (!payload?.conversationId) return;
    socket.to(payload.conversationId).emit('call:answer', payload);
    if (payload?.toUserId) {
      socket.to(`user:${payload.toUserId}`).emit('call:answer', payload);
    }
  });

  socket.on('call:ice', (payload) => {
    if (!payload?.conversationId) return;
    socket.to(payload.conversationId).emit('call:ice', payload);
    if (payload?.toUserId) {
      socket.to(`user:${payload.toUserId}`).emit('call:ice', payload);
    }
  });

  socket.on('call:end', (payload) => {
    if (!payload?.conversationId) return;
    socket.to(payload.conversationId).emit('call:end', payload);
    if (payload?.toUserId) {
      socket.to(`user:${payload.toUserId}`).emit('call:end', payload);
    }
  });

  // When callee accepted from notification (no SDP), they signal readiness
  // so the caller can re-send the offer
  socket.on('call:ready', (payload) => {
    console.log('[Server] call:ready — from:', payload?.fromUserId, 'to:', payload?.toUserId, 'conversationId:', payload?.conversationId);
    if (!payload?.conversationId) return;
    socket.to(payload.conversationId).emit('call:ready', payload);
    if (payload?.toUserId) {
      socket.to(`user:${payload.toUserId}`).emit('call:ready', payload);
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'WeCare Server is running',
    timestamp: new Date().toISOString()
  });
});

// Landing page
app.get('/', (req, res) => {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>WeCare Server</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #FAFAFA;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      color: #2D2D3A;
    }

    /* Header gradient — same soothing pink/peach */
    .header {
      width: 100%;
      background: linear-gradient(135deg, #FFF0F2 0%, #FFF5F0 100%);
      border-bottom-left-radius: 40px;
      border-bottom-right-radius: 40px;
      padding: 60px 20px 50px;
      position: relative;
      overflow: hidden;
      text-align: center;
    }

    /* Decorative circles */
    .header::before {
      content: '';
      position: absolute;
      width: 140px; height: 140px;
      border-radius: 50%;
      background: rgba(226, 55, 68, 0.07);
      top: -20px; right: -30px;
    }
    .header::after {
      content: '';
      position: absolute;
      width: 80px; height: 80px;
      border-radius: 50%;
      background: rgba(226, 55, 68, 0.06);
      top: 60px; left: 30px;
    }

    .logo-circle {
      width: 80px; height: 80px;
      border-radius: 24px;
      background: linear-gradient(135deg, #E23744, #FF6B7A);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      box-shadow: 0 8px 24px rgba(226, 55, 68, 0.25);
    }
    .logo-circle span {
      font-size: 36px;
      font-weight: 900;
      color: #fff;
    }

    .header h1 {
      font-size: 28px;
      font-weight: 800;
      color: #2D2D3A;
    }
    .header p {
      font-size: 14px;
      color: #6B6B80;
      margin-top: 6px;
      font-weight: 500;
    }

    /* Status pill */
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-top: 18px;
      padding: 8px 20px;
      border-radius: 30px;
      background: #E8F5E9;
      border: 2px solid #C8E6C9;
    }
    .status-dot {
      width: 10px; height: 10px;
      border-radius: 50%;
      background: #4CAF50;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(1.3); }
    }
    .status-pill span {
      font-size: 14px;
      font-weight: 700;
      color: #4CAF50;
    }

    /* Main content */
    .content {
      width: 100%;
      max-width: 600px;
      padding: 30px 20px;
    }

    /* Stats grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 28px;
    }
    .stat-card {
      background: #fff;
      border-radius: 20px;
      padding: 18px 12px;
      text-align: center;
      border: 2px solid #F0EBF4;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    }
    .stat-icon {
      width: 42px; height: 42px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 10px;
      font-size: 20px;
    }
    .stat-value {
      font-size: 20px;
      font-weight: 800;
      color: #2D2D3A;
    }
    .stat-label {
      font-size: 11px;
      color: #6B6B80;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 3px;
    }

    /* Section title */
    .section-title {
      font-size: 18px;
      font-weight: 700;
      color: #2D2D3A;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* API endpoints list */
    .endpoints-card {
      background: #fff;
      border-radius: 24px;
      padding: 20px;
      border: 2px solid #F0EBF4;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
      margin-bottom: 24px;
    }
    .endpoint-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 0;
    }
    .endpoint-row + .endpoint-row {
      border-top: 1px solid #F0EBF4;
    }
    .endpoint-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 8px;
      min-width: 44px;
      text-align: center;
      color: #fff;
    }
    .badge-get { background: #5C9CE5; }
    .badge-post { background: #4CAF50; }
    .badge-api { background: #9575CD; }
    .endpoint-path {
      font-size: 14px;
      font-weight: 600;
      color: #2D2D3A;
      font-family: 'SFMono-Regular', Consolas, monospace;
    }
    .endpoint-desc {
      font-size: 12px;
      color: #9E9EB0;
      margin-left: auto;
      white-space: nowrap;
    }

    /* Support card */
    .support-card {
      background: #FFE8EA;
      border-radius: 20px;
      padding: 18px;
      display: flex;
      align-items: center;
      gap: 14px;
      border: 2px solid #FFD0D4;
      margin-bottom: 24px;
    }
    .support-icon {
      width: 48px; height: 48px;
      border-radius: 16px;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      flex-shrink: 0;
    }
    .support-title {
      font-size: 15px;
      font-weight: 700;
      color: #2D2D3A;
    }
    .support-subtitle {
      font-size: 12px;
      color: #6B6B80;
      margin-top: 2px;
    }

    /* Footer */
    .footer {
      text-align: center;
      padding: 20px;
      font-size: 13px;
      color: #9E9EB0;
      font-weight: 500;
    }
    .footer strong {
      color: #E23744;
      font-weight: 700;
    }
  </style>
</head>
<body>

  <div class="header">
    <div class="logo-circle"><span>W</span></div>
    <h1>WeCare Server</h1>
    <p>Backend API for WeCare Ecosystem</p>
    <div class="status-pill">
      <div class="status-dot"></div>
      <span>Running</span>
    </div>
  </div>

  <div class="content">

    <!-- Stats -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon" style="background: #FFF3E0;">⏱️</div>
        <div class="stat-value">${uptimeStr}</div>
        <div class="stat-label">Uptime</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background: #E8F5E9;">✅</div>
        <div class="stat-value">Active</div>
        <div class="stat-label">Status</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background: #E3F2FD;">🔌</div>
        <div class="stat-value">${process.env.PORT || 5000}</div>
        <div class="stat-label">Port</div>
      </div>
    </div>

    <!-- API Routes -->
    <div class="section-title">🔗 API Endpoints</div>
    <div class="endpoints-card">
      <div class="endpoint-row">
        <span class="endpoint-badge badge-api">API</span>
        <span class="endpoint-path">/api/auth</span>
        <span class="endpoint-desc">Authentication</span>
      </div>
      <div class="endpoint-row">
        <span class="endpoint-badge badge-api">API</span>
        <span class="endpoint-path">/api/bookings</span>
        <span class="endpoint-desc">Bookings</span>
      </div>
      <div class="endpoint-row">
        <span class="endpoint-badge badge-api">API</span>
        <span class="endpoint-path">/api/users</span>
        <span class="endpoint-desc">Users</span>
      </div>
      <div class="endpoint-row">
        <span class="endpoint-badge badge-api">API</span>
        <span class="endpoint-path">/api/providers</span>
        <span class="endpoint-desc">Providers</span>
      </div>
      <div class="endpoint-row">
        <span class="endpoint-badge badge-api">API</span>
        <span class="endpoint-path">/api/payments</span>
        <span class="endpoint-desc">Payments</span>
      </div>
      <div class="endpoint-row">
        <span class="endpoint-badge badge-api">API</span>
        <span class="endpoint-path">/api/reviews</span>
        <span class="endpoint-desc">Reviews</span>
      </div>
      <div class="endpoint-row">
        <span class="endpoint-badge badge-api">API</span>
        <span class="endpoint-path">/api/notifications</span>
        <span class="endpoint-desc">Push Notifications</span>
      </div>
      <div class="endpoint-row">
        <span class="endpoint-badge badge-api">API</span>
        <span class="endpoint-path">/api/admin</span>
        <span class="endpoint-desc">Admin Panel</span>
      </div>
      <div class="endpoint-row">
        <span class="endpoint-badge badge-api">API</span>
        <span class="endpoint-path">/api/cities</span>
        <span class="endpoint-desc">City Data</span>
      </div>
      <div class="endpoint-row">
        <span class="endpoint-badge badge-get">GET</span>
        <span class="endpoint-path">/health</span>
        <span class="endpoint-desc">Health Check</span>
      </div>
    </div>

    <!-- Info -->
    <div class="support-card">
      <div class="support-icon">🛡️</div>
      <div>
        <div class="support-title">Server is Healthy</div>
        <div class="support-subtitle">All systems operational · MongoDB connected</div>
      </div>
    </div>

  </div>

  <div class="footer">
    Powered by <strong>WeCare</strong> · ${new Date().getFullYear()}
  </div>

</body>
</html>`);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Route not found' 
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 WeCare Server running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV}`);
});
