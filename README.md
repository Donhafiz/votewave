# VoteWave - Secure E-Voting Platform

A full-stack, production-ready e-voting platform that handles school elections, event polls, club elections, organizational votes, and more. Built with security, transparency, and AI-powered insights.

## Features

### Core Features
- **Secure Voting** - End-to-end encryption with hashed vote storage
- **Multi-Election Support** - School, club, organization, and event elections
- **Email Verification** - OTP-based verification for secure registration
- **Real-time Results** - Live vote counting with animated charts
- **Audit Trail** - Complete logging of all voting activities

### AI-Powered Features
- **AI Assistant** - Chatbot for voter questions and support
- **Smart Insights** - AI-generated election analysis and momentum tracking
- **Anomaly Detection** - Automatic fraud detection and alerts
- **Auto-Generated Reports** - Post-election summary reports

### Admin Features
- **Dashboard** - Visual analytics and statistics
- **Election Management** - Create, edit, and manage elections
- **Candidate Management** - Add candidates with photos and bios
- **User Management** - Role-based access control
- **Export Results** - CSV/PDF export of election results

## Tech Stack

### Frontend
- Vanilla HTML, CSS, JavaScript
- GSAP for animations
- Chart.js for data visualization
- Socket.io client for real-time updates
- Lucide icons

### Backend
- Node.js with Express.js
- MongoDB with Mongoose
- JWT authentication with refresh tokens
- Helmet.js for security headers
- Rate limiting protection

### AI Integration
- Claude API for intelligent assistant and insights

## Quick Start

### Prerequisites
- Node.js (v16+)
- MongoDB
- npm or yarn

### Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/votewave.git
cd votewave
```

2. Install dependencies
```bash
npm install
```

3. Configure environment variables
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start the development server
```bash
npm run dev
```

5. Open the application in your browser
```
# Application runs at http://localhost:5000
# The backend serves the frontend static files directly
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `MONGODB_URI` | MongoDB connection string | Yes |
| `JWT_SECRET` | Secret key for JWT signing | Yes |
| `JWT_REFRESH_SECRET` | Secret key for refresh tokens | Yes |
| `EMAIL_USER` | Gmail address for notifications | Yes |
| `EMAIL_PASS` | Gmail app password | Yes |
| `CLAUDE_API_KEY` | API key for AI features | No |
| `CLOUDINARY_*` | For image uploads | No |

## Project Structure

```
votewave/
├── backend/
│   ├── config/          # Database and service configs
│   ├── controllers/     # Route handlers
│   ├── middleware/      # Auth, validation, rate limiting
│   ├── models/          # Mongoose schemas
│   ├── routes/          # API endpoints
│   ├── services/        # AI, email, socket services
│   └── server.js        # Entry point
├── frontend/
│   ├── auth/           # Login, register, OTP pages
│   ├── voter/          # Election browsing and voting
│   ├── admin/          # Admin dashboard
│   ├── profile/        # User profile
│   ├── css/            # Stylesheets
│   └── js/             # JavaScript files
└── .env                # Environment variables
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/verify-otp` - Verify email with OTP
- `POST /api/auth/resend-otp` - Resend OTP
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh-token` - Refresh access token
- `POST /api/auth/forgot-password` - Request password reset

### Elections
- `GET /api/elections` - List all elections
- `GET /api/elections/:id` - Get election details
- `POST /api/elections` - Create election (Admin)
- `PUT /api/elections/:id` - Update election (Admin)
- `DELETE /api/elections/:id` - Delete election (Admin)

### Voting
- `POST /api/elections/:id/votes` - Cast vote
- `GET /api/elections/:id/votes/status` - Check vote status

### Users
- `GET /api/users/profile` - Get profile
- `PUT /api/users/profile` - Update profile
- `POST /api/users/avatar` - Upload avatar
- `PUT /api/users/password` - Change password

### Admin
- `GET /api/admin/dashboard` - Dashboard stats
- `GET /api/admin/users` - List users
- `PUT /api/admin/users/:id/role` - Update user role
- `GET /api/admin/audit-logs` - View audit logs

### AI
- `POST /api/ai/chat` - Chat with AI assistant
- `GET /api/ai/elections/:id/summary` - Generate election summary
- `GET /api/ai/elections/:id/insights` - Get AI insights

## Security Features

- **Password Hashing** - bcrypt with salt
- **JWT Tokens** - Short-lived access tokens with refresh tokens
- **Rate Limiting** - Protection against brute force
- **Input Validation** - Express-validator on all endpoints
- **Helmet.js** - Security headers
- **CORS** - Configured for frontend origin
- **Audit Logging** - Every action logged with IP and timestamp

## Deployment

### Backend (Render/Railway/Heroku)
1. Set environment variables in hosting platform
2. Connect MongoDB Atlas
3. Deploy with `npm start`

### Frontend (Vercel/Netlify)
1. Deploy static files from `frontend/` directory
2. Set API URL environment variable
3. Configure redirects for SPA routing

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License - see LICENSE file for details

## Support

For support, email support@votewave.com or create an issue on GitHub.

---

Built with by the VoteWave Team
