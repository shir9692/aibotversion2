# Login System - Testing & Examples

## 📝 Test Cases

### Test Case 1: Guest Login Success ✅

**Steps:**
1. Navigate to `http://localhost:3000/login.html`
2. Select "Guest" tab (default)
3. Enter Room Number: `209`
4. Enter Last Name: `Smith`
5. Optional: Enter Email: `smith@example.com`
6. Click "Continue"

**Expected Result:**
- Page redirects to `http://localhost:3000/index.html`
- User info shows: "Smith | Room 209"
- Avatar shows: 👤
- Can send messages to concierge
- Session token saved in localStorage

**Data Saved in Browser:**
```javascript
localStorage.sessionToken = "a1b2c3d4e5f6..."
localStorage.userPersona = "guest"
localStorage.userInfo = '{"roomNumber":"209","guestName":"Smith","guestEmail":"smith@example.com"}'
```

---

### Test Case 2: Guest Login - Missing Fields ❌

**Steps:**
1. Navigate to login page
2. Leave Room Number empty
3. Click "Continue"

**Expected Result:**
- Red error message: "Please enter a valid room number (2-4 digits)."
- Form does not submit
- Stays on login page

---

### Test Case 3: Guest Login - Invalid Room Number ❌

**Steps:**
1. Navigate to login page
2. Enter Room Number: `12345` (too many digits)
3. Click "Continue"

**Expected Result:**
- Red error message about valid room number
- Form does not submit

---

### Test Case 4: Staff Login Success ✅

**Steps:**
1. Navigate to `http://localhost:3000/login.html`
2. Select "Staff" tab
3. Select Department: "Front Desk"
4. Enter Employee ID: `EMP001`
5. Enter Password: `password123`
6. Click "Continue"

**Expected Result:**
- Page redirects to `http://localhost:3000/staff-dashboard.html`
- User info shows: "🛎️ Front Desk"
- Can see dashboard overview
- Session valid for 8 hours

**Data Saved:**
```javascript
localStorage.sessionToken = "x9y8z7w6v5u4..."
localStorage.userPersona = "staff"
localStorage.userInfo = '{"staffId":"EMP001","department":"front-desk"}'
```

---

### Test Case 5: Staff Login - Wrong Password ❌

**Steps:**
1. Select "Staff" tab
2. Enter Employee ID: `EMP001`
3. Enter Password: `wrongpassword`
4. Click "Continue"

**Expected Result:**
- Red error message: "Invalid credentials. Please try again."
- No redirect
- Stays on login page

---

### Test Case 6: Staff Login - Invalid Employee ID ❌

**Steps:**
1. Select "Staff" tab
2. Enter Employee ID: `INVALID`
3. Enter Password: `password123`
4. Click "Continue"

**Expected Result:**
- Red error message: "Employee ID not found"
- No redirect

---

### Test Case 7: Logout - Guest ✅

**Steps:**
1. Login as guest
2. Click "Logout" button (top right)
3. Confirm redirect

**Expected Result:**
- Redirected to login page
- localStorage cleared (sessionToken removed)
- Fresh login page (no user info retained)

---

### Test Case 8: Logout - Staff ✅

**Steps:**
1. Login as staff
2. Click "Logout" button
3. Confirm redirect

**Expected Result:**
- Redirected to login page
- localStorage cleared
- Server session destroyed

---

### Test Case 9: Session Persistence - Guest ✅

**Steps:**
1. Login as guest (Room: 209, Name: Smith)
2. Go to concierge page
3. Refresh the page (F5)
4. Verify still logged in

**Expected Result:**
- Page doesn't redirect to login
- User info still visible
- Can continue using concierge
- Session validated with server

---

### Test Case 10: Session Expiration - Guest ⏰

**Steps:**
1. Login as guest
2. Set a time jump or wait 24 hours in production
3. Try to send a message

**Expected Result:**
- After 24 hours: Redirected to login page
- 401 error: "Unauthorized - Invalid or expired session"
- New login required

---

## 🔄 API Testing Examples

### Example 1: Login API

**Request:**
```bash
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "persona": "guest",
    "roomNumber": "209",
    "guestName": "Smith",
    "guestEmail": "smith@example.com"
  }'
```

**Response (Success):**
```json
{
  "sessionToken": "a1b2c3d4e5f6g7h8i9j0...",
  "persona": "guest",
  "roomNumber": "209",
  "guestName": "Smith"
}
```

**Response (Error):**
```json
{
  "error": "Room number and name are required"
}
```

---

### Example 2: Verify Session API

**Request:**
```bash
curl -X POST http://localhost:3000/api/verify-session \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer a1b2c3d4e5f6g7h8i9j0..." \
  -d '{}'
```

**Response (Valid):**
```json
{
  "valid": true,
  "session": {
    "persona": "guest",
    "roomNumber": "209",
    "guestName": "Smith",
    "createdAt": "2025-11-24T10:30:00.000Z",
    "expiresAt": "2025-11-25T10:30:00.000Z",
    "isActive": true
  }
}
```

**Response (Invalid):**
```json
{
  "valid": false,
  "error": "Invalid or expired session"
}
```

---

### Example 3: Send Message (with Authentication)

**Request:**
```bash
curl -X POST http://localhost:3000/api/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer a1b2c3d4e5f6g7h8i9j0..." \
  -d '{
    "message": "What restaurants are nearby?",
    "sessionId": "session-123456",
    "consentLocation": false,
    "conversationHistory": []
  }'
```

**Response (Valid Session):**
```json
{
  "reply": "Here are some nearby restaurants...",
  "intent": "local_attractions",
  "suggestions": [...]
}
```

**Response (Invalid Session):**
```json
{
  "error": "Unauthorized - Invalid or expired session"
}
```

---

### Example 4: Logout API

**Request:**
```bash
curl -X POST http://localhost:3000/api/logout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer a1b2c3d4e5f6g7h8i9j0..." \
  -d '{}'
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## 📊 Data Examples

### Guest Session Data (Server-side)
```javascript
{
  persona: "guest",
  roomNumber: "209",
  guestName: "Smith",
  guestEmail: "smith@example.com",
  createdAt: Date(2025-11-24T10:30:00),
  expiresAt: Date(2025-11-25T10:30:00),
  isActive: true
}
```

### Staff Session Data (Server-side)
```javascript
{
  persona: "staff",
  staffId: "EMP001",
  department: "front-desk",
  staffName: "John Smith",
  createdAt: Date(2025-11-24T10:30:00),
  expiresAt: Date(2025-11-24T18:30:00),  // 8 hours
  isActive: true
}
```

---

## 🔑 Staff Member Database

Currently in `auth.js`:

```javascript
const staffDatabase = {
  'EMP001': {
    password: hashPassword('password123'),
    department: 'front-desk',
    name: 'John Smith'
  },
  'EMP002': {
    password: hashPassword('password456'),
    department: 'housekeeping',
    name: 'Maria Garcia'
  },
  'EMP003': {
    password: hashPassword('password789'),
    department: 'maintenance',
    name: 'Bob Johnson'
  },
  'EMP004': {
    password: hashPassword('passwordabc'),
    department: 'room-service',
    name: 'Sarah Chen'
  }
};
```

---

## 🧪 Browser Console Tests

Open browser DevTools (F12) and run these tests:

### Test 1: Check localStorage
```javascript
console.log(localStorage.getItem('sessionToken'));
console.log(localStorage.getItem('userPersona'));
console.log(JSON.parse(localStorage.getItem('userInfo')));
```

### Test 2: Verify Session with API
```javascript
fetch('http://localhost:3000/api/verify-session', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + localStorage.getItem('sessionToken')
  }
})
.then(r => r.json())
.then(data => console.log(data));
```

### Test 3: Send Test Message
```javascript
fetch('http://localhost:3000/api/message', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + localStorage.getItem('sessionToken')
  },
  body: JSON.stringify({
    message: 'Hello',
    sessionId: 'test-123',
    conversationHistory: []
  })
})
.then(r => r.json())
.then(data => console.log(data));
```

### Test 4: Check Active Sessions (Staff only)
```javascript
fetch('http://localhost:3000/api/sessions', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('sessionToken')
  }
})
.then(r => r.json())
.then(data => console.log(data));
```

---

## ✅ Checklist for Full Testing

- [ ] Guest login works
- [ ] Guest sees room info after login
- [ ] Guest can send messages
- [ ] Guest logout works
- [ ] Staff login works with valid credentials
- [ ] Staff login fails with invalid password
- [ ] Staff dashboard loads
- [ ] Staff logout works
- [ ] Session persists on page refresh
- [ ] Invalid session redirects to login
- [ ] Error messages display correctly
- [ ] Form validation works
- [ ] Logout clears all session data
- [ ] Different staff departments work
- [ ] User info displays correctly in UI

---

## 🐛 Debugging Tips

### Enable Debug Mode
In browser console:
```javascript
// Turn on detailed logging
localStorage.setItem('debugMode', 'true');
```

### Check Network Requests
1. Open DevTools (F12)
2. Go to "Network" tab
3. Try login
4. See all API requests and responses

### Monitor localStorage
1. DevTools → Application
2. Look under "Local Storage"
3. See stored session data

### Check Server Logs
Monitor terminal where server is running:
```bash
[nodemon] restarting due to changes...
API /api/message error: ...
POST /api/login - 201
```

---

## 🎓 Learning Path

1. **Basic**: Guest login and logout
2. **Intermediate**: Staff login and dashboard
3. **Advanced**: Test API endpoints with curl/Postman
4. **Expert**: Modify auth.js to customize behavior

Enjoy! 🎉
