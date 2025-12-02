# AI Concierge - Authentication & Login Guide

## Overview

The AI Concierge now includes a complete authentication system with support for two user personas:
- **Guest Users**: Access the concierge chatbot using room number and name
- **Staff Users**: Access a staff management dashboard using employee credentials

---

## Features

### 🔐 Guest Login
- **Room Number**: 2-4 digit room identifier
- **Guest Name**: Last name or full name
- **Email** (Optional): For notifications and follow-up
- Automatic redirect to main concierge interface after login

### 👨‍💼 Staff Login
- **Department Selection**: Front Desk, Housekeeping, Maintenance, Room Service
- **Employee ID**: Unique staff identifier
- **Password**: Secure authentication
- Automatic redirect to staff dashboard after login

### 📊 Staff Dashboard
- Overview of active sessions and open tickets
- Quick statistics and metrics
- Recent activity log
- Ticket management interface

### 🛡️ Security Features
- Session-based authentication with 24-hour guest tokens and 8-hour staff tokens
- Automatic session expiration
- Server-side session validation
- Protected API endpoints requiring valid session tokens

---

## Installation & Setup

### 1. Dependencies
The authentication system uses the existing `express`, `cors`, and `body-parser` packages. No additional dependencies need to be installed.

### 2. File Structure
New files created:
```
├── login.html              # Login page for guests and staff
├── staff-dashboard.html    # Dashboard for staff members
├── auth.js                 # Authentication module
├── server.js               # Updated with auth endpoints
└── index.html              # Updated with session management
```

### 3. Starting the Server
```bash
npm start
```

The server will start on `http://localhost:3000`

---

## Usage

### For Guests

1. **Navigate to Login**: Open `http://localhost:3000/login.html`
2. **Select "Guest" Persona**: Click the Guest button (default)
3. **Enter Details**:
   - Room Number: e.g., "209"
   - Last Name: e.g., "Smith"
   - Email (optional)
4. **Click Continue**: You'll be redirected to the AI Concierge interface

### For Staff

1. **Navigate to Login**: Open `http://localhost:3000/login.html`
2. **Select "Staff" Persona**: Click the Staff button
3. **Select Department**: Choose from Front Desk, Housekeeping, Maintenance, or Room Service
4. **Enter Credentials**:
   - Employee ID: e.g., "EMP001"
   - Password: (see default credentials below)
5. **Click Continue**: You'll be redirected to the staff dashboard

### Default Staff Credentials

| Employee ID | Department      | Password    |
|-------------|-----------------|-------------|
| EMP001      | Front Desk      | password123 |
| EMP002      | Housekeeping    | password456 |
| EMP003      | Maintenance     | password789 |
| EMP004      | Room Service    | passwordabc |

**⚠️ IMPORTANT**: Change these passwords in production! Edit `auth.js` to modify default credentials.

---

## API Endpoints

### Login
```
POST /api/login
Content-Type: application/json

Guest Login:
{
  "persona": "guest",
  "roomNumber": "209",
  "guestName": "Smith",
  "guestEmail": "guest@example.com"
}

Staff Login:
{
  "persona": "staff",
  "staffId": "EMP001",
  "password": "password123",
  "department": "front-desk"
}

Response:
{
  "sessionToken": "...",
  "persona": "guest|staff",
  "roomNumber": "209",
  "guestName": "Smith"
}
```

### Verify Session
```
POST /api/verify-session
Authorization: Bearer <sessionToken>

Response:
{
  "valid": true,
  "session": { ... }
}
```

### Logout
```
POST /api/logout
Authorization: Bearer <sessionToken>

Response:
{
  "success": true,
  "message": "Logged out successfully"
}
```

### Protected Message Endpoint
```
POST /api/message
Authorization: Bearer <sessionToken>
Content-Type: application/json

{
  "message": "Hello",
  "sessionId": "session-123",
  ...
}

Response: Requires valid session token or returns 401 Unauthorized
```

---

## Session Management

### Session Storage
- **Client-side**: Session token stored in `localStorage`
  - `sessionToken`: Authentication token
  - `userPersona`: "guest" or "staff"
  - `userInfo`: JSON encoded user details

- **Server-side**: In-memory session store (auth.js)
  - Guest sessions: 24-hour expiration
  - Staff sessions: 8-hour expiration
  - Automatic cleanup of expired sessions

### Session Verification
Sessions are automatically verified:
1. On page load (redirect to login if invalid)
2. Before each API request (401 if expired)
3. Automatic re-authentication on session expiration

---

## Customization

### Changing Default Staff Passwords
Edit `auth.js`:
```javascript
const staffDatabase = {
  'EMP001': {
    password: hashPassword('YOUR_NEW_PASSWORD'),
    department: 'front-desk',
    name: 'John Smith'
  },
  // ... other staff
};
```

### Adding New Staff Members
Use the provided `addStaffMember()` function in `auth.js`:
```javascript
auth.addStaffMember('EMP005', 'newpassword', 'front-desk', 'Jane Doe');
```

### Modifying Session Expiration
In `auth.js`:
```javascript
// Guest sessions (currently 24 hours)
expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)

// Staff sessions (currently 8 hours)
expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000)
```

### Customizing Login Page
- Edit `login.html` CSS for colors and styling
- Modify form validation in the JavaScript section
- Add/remove departments in the staff login section

---

## Production Considerations

### ⚠️ Security Recommendations

1. **Password Hashing**: Currently uses SHA256. For production, implement bcrypt:
   ```javascript
   const bcrypt = require('bcrypt');
   // Use bcrypt.hash() and bcrypt.compare()
   ```

2. **Session Storage**: Move from in-memory to Redis or database:
   ```javascript
   const redis = require('redis');
   // Store sessions in Redis for persistence
   ```

3. **SSL/HTTPS**: Deploy with HTTPS in production

4. **CORS**: Update CORS settings for your domain:
   ```javascript
   app.use(cors({ origin: 'https://yourdomain.com' }));
   ```

5. **Rate Limiting**: Add login attempt rate limiting:
   ```javascript
   const rateLimit = require('express-rate-limit');
   ```

6. **Database Integration**: Replace in-memory staff database with real database:
   - Use MongoDB, PostgreSQL, or similar
   - Implement proper schema and queries

7. **Token Security**: Use JWT tokens instead of random hex strings

8. **Password Reset**: Implement forgot password functionality

---

## Troubleshooting

### Login Button Not Working
- Check browser console for errors (F12)
- Verify server is running on port 3000
- Clear browser cache and localStorage

### "Unauthorized" Error After Login
- Session may have expired
- Browser localStorage may have been cleared
- Server may have restarted (in-memory sessions lost)

### Staff Dashboard Not Loading
- Verify logged in as staff (not guest)
- Check session token in localStorage
- Verify `staff-dashboard.html` exists in project folder

### Can't Login with Provided Credentials
- Double-check employee ID format (e.g., "EMP001")
- Verify password is correct (default is "password123" for EMP001)
- Check that staff account exists in auth.js

---

## Testing

### Test Flow
1. Open `http://localhost:3000/login.html`
2. Test guest login with room "209" and name "Smith"
3. Verify redirect to main concierge page
4. Test logout button
5. Test staff login with "EMP001" and "password123"
6. Verify redirect to staff dashboard
7. Test session persistence by refreshing page
8. Test session expiration (wait 24 hours for guest, 8 hours for staff)

---

## File Changes Summary

### New Files
- `login.html` - Complete login interface
- `staff-dashboard.html` - Staff management interface
- `auth.js` - Authentication module

### Modified Files
- `server.js` - Added auth endpoints and middleware
- `index.html` - Added session verification and logout

### Unchanged
- All other functionality remains the same
- Existing API endpoints work as before (now require authentication)

---

## Next Steps

1. ✅ Replace in-memory session storage with Redis
2. ✅ Implement proper database for staff credentials
3. ✅ Add JWT token support
4. ✅ Implement password reset functionality
5. ✅ Add two-factor authentication for staff
6. ✅ Create admin panel for staff management
7. ✅ Add audit logging for security events

---

## Support

For issues or questions:
1. Check the browser console (F12) for error messages
2. Check server logs in terminal
3. Verify all files are in the correct locations
4. Ensure node dependencies are installed (`npm install`)

Happy hosting! 🏨
