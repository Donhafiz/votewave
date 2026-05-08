# VoteWave Admin Setup Guide

## Default Admin Credentials

### Option 1: Create Admin via API
Use these credentials to create your first admin user through the backend API:

```bash
# Register an admin user (you must be logged in as superadmin or use backend console)
POST /api/admin/users
{
  "firstName": "Admin",
  "lastName": "User",
  "email": "admin@votewave.com",
  "password": "Admin123!",
  "role": "admin"
}
```

### Option 2: Direct Database Insert
Connect to your MongoDB Atlas database and run:

```javascript
db.users.insertOne({
  firstName: "Admin",
  lastName: "User",
  email: "admin@votewave.com",
  password: "$2a$10$YourHashedPasswordHere", // bcrypt hash of "Admin123!"
  role: "admin",
  isEmailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date()
})
```

### Option 3: Environment Variable Auto-Create
Add to your `.env` file:
```env
# Admin auto-create on startup
ADMIN_EMAIL=admin@votewave.com
ADMIN_PASSWORD=Admin123!
ADMIN_FIRST_NAME=Admin
ADMIN_LAST_NAME=User
```

## Recommended Admin Credentials (For Testing)

**Email:** `admin@votewave.com`
**Password:** `Admin123!`
**Role:** `admin`

## Super Admin Credentials (For Full Access)

**Email:** `superadmin@votewave.com`
**Password:** `SuperAdmin123!`
**Role:** `superadmin`

## Accessing Admin Dashboard

1. Go to: `http://localhost:5000/auth/login.html`
2. Login with admin credentials
3. Navigate to: `http://localhost:5000/admin/dashboard.html`

## Admin Features

### Dashboard
- View total users, elections, active elections, and votes
- User growth charts
- Election activity analytics
- Recent activity feed

### Elections Management
- Create new elections
- Edit existing elections
- Delete elections
- Manage candidates
- View election results

### User Management
- View all registered users
- Change user roles (voter/admin)
- Monitor user activity

### Audit Logs
- View all system actions
- Track votes, logins, and changes
- Filter by action type
- Export logs

## Security Notes

⚠️ **IMPORTANT:**
1. Change default passwords immediately after first login
2. Use strong passwords (min 8 chars, uppercase, lowercase, numbers)
3. Enable 2FA if available
4. Regularly review audit logs
5. Never share admin credentials

## Troubleshooting

### Can't Access Admin Pages
- Verify you're logged in
- Check user role is "admin" or "superadmin"
- Clear browser cache and cookies

### Database Connection Issues
- Verify MongoDB URI in `.env`
- Check IP whitelist in MongoDB Atlas
- Ensure database is not in read-only mode

## Support

For admin support, contact: support@votewave.com
