# VoteWave API Documentation

## Overview
VoteWave is a comprehensive voting platform API with real-time streaming, AI analytics, and fraud detection capabilities.

## Base URL
```
http://localhost:5000/api
```

## Authentication
All endpoints (except health and root) require JWT authentication.

### Endpoints

#### 🔐 Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `POST /auth/logout` - User logout
- `GET /auth/me` - Get current user profile

#### 🗳 Elections
- `GET /elections` - List all elections
- `POST /elections` - Create new election
- `GET /elections/:id` - Get election details
- `PUT /elections/:id` - Update election
- `DELETE /elections/:id` - Delete election
- `POST /elections/:id/activate` - Activate election
- `POST /elections/:id/close` - Close election

#### 👥 Candidates
- `GET /elections/:electionId/candidates` - List candidates
- `POST /elections/:electionId/candidates` - Add candidate
- `PUT /elections/:electionId/candidates/:id` - Update candidate
- `DELETE /elections/:electionId/candidates/:id` - Remove candidate

#### 🗳️ Voting
- `POST /elections/:electionId/votes` - Cast vote
- `GET /elections/:electionId/votes` - Get vote results
- `GET /elections/:electionId/votes/stats` - Get voting statistics

#### 👥 Users
- `GET /users` - Get user list (admin)
- `GET /users/:id` - Get user details
- `PUT /users/:id` - Update user
- `DELETE /users/:id` - Delete user

#### 🛡️ Admin
- `GET /admin/dashboard` - Admin dashboard stats
- `GET /admin/users` - User management
- `GET /admin/users/:id` - User details
- `PUT /admin/users/:id` - Update user
- `PUT /admin/users/:id/role` - Update user role
- `POST /admin/users/:id/ban` - Ban user
- `POST /admin/users/:id/unban` - Unban user
- `DELETE /admin/users/:id` - Delete user
- `GET /admin/audit-logs` - System audit logs
- `GET /admin/settings` - System settings
- `PUT /admin/settings` - Update system settings
- `GET /admin/export/:electionId/:format?` - Export results
- `POST /admin/elections/:electionId/activate` - Activate election
- `POST /admin/elections/:electionId/close` - Close election
- `POST /admin/elections/:electionId/assign-admin` - Assign admin
- `DELETE /admin/elections/:electionId/admins/:userId` - Remove admin
- `GET /admin/elections/:electionId/monitoring` - Election monitoring

#### 🤖 AI & Analytics
- `GET /ai/predict/:electionId` - Get AI predictions
- `GET /ai/analyze/:electionId` - Get election analysis
- `POST /ai/fraud-detect` - Detect voting fraud
- `GET /ai/trends/:electionId` - Get voting trends

#### 💳 Payments
- `POST /payment/process` - Process payment
- `GET /payment/history/:userId` - Payment history
- `POST /payment/refund` - Process refund

#### 📊 Dashboard
- `GET /dashboard/:tenantId/:electionId/live` - Live dashboard data
- `GET /dashboard/stats/:tenantId/:electionId` - Dashboard statistics

#### 🔧 System
- `GET /health` - System health check
- `GET /` - API information and endpoints

## Request/Response Format

### Authentication Header
```json
{
  "Authorization": "Bearer <JWT_TOKEN>"
}
```

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully"
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description",
  "error": "ERROR_CODE"
}
```

## Rate Limiting
- **Window**: 15 minutes
- **Max Requests**: 100 per window
- **Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## Real-time Features

### Socket.IO Events
- `tenant:join` - Join tenant room
- `election:join` - Join election room
- `joinAdmin` - Join admin room
- `dashboard:update` - Real-time dashboard updates
- `vote:cast` - New vote notification
- `election:status` - Election status changes

### ERIE v8 Streaming
The system includes a high-performance streaming layer with:
- **4 Consumer Shards** for parallel processing
- **Redis-based Caching** for real-time data
- **Fraud Detection** with AI-powered analysis
- **ML Predictions** for election outcomes

## Security Features

### JWT Authentication
- **Token Expiry**: 7 days
- **Secret Rotation**: Configurable
- **Refresh Tokens**: Supported

### Input Validation
- **Email Format**: RFC 5322 compliant
- **Password Strength**: Minimum 8 characters
- **SQL Injection**: Protected with sanitization
- **XSS Protection**: Input encoding

### Rate Limiting
- **Per IP**: 100 requests per 15 minutes
- **Per User**: 50 requests per 15 minutes
- **Burst Protection**: Automatic throttling

## Error Codes

| Code | Description |
|-------|-------------|
| AUTH_001 | Invalid credentials |
| AUTH_002 | Token expired |
| AUTH_003 | Invalid token |
| ELEC_001 | Election not found |
| ELEC_002 | Election already active |
| VOTE_001 | Already voted |
| VOTE_002 | Election not active |
| USER_001 | User not found |
| USER_002 | User banned |
| RATE_001 | Rate limit exceeded |
| SYS_001 | System error |

## Testing

### Running Tests
```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Watch tests during development
npm run test:watch
```

### Test Coverage
The test suite covers:
- Authentication endpoints
- Election management
- Voting functionality
- Admin operations
- API security
- Performance benchmarks
- Error handling

## Development Setup

### Environment Variables
```env
MONGODB_URI=mongodb://localhost:27017/votewave
REDIS_URL=redis://localhost:6379
PORT=5000
NODE_ENV=development
JWT_SECRET=your-secret-key
```

### Dependencies
```bash
npm install
npm run dev
```

## Production Deployment

### Environment Setup
```env
NODE_ENV=production
MONGODB_URI=mongodb://your-production-db
REDIS_URL=redis://your-production-redis
JWT_SECRET=your-production-secret
```

### Health Checks
- Database connectivity monitoring
- Redis connection monitoring
- Service availability checks
- Performance metrics collection

## Support

### Contact
- **API Issues**: Check `/api/health` endpoint
- **Documentation**: This file
- **Examples**: Test suite in `/test` directory

### Troubleshooting
1. **Connection Issues**: Verify MongoDB and Redis are running
2. **Authentication**: Check JWT token format and expiry
3. **Rate Limiting**: Verify headers for remaining requests
4. **Performance**: Monitor response times and database queries

---

*Last Updated: May 11, 2026*
*Version: 1.0.0*
