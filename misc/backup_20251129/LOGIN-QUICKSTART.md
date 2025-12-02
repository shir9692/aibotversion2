# 🏨 AI Concierge - Login System Quick Start

## What's New?

Your AI Concierge now has a complete **login and authentication system** with:

✅ **Guest Login** - Users login with room number and name  
✅ **Staff Login** - Staff login with employee ID and password  
✅ **Session Management** - Secure, time-limited sessions  
✅ **Staff Dashboard** - Management interface for staff  
✅ **Protected APIs** - All endpoints require authentication  

---

## 🚀 Getting Started

### 1. Start the Server
```bash
npm start
```

Server runs on: `http://localhost:3000`

### 2. Access Login Page
Open your browser to: **`http://localhost:3000/login.html`**

---

## 📱 Login as Guest

1. Click on **"Guest"** (default selected)
2. Enter your **Room Number** (e.g., `209`)
3. Enter your **Last Name** (e.g., `Smith`)
4. Click **Continue**
5. You'll be directed to the AI Concierge main page

---

## 👨‍💼 Login as Staff

1. Click on **"Staff"** tab
2. Select your **Department**:
   - 🛎️ Front Desk
   - 🧹 Housekeeping
   - 🔧 Maintenance
   - 🍽️ Room Service
3. Enter **Employee ID**: `EMP001`
4. Enter **Password**: `password123`
5. Click **Continue**
6. You'll be directed to the **Staff Dashboard**

### Default Staff Accounts
| ID | Department | Password |
|----|----------|----------|
| EMP001 | Front Desk | password123 |
| EMP002 | Housekeeping | password456 |
| EMP003 | Maintenance | password789 |
| EMP004 | Room Service | passwordabc |

> ⚠️ **Change these passwords in `auth.js` before production!**

---

## 📁 New Files Created

```
✅ login.html              - Beautiful login interface
✅ staff-dashboard.html    - Staff management dashboard  
✅ auth.js                 - Authentication module
✅ LOGIN-SETUP.md          - Detailed setup documentation
```

## 📝 Modified Files

```
✏️ server.js    - Added auth endpoints
✏️ index.html   - Added session verification & logout
```

---

## 🔐 Key Features

### Session Security
- **Guest sessions**: Valid for 24 hours
- **Staff sessions**: Valid for 8 hours
- **Automatic expiration**: Sessions clean up automatically
- **Server-side validation**: All requests verified

### User Experience
- **Smooth redirects**: Auto-redirect based on user type
- **Logout button**: Easy logout from concierge/dashboard
- **User display**: Shows room/name or department/role
- **Form validation**: Client-side input validation

### Staff Dashboard
- 📊 Overview stats (active sessions, open tickets)
- 🎫 Ticket management interface
- 👥 View active guest sessions
- 📈 Activity logging

---

## 🛠️ API Endpoints

All endpoints except `/api/login` require a valid session token:

```javascript
// Header format:
Authorization: Bearer <sessionToken>
```

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/login` | Guest or staff login |
| POST | `/api/logout` | Logout session |
| POST | `/api/verify-session` | Check if session valid |
| POST | `/api/message` | Send message (requires auth) |
| GET | `/api/sessions` | View all active sessions |

---

## 📋 Session Flow Diagram

```
┌─────────────┐
│  login.html │
└──────┬──────┘
       │
       ├─► Guest Flow
       │   ├─ Enter room + name
       │   └─ → POST /api/login
       │      └─ → sessionToken stored
       │         └─ → Redirect to index.html
       │
       └─► Staff Flow
           ├─ Enter employee ID + password
           └─ → POST /api/login
              └─ → sessionToken stored
                 └─ → Redirect to staff-dashboard.html
```

---

## 🧪 Test the System

### Test 1: Guest Login
1. Go to `http://localhost:3000/login.html`
2. Select "Guest"
3. Room: `209`, Name: `Smith`
4. Click Continue
5. Should see concierge chat page with your info

### Test 2: Staff Login  
1. Go to `http://localhost:3000/login.html`
2. Select "Staff"
3. ID: `EMP001`, Password: `password123`
4. Click Continue
5. Should see staff dashboard

### Test 3: Logout
1. Click "Logout" button
2. Should redirect back to login page
3. Session token should be cleared from browser

### Test 4: Session Persistence
1. Login and refresh page
2. Should stay on same page (session valid)
3. Wait for session expiration time
4. Should be redirected to login

---

## ⚙️ Customization

### Change Default Passwords
Edit `auth.js` line ~16-31:
```javascript
const staffDatabase = {
  'EMP001': {
    password: hashPassword('YOUR_NEW_PASSWORD'),
    // ...
  }
};
```

### Add New Staff Member
Edit `auth.js` to add new entries to `staffDatabase`

### Modify Session Duration
Edit `auth.js`:
- Guest: Line ~139 (24 * 60 * 60 * 1000 = 24 hours)
- Staff: Line ~153 (8 * 60 * 60 * 1000 = 8 hours)

### Custom Departments
Edit `login.html` line ~268-288 to add more departments

---

## ❌ Troubleshooting

### "Cannot find module 'auth.js'"
✓ Make sure `auth.js` is in the same folder as `server.js`

### Login button not working
✓ Check browser console (F12) for errors  
✓ Verify server is running (check terminal)  
✓ Try a different room number

### Getting redirected to login repeatedly
✓ Check if session token is in localStorage
✓ Try clearing browser cache and cookies
✓ Restart the server

### "Unauthorized" error on chat
✓ Session has expired (need to login again)
✓ Session token was cleared

---

## 📚 Full Documentation

For detailed setup and configuration, see: **`LOGIN-SETUP.md`**

Topics covered:
- Complete API endpoint documentation
- Production security recommendations
- Advanced customization options
- Database integration guide
- JWT token implementation

---

## ✨ What's Next?

Consider adding:
- 🔑 Password reset functionality
- 📧 Email verification for guests
- 🛡️ Two-factor authentication for staff
- 📱 Mobile app support
- 🔄 Refresh token mechanism
- 📊 Admin dashboard for password/staff management
- 🚨 Rate limiting on login attempts
- 📋 Audit logging of all authentication events

---

## 🎉 You're Ready!

Your AI Concierge login system is now live! 

**Start here**: `http://localhost:3000/login.html`

Questions? See `LOGIN-SETUP.md` for detailed documentation.
