// auth.js - Session and authentication management

const crypto = require('crypto');
const fs = require('fs');

// In-memory session store (for production, use Redis or a database)
const sessions = new Map();

// In-memory staff database (for production, use a real database)
// Format: { staffId: { password: hashedPassword, department: string, name: string } }
const staffDatabase = {
  'EMP001': {
    password: hashPassword('password123'), // Default: 'password123' - CHANGE IN PRODUCTION
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

// Hash password using SHA256 (for production, use bcrypt)
function hashPassword(password) {
  return crypto
    .createHash('sha256')
    .update(password)
    .digest('hex');
}

// Verify password
function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

// Generate session token
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Create guest session
function createGuestSession(roomNumber, guestName) {
  const sessionToken = generateSessionToken();
  const sessionData = {
    persona: 'guest',
    roomNumber,
    guestName,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    isActive: true
  };

  sessions.set(sessionToken, sessionData);

  // Clean up old sessions periodically
  cleanupExpiredSessions();

  return {
    sessionToken,
    persona: 'guest',
    roomNumber,
    guestName
  };
}

// Create staff session
function createStaffSession(staffId) {
  const sessionToken = generateSessionToken();
  const staffInfo = staffDatabase[staffId];

  const sessionData = {
    persona: 'staff',
    staffId,
    staffName: staffInfo.name,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 hours
    isActive: true
  };

  sessions.set(sessionToken, sessionData);

  // Clean up old sessions periodically
  cleanupExpiredSessions();

  return {
    sessionToken,
    persona: 'staff',
    staffId,
    staffName: staffInfo.name
  };
}

// Verify session
function verifySession(sessionToken) {
  if (!sessionToken) return null;

  const session = sessions.get(sessionToken);
  if (!session) return null;

  // Check if session is expired
  if (session.expiresAt && new Date() > session.expiresAt) {
    sessions.delete(sessionToken);
    return null;
  }

  // Check if session is active
  if (!session.isActive) {
    return null;
  }

  return session;
}

// Destroy session
function destroySession(sessionToken) {
  if (sessions.has(sessionToken)) {
    sessions.delete(sessionToken);
    return true;
  }
  return false;
}

// Verify staff credentials
function verifyStaffCredentials(staffId, password) {
  const staffInfo = staffDatabase[staffId];

  if (!staffInfo) {
    return { valid: false, error: 'Employee ID not found' };
  }

  if (!verifyPassword(password, staffInfo.password)) {
    return { valid: false, error: 'Invalid password' };
  }

  return { valid: true };
}

// Clean up expired sessions
function cleanupExpiredSessions() {
  const now = new Date();
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt && now > session.expiresAt) {
      sessions.delete(token);
    }
  }
}

// Add staff member (for admin purposes)
function addStaffMember(staffId, password, department, name) {
  if (staffDatabase[staffId]) {
    return { success: false, error: 'Staff ID already exists' };
  }

  staffDatabase[staffId] = {
    password: hashPassword(password),
    department,
    name
  };

  return { success: true, message: `Staff member ${name} added successfully` };
}

// Extend session expiry
function extendSession(sessionToken, extensionMinutes = 30) {
  const session = verifySession(sessionToken);
  if (!session) return false;

  session.expiresAt = new Date(Date.now() + extensionMinutes * 60 * 1000);
  return true;
}

// Get session info
function getSessionInfo(sessionToken) {
  return verifySession(sessionToken);
}

// Get all active sessions (for admin dashboard)
function getAllSessions() {
  const activeSessions = [];
  const now = new Date();

  for (const [token, session] of sessions.entries()) {
    if (session.isActive && session.expiresAt && now < session.expiresAt) {
      activeSessions.push({
        token: token.substring(0, 8) + '...', // Mask token
        persona: session.persona,
        roomNumber: session.roomNumber,
        guestName: session.guestName,
        staffId: session.staffId,
        department: session.department,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt
      });
    }
  }

  return activeSessions;
}

module.exports = {
  createGuestSession,
  createStaffSession,
  verifySession,
  destroySession,
  verifyStaffCredentials,
  extendSession,
  getSessionInfo,
  getAllSessions,
  addStaffMember,
  hashPassword
};
