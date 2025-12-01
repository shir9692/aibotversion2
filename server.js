// server.js
// AI Concierge prototype backend (enhanced QnA fuzzy-matching + POI lookups via Nominatim/Overpass)
// Drop into your project folder (next to qna.json and fallback_places.json), run npm install, then npm start.

const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const cors = require('cors');
const fs = require('fs');
const Fuse = require('fuse.js');
const auth = require('./auth');

// (No DB connection here in this original server file)

const qna = JSON.parse(fs.readFileSync('./qna.json', 'utf8'));
const FALLBACK_PLACES = JSON.parse(fs.readFileSync('./fallback_places.json', 'utf8'));

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));  // Serve static files (index.html, etc.)

// (Tickets router not required here)

const PORT = process.env.PORT || 3000;

// Simple in-memory session tracking for single-active-request enforcement
const activeRequests = new Map();

// --- Authentication middleware ---
function requireAuth(req, res, next) {
  const sessionToken = req.headers.authorization?.replace('Bearer ', '') || req.body.sessionToken;
  const session = auth.verifySession(sessionToken);

  if (!session) {
    return res.status(401).json({ error: 'Unauthorized - Invalid or expired session' });
  }

  req.session = session;
  req.sessionToken = sessionToken;
  next();
}

// --- fuzzy QnA (Fuse.js) setup with improved matching and debug logging ---
const fuseOptions = {
  keys: ['question'],
  includeScore: true,
  threshold: 0.5,        // start permissive; tune lower for stricter
  ignoreLocation: true,
  useExtendedSearch: false
};
const fuse = new Fuse(qna, fuseOptions);

// utility: normalize text (lowercase, remove punctuation, collapse spaces)
function normalizeText(s) {
  return (s || '').toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Build a simple token set from a string
function tokensSet(s) {
  const n = normalizeText(s);
  if (!n) return new Set();
  return new Set(n.split(' ').filter(Boolean));
}

// Improved QnA lookup:
// 1) quick token-overlap scoring against each qna question (good for short phrases)
// 2) if a strong token overlap is found, return it
// 3) otherwise run Fuse search and return best if score <= fuseThreshold
function answerFromQnA(text) {
  if (!text || !text.trim()) return null;
  const userNorm = normalizeText(text);

  // QUICK TOKEN OVERLAP MATCH (very fast)
  const userTokens = tokensSet(userNorm);

  // Candidate scoring — compute overlap ratio for each QnA question
  let bestTokenMatch = { score: 0, item: null };
  for (const item of qna) {
    const qTokens = tokensSet(item.question);
    if (qTokens.size === 0) continue;

    // count intersection
    let common = 0;
    for (const t of userTokens) if (qTokens.has(t)) common++;

    // compute overlap ratio relative to question tokens and to user tokens
    const ratioQ = common / qTokens.size;
    const ratioUser = userTokens.size ? (common / userTokens.size) : 0;
    // weighted score: favor matching more of the question tokens
    const score = Math.max(ratioQ, ratioUser);

    if (score > bestTokenMatch.score) {
      bestTokenMatch = { score, item };
    }
  }

  // If token overlap is strong, accept it immediately (adjust threshold as needed)
  const TOKEN_MATCH_THRESHOLD = 0.5; // 50% of tokens matching -> accept
  if (bestTokenMatch.item && bestTokenMatch.score >= TOKEN_MATCH_THRESHOLD) {
    if (process.env.QNA_DEBUG) console.log('[QNA DEBUG] token match:', bestTokenMatch.score, bestTokenMatch.item.question);
    return bestTokenMatch.item.answer;
  }

  // FALLBACK: Fuse fuzzy search
  const fuseResults = fuse.search(userNorm);

  if (process.env.QNA_DEBUG) {
    console.log('[QNA DEBUG] user text:', text);
    console.log('[QNA DEBUG] fuse results (top 5):', (fuseResults || []).slice(0,5).map(r => ({ q: r.item.question, score: r.score })));
  }

  if (!fuseResults || fuseResults.length === 0) return null;

  const best = fuseResults[0];
  // acceptance threshold for Fuse: lower is better (0 = exact)
  const FUSE_ACCEPT_THRESHOLD = 0.55; // tune this: lower -> stricter matches
  if (typeof best.score === 'number' && best.score <= FUSE_ACCEPT_THRESHOLD) {
    if (process.env.QNA_DEBUG) console.log('[QNA DEBUG] accepted fuse match:', best.item.question, 'score=', best.score);
    return best.item.answer;
  }

  // If nothing acceptable, return null (fallback path will ask clarification)
  if (process.env.QNA_DEBUG) console.log('[QNA DEBUG] no suitable QnA match (best score=', best.score, ')');
  return null;
}

// --- Helper: fetch with retry, timeout, backoff ---
async function fetchWithRetry(url, options = {}, retries = 2, backoff = 600) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || 4000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          // Ensure we always send a User-Agent and a contact email per OSM policy
          'User-Agent': options.headers && options.headers['User-Agent'] ? options.headers['User-Agent'] : 'ai-concierge-mvp/0.1 (mailto:you@example.com)',
          ...(options.headers || {})
        }
      });
      clearTimeout(timeout);

      if (res.status === 429) {
        // Rate limited; honor Retry-After if provided
        const ra = res.headers.get('retry-after');
        const wait = ra ? parseInt(ra, 10) * 1000 : backoff * (attempt + 1);
        await new Promise(r => setTimeout(r, wait));
        continue; // retry
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      return res;
    } catch (err) {
      clearTimeout(timeout);
      const isLast = attempt === retries;
      if (isLast) throw err;
      // exponential-ish backoff
      await new Promise(r => setTimeout(r, backoff * (attempt + 1)));
    }
  }
  // should not reach here
  throw new Error('Unreachable fetchWithRetry exit');
}

// Extract city from message, but ignore tokens like "me" or "here"
function extractCityFromMessage(message) {
  // Accept "near <City>", "near <City, State>" (letters, spaces, commas)
  const match = message.match(/near\s+([a-zA-Z\s,]+)/i);
  if (!match) return null;
  const cityCandidate = match[1].trim();
  const token = cityCandidate.toLowerCase();
  // ignore "me", "here", "my hotel" etc.
  if (token === 'me' || token === 'here' || token === 'my hotel' || token === 'myhotel') return null;
  return cityCandidate;
}

// Overpass POI lookup around coordinates (radius in meters)
async function findPlacesAroundCoords(lat, lon, radius = 1200) {
  // Look for tourism=* and relevant amenity/leisure tags
  const overpassQuery = `
    [out:json][timeout:25];
    (
      node(around:${radius},${lat},${lon})["tourism"];
      way(around:${radius},${lat},${lon})["tourism"];
      relation(around:${radius},${lat},${lon})["tourism"];
      node(around:${radius},${lat},${lon})["amenity"~"museum|theatre|zoo|gallery"];
      way(around:${radius},${lat},${lon})["amenity"~"museum|theatre|zoo|gallery"];
    );
    out center 10;
  `;
  try {
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'ai-concierge-mvp/0.1 (mailto:you@example.com)' },
      body: 'data=' + encodeURIComponent(overpassQuery)
    });
    if (!r.ok) {
      console.error('Overpass HTTP error:', r.status);
      return [];
    }
    const ov = await r.json();
    if (!ov || !Array.isArray(ov.elements) || ov.elements.length === 0) return [];
    const places = ov.elements.slice(0, 6).map(e => {
      const name = (e.tags && (e.tags.name || e.tags.operator)) || 'Unnamed';
      const latRes = e.lat || (e.center && e.center.lat) || '0';
      const lonRes = e.lon || (e.center && e.center.lon) || '0';
      const typeTag = (e.tags && (e.tags.tourism || e.tags.amenity || e.tags.leisure)) || 'poi';
      return { name, lat: String(latRes), lon: String(lonRes), type: typeTag };
    });
    return places;
  } catch (err) {
    console.error('Overpass error:', err && err.message ? err.message : err);
    return [];
  }
}

// Find places using OpenStreetMap Nominatim (multi-phrasing) and Overpass fallback
async function findPlaces(cityOrCoords, type = 'tourist attraction') {
  if (!cityOrCoords) return { live: false, places: FALLBACK_PLACES };

  const buildNominatimUrl = qStr => `https://nominatim.openstreetmap.org/search.php?q=${encodeURIComponent(qStr)}&format=jsonv2&limit=5`;

  // If coords were provided, prefer Overpass for coords (better for POIs)
  if (typeof cityOrCoords === 'object' && cityOrCoords.lat && cityOrCoords.lon) {
    // First try Overpass around coords (recommended)
    try {
      const coordsPlaces = await findPlacesAroundCoords(cityOrCoords.lat, cityOrCoords.lon, 1200);
      if (coordsPlaces && coordsPlaces.length > 0) {
        console.log('Overpass returned count for coords:', coordsPlaces.length);
        return { live: true, places: coordsPlaces };
      }
      // If Overpass had nothing, fall back to a Nominatim coords phrasing as last resort
      const q = `${type} near ${cityOrCoords.lat},${cityOrCoords.lon}`;
      console.log('Fallback Nominatim coords query:', q);
      const url = buildNominatimUrl(q);
      try {
        const res = await fetchWithRetry(url, {
          timeoutMs: 4000,
          headers: { 'User-Agent': 'ai-concierge-mvp/0.1 (mailto:you@example.com)' }
        }, 2, 700);
        const data = await res.json();
        console.log('Nominatim (coords) returned count:', Array.isArray(data) ? data.length : 'not-array');
        if (Array.isArray(data) && data.length > 0) {
          const places = data.map(d => ({ name: d.display_name, lat: d.lat, lon: d.lon, type: d.type }));
          return { live: true, places };
        }
      } catch (err) {
        console.error('Nominatim coords attempt error:', err && err.message ? err.message : err);
      }
    } catch (err) {
      console.error('Error during coords lookup flow:', err && err.message ? err.message : err);
    }

    // If nothing worked, fall through to final fallback below
    console.log('Coords lookup produced no results, falling back to hotel suggestions.');
    return { live: false, places: FALLBACK_PLACES };
  }

  // cityOrCoords is expected to be a string (city name). Try multiple Nominatim phrases.
  const cityName = typeof cityOrCoords === 'string' ? cityOrCoords : String(cityOrCoords || '');
  const queries = [
    `${type} in ${cityName}`,
    `attractions in ${cityName}`,
    `${cityName} tourist attractions`,
    `${cityName} points of interest`
  ];

  for (const q of queries) {
    const url = buildNominatimUrl(q);
    console.log('Trying Nominatim query:', q);
    try {
      const res = await fetchWithRetry(url, {
        timeoutMs: 4000,
        headers: { 'User-Agent': 'ai-concierge-mvp/0.1 (mailto:you@example.com)' }
      }, 2, 700);
      const data = await res.json();
      console.log('Nominatim returned count:', Array.isArray(data) ? data.length : 'not-array');
      if (Array.isArray(data) && data.length > 0) {
        const places = data.map(d => ({ name: d.display_name, lat: d.lat, lon: d.lon, type: d.type }));
        return { live: true, places };
      }
      // otherwise continue to next phrasing
    } catch (err) {
      console.error('Nominatim attempt error:', err && err.message ? err.message : err);
      // continue trying other phrasings / Overpass
    }
  }

  // Try Overpass by city name if Nominatim produced nothing
  try {
    if (cityName) {
      const overpassQuery = `[out:json][timeout:25];area[name="${cityName}"]->.searchArea;(node["tourism"](area.searchArea);way["tourism"](area.searchArea);relation["tourism"](area.searchArea););out center 10;`;
      console.log('Trying Overpass for city:', cityName);
      const r = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'ai-concierge-mvp/0.1 (mailto:you@example.com)' },
        body: 'data=' + encodeURIComponent(overpassQuery)
      });
      if (!r.ok) {
        console.error('Overpass HTTP error:', r.status);
      } else {
        const ov = await r.json();
        if (ov && Array.isArray(ov.elements) && ov.elements.length > 0) {
          const places = ov.elements.slice(0, 6).map(e => {
            const name = (e.tags && (e.tags.name || e.tags.operator)) || 'Unnamed';
            const lat = e.lat || (e.center && e.center.lat) || '0';
            const lon = e.lon || (e.center && e.center.lon) || '0';
            const typeTag = (e.tags && (e.tags.tourism || e.tags.amenity || e.tags.leisure)) || 'poi';
            return { name, lat: String(lat), lon: String(lon), type: typeTag };
          });
          console.log('Overpass returned count for city:', places.length);
          return { live: true, places };
        } else {
          console.log('Overpass returned no elements for city', cityName);
        }
      }
    }
  } catch (err) {
    console.error('Overpass query error:', err && err.message ? err.message : err);
  }

  console.log('Using fallback places.');
  return { live: false, places: FALLBACK_PLACES };
}

function detectIntent(text) {
  const t = (text || '').toLowerCase();
  if (/^(hi|hello|hey|good morning|good evening)\b/.test(t)) return 'greet';
  if (t.includes('check-in') || t.includes('checkin') || t.includes('check in') || t.includes('check out') || t.includes('check-out')) return 'hotel_info';
  if (t.includes('wifi') || t.includes('wi-fi') || t.includes('wi fi')) return 'hotel_info';
  if (t.includes('breakfast') || t.includes('dinner') || t.includes('room service') || t.includes('menu')) return 'dining';
  if (t.includes('taxi') || t.includes('shuttle') || t.includes('airport') || t.includes('transport')) return 'transport';
  if (t.includes('translate') || t.startsWith('translate') || t.includes('in spanish') || t.includes('to spanish')) return 'translation';
  if (t.includes('near') || t.includes('nearby') || t.includes('attraction') || t.includes('things to do') || t.includes('restaurants near')) return 'local_attractions';
  if (t.includes('thanks') || t.includes('thank you') || t.includes('bye') || t.includes('goodbye')) return 'small_talk';
  if (t.includes('detail') || t.includes('more info') || t.includes('more information') || t.includes('tell me about') || t.includes('what is') || t.includes('info about')) return 'place_details';
  return 'unknown';
}

// Fetch detailed information about a place from Nominatim
async function getPlaceDetails(placeName, lat, lon) {
  try {
    const query = lat && lon ? `${lat},${lon}` : placeName;
    const url = `https://nominatim.openstreetmap.org/reverse.php?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
    
    const res = await fetchWithRetry(url, {
      timeoutMs: 4000,
      headers: { 'User-Agent': 'ai-concierge-mvp/0.1 (mailto:you@example.com)' }
    }, 2, 700);
    
    const data = await res.json();
    
    if (!data || !data.address) {
      return null;
    }
    
    // Build a human-readable summary from reverse geocoding data
    const address = data.address;
    const type = data.type || 'location';
    const displayName = data.display_name || placeName;
    
    // Extract relevant address components
    let details = {
      name: placeName || data.name || 'Unknown Place',
      type: type,
      address: displayName,
      amenity: address.amenity || address.tourist_attraction || address.leisure || '',
      city: address.city || address.town || address.village || '',
      state: address.state || '',
      country: address.country || '',
      website: data.extratags && data.extratags.website ? data.extratags.website : '',
      phone: data.extratags && data.extratags.phone ? data.extratags.phone : '',
      hours: data.extratags && data.extratags.opening_hours ? data.extratags.opening_hours : ''
    };
    
    return details;
  } catch (err) {
    console.error('Error fetching place details:', err && err.message ? err.message : err);
    return null;
  }
}

app.post('/api/message', requireAuth, async (req, res) => {
  try {
    const { sessionId = 'anon', message = '', consentLocation = false, coords, city, lastPlace } = req.body;

    if (activeRequests.get(sessionId)) {
      return res.json({ reply: "I'm processing your previous request. Please wait a moment before sending another.", queued: false });
    }
    activeRequests.set(sessionId, true);

    const intent = detectIntent(message);
    let reply = '';
    let suggestions = null;
    let liveLookup = null;

    if (intent === 'greet') {
      reply = 'Hello — welcome! How can I help you today?';
    } else if (intent === 'hotel_info') {
      const qnaAns = answerFromQnA(message);
      reply = qnaAns || "I don't have that info right now — would you like me to connect you to hotel staff?";
    } else if (intent === 'dining') {
      if (/order|room service|reserve|reservation/.test(message.toLowerCase())) {
        reply = 'I can help with room service or reservations — do you want to order now or make a reservation? Please tell me dish or cuisine and party size.';
      } else {
        reply = 'What kind of food are you looking for (cuisine, budget, or dietary needs)?';
      }
    } else if (intent === 'local_attractions') {
      const cityFromMessage = extractCityFromMessage(message);
      if (!consentLocation && !city && !coords && !cityFromMessage) {
        reply = 'I need a city name or permission to use your location. May I use the city name for suggestions?';
      } else {
        // Prefer coords if consentLocation, otherwise parsed city or payload city
        const searchArea = consentLocation ? coords : (cityFromMessage || city || 'hotel area');

        console.log('Parsed city from message:', cityFromMessage);
        console.log('City from payload:', city);
        console.log('Search area chosen:', searchArea);

        const result = await findPlaces(searchArea, 'tourist attraction');
        liveLookup = result.live;
        if (result.places && result.places.length) {
          reply = result.live
            ? `Here are the top ${result.places.length} nearby attractions:`
            : "I couldn't fetch live attraction data right now — here are general suggestions instead.";
          suggestions = result.places;
        } else {
          reply = "I couldn't find live attraction data right now. Would you like general suggestions instead?";
        }
      }
    } else if (intent === 'place_details') {
      // User is asking for details about a place
      if (!lastPlace) {
        reply = 'Which place would you like more information about? You can select one from the suggestions above or tell me the name.';
      } else {
        // Try to get details for the last selected place
        const details = await getPlaceDetails(lastPlace.name, lastPlace.lat, lastPlace.lon);
        if (details) {
          reply = `Here's what I found about **${details.name}**:\n\n`;
          reply += `📍 Location: ${details.address}\n`;
          if (details.amenity) reply += `🏷️ Type: ${details.amenity}\n`;
          if (details.hours) reply += `⏰ Hours: ${details.hours}\n`;
          if (details.phone) reply += `📞 Phone: ${details.phone}\n`;
          if (details.website) reply += `🌐 Website: ${details.website}\n`;
          reply += `\nWould you like directions, recommendations, or more details?`;
        } else {
          reply = `I tried to get more details about ${lastPlace.name}, but I couldn't find additional information right now. Try asking "places near [city]" to see more options.`;
        }
      }
    } else if (intent === 'transport') {
      reply = 'Do you need a taxi, shuttle, or directions? I can provide estimated times and options.';
    } else if (intent === 'translation') {
      const m = message.match(/translate\s+['"]?(.*)['"]?\s+to\s+([a-zA-Z]+)/i);
      if (m) {
        reply = `I can translate "${m[1]}" to ${m[2]}. (Translation service not hooked up in this prototype.)`;
      } else {
        reply = 'What phrase would you like translated and to which language?';
      }
    } else if (intent === 'small_talk') {
      reply = 'You’re welcome — have a great stay!';
    } else {
      // Try QnA as a last-ditch before asking to clarify
      const qnaAns = answerFromQnA(message);
      reply = qnaAns || "I’m not sure I understood. Could you please rephrase or tell me one detail (e.g., city or room number)?";
    }

    activeRequests.delete(sessionId);
    return res.json({ reply, intent, suggestions, liveLookup });
  } catch (err) {
    activeRequests.delete(req.body.sessionId || 'anon');
    console.error('API /api/message error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ reply: "Internal error. Try again later." });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// (No tickets router mounted in this file)

app.listen(PORT, () => {
  console.log(`AI Concierge prototype listening on http://localhost:${PORT}`);
});

// --- AUTHENTICATION ENDPOINTS ---

app.post('/api/login', (req, res) => {
  try {
    const { persona, roomNumber, guestName, staffId, password } = req.body;

    if (!persona) {
      return res.status(400).json({ error: 'Persona (guest/staff) is required' });
    }

    if (persona === 'guest') {
      // Guest login
      if (!roomNumber || !guestName) {
        return res.status(400).json({ error: 'Room number and name are required' });
      }

      const result = auth.createGuestSession(roomNumber, guestName);
      return res.json(result);
    } else if (persona === 'staff') {
      // Staff login
      if (!staffId || !password) {
        return res.status(400).json({ error: 'Employee ID and password are required' });
      }

      const verification = auth.verifyStaffCredentials(staffId, password);
      if (!verification.valid) {
        return res.status(401).json({ error: verification.error || 'Invalid credentials' });
      }

      const result = auth.createStaffSession(staffId);
      return res.json(result);
    } else {
      return res.status(400).json({ error: 'Invalid persona' });
    }
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/logout', requireAuth, (req, res) => {
  try {
    const sessionToken = req.sessionToken;
    auth.destroySession(sessionToken);
    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ error: 'Logout failed' });
  }
});

app.post('/api/verify-session', (req, res) => {
  try {
    const sessionToken = req.headers.authorization?.replace('Bearer ', '') || req.body.sessionToken;
    const session = auth.verifySession(sessionToken);

    if (!session) {
      return res.status(401).json({ valid: false, error: 'Invalid or expired session' });
    }

    return res.json({ valid: true, session });
  } catch (err) {
    console.error('Session verification error:', err);
    return res.status(500).json({ error: 'Session verification failed' });
  }
});

app.get('/api/sessions', requireAuth, (req, res) => {
  // Only staff can view all sessions (optional authorization check)
  try {
    const allSessions = auth.getAllSessions();
    return res.json({ sessions: allSessions, total: allSessions.length });
  } catch (err) {
    console.error('Get sessions error:', err);
    return res.status(500).json({ error: 'Failed to retrieve sessions' });
  }
});
