// server-with-azure-ai.js
// AI Concierge with Azure OpenAI Agentic Integration
// Enhanced version with Azure AI agent capabilities for intelligent conversation and function calling

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const Fuse = require('fuse.js');
const USAGE_LOG_PATH = path.join(__dirname, 'usage.log.jsonl');
const { AzureOpenAI } = require('openai');
const { DefaultAzureCredential, getBearerTokenProvider } = require('@azure/identity');

// Load data files relative to this script directory to avoid CWD issues
let qna = [];
let FALLBACK_PLACES = [];
try {
  const qnaPath = path.join(__dirname, 'qna.json');
  qna = JSON.parse(fs.readFileSync(qnaPath, 'utf8'));
} catch (e) {
  console.error('Failed to load qna.json:', e && e.message ? e.message : e);
  qna = [];
}
try {
  const fpPath = path.join(__dirname, 'fallback_places.json');
  FALLBACK_PLACES = JSON.parse(fs.readFileSync(fpPath, 'utf8'));
} catch (e) {
  console.error('Failed to load fallback_places.json:', e && e.message ? e.message : e);
  FALLBACK_PLACES = [];
}

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));  // Serve static files

const PORT = process.env.PORT || 3000;

// ============================================
// AZURE OPENAI AGENT SETUP
// ============================================

let azureOpenAIClient = null;
const USE_AZURE_AI = process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_DEPLOYMENT_NAME;

if (USE_AZURE_AI) {
  try {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview';

    // Use Managed Identity (recommended for production) or API Key (for local dev)
    if (process.env.AZURE_OPENAI_API_KEY) {
      // API Key authentication (local development)
      azureOpenAIClient = new AzureOpenAI({
        endpoint,
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        apiVersion,
        deployment
      });
      console.log('✅ Azure OpenAI initialized with API Key');
    } else {
      // Managed Identity authentication (production)
      const credential = new DefaultAzureCredential();
      const scope = 'https://cognitiveservices.azure.com/.default';
      const azureADTokenProvider = getBearerTokenProvider(credential, scope);
      
      azureOpenAIClient = new AzureOpenAI({
        endpoint,
        azureADTokenProvider,
        apiVersion,
        deployment
      });
      console.log('✅ Azure OpenAI initialized with Managed Identity');
    }
  } catch (error) {
    console.error('❌ Failed to initialize Azure OpenAI:', error.message);
  }
}

// ============================================
// AGENT TOOLS DEFINITIONS
// ============================================

const agentTools = [
  {
    type: 'function',
    function: {
      name: 'searchNearbyAttractions',
      description: 'Search for tourist attractions, restaurants, or points of interest near a specific location using OpenStreetMap data',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'The city name or location to search near (e.g., "San Francisco", "Paris")'
          },
          type: {
            type: 'string',
            enum: ['tourist attraction', 'restaurant', 'museum', 'park', 'shopping'],
            description: 'Type of place to search for'
          }
        },
        required: ['location']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getHotelInfo',
      description: 'Get information about hotel amenities, policies, check-in/out times, WiFi, breakfast, etc.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The hotel-related question (e.g., "check-in time", "wifi password", "breakfast hours")'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getTransportationInfo',
      description: 'Get information about transportation options like taxi, shuttle, airport transfers',
      parameters: {
        type: 'object',
        properties: {
          transportType: {
            type: 'string',
            enum: ['taxi', 'shuttle', 'airport', 'public transport'],
            description: 'Type of transportation needed'
          }
        },
        required: ['transportType']
      }
    }
  }
];

// ============================================
// EXISTING HELPER FUNCTIONS (from original server.js)
// ============================================

const activeRequests = new Map();

const fuseOptions = {
  keys: ['question'],
  includeScore: true,
  threshold: 0.5,
  ignoreLocation: true,
  useExtendedSearch: false
};
const fuse = new Fuse(qna, fuseOptions);

function normalizeText(s) {
  return (s || '').toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokensSet(s) {
  const n = normalizeText(s);
  if (!n) return new Set();
  return new Set(n.split(' ').filter(Boolean));
}

function answerFromQnA(text) {
  if (!text || !text.trim()) return null;
  const userNorm = normalizeText(text);
  const userTokens = tokensSet(userNorm);

  let bestTokenMatch = { score: 0, item: null };
  for (const item of qna) {
    const qTokens = tokensSet(item.question);
    if (qTokens.size === 0) continue;

    let common = 0;
    for (const t of userTokens) if (qTokens.has(t)) common++;

    const ratioQ = common / qTokens.size;
    const ratioUser = userTokens.size ? (common / userTokens.size) : 0;
    const score = Math.max(ratioQ, ratioUser);

    if (score > bestTokenMatch.score) {
      bestTokenMatch = { score, item };
    }
  }

  const TOKEN_MATCH_THRESHOLD = 0.5;
  if (bestTokenMatch.item && bestTokenMatch.score >= TOKEN_MATCH_THRESHOLD) {
    if (process.env.QNA_DEBUG) console.log('[QNA DEBUG] token match:', bestTokenMatch.score, bestTokenMatch.item.question);
    return bestTokenMatch.item.answer;
  }

  const fuseResults = fuse.search(userNorm);
  if (process.env.QNA_DEBUG) {
    console.log('[QNA DEBUG] user text:', text);
    console.log('[QNA DEBUG] fuse results (top 5):', (fuseResults || []).slice(0,5).map(r => ({ q: r.item.question, score: r.score })));
  }

  if (!fuseResults || fuseResults.length === 0) return null;

  const best = fuseResults[0];
  const FUSE_ACCEPT_THRESHOLD = 0.55;
  if (typeof best.score === 'number' && best.score <= FUSE_ACCEPT_THRESHOLD) {
    if (process.env.QNA_DEBUG) console.log('[QNA DEBUG] accepted fuse match:', best.item.question, 'score=', best.score);
    return best.item.answer;
  }

  if (process.env.QNA_DEBUG) console.log('[QNA DEBUG] no suitable QnA match (best score=', best.score, ')');
  return null;
}

// ============================================
// USAGE LOGGING
// ============================================
function logTokenUsage(usage, stage) {
  try {
    if (!usage) return;
    const rec = {
      ts: new Date().toISOString(),
      stage: stage || 'unknown',
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'unknown',
      prompt_tokens: usage.prompt_tokens ?? usage.promptTokens ?? 0,
      completion_tokens: usage.completion_tokens ?? usage.completionTokens ?? 0,
      total_tokens: usage.total_tokens ?? usage.totalTokens ?? ((usage.prompt_tokens||0) + (usage.completion_tokens||0))
    };
    fs.appendFileSync(USAGE_LOG_PATH, JSON.stringify(rec) + '\n', 'utf8');
  } catch (e) {
    console.warn('Usage logging failed:', e && e.message ? e.message : e);
  }
}

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
          'User-Agent': options.headers && options.headers['User-Agent'] ? options.headers['User-Agent'] : 'ai-concierge-mvp/0.1 (mailto:you@example.com)',
          ...(options.headers || {})
        }
      });
      clearTimeout(timeout);

      if (res.status === 429) {
        const ra = res.headers.get('retry-after');
        const wait = ra ? parseInt(ra, 10) * 1000 : backoff * (attempt + 1);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      return res;
    } catch (err) {
      clearTimeout(timeout);
      const isLast = attempt === retries;
      if (isLast) throw err;
      await new Promise(r => setTimeout(r, backoff * (attempt + 1)));
    }
  }
  throw new Error('Unreachable fetchWithRetry exit');
}

function extractCityFromMessage(message) {
  const match = message.match(/near\s+([a-zA-Z\s,]+)/i);
  if (!match) return null;
  const cityCandidate = match[1].trim();
  const token = cityCandidate.toLowerCase();
  if (token === 'me' || token === 'here' || token === 'my hotel' || token === 'myhotel') return null;
  return cityCandidate;
}

async function findPlacesAroundCoords(lat, lon, radius = 1200, category = 'tourist attraction') {
  const cat = (category || 'tourist attraction').toLowerCase();
  let blocks = '';
  if (/(food|restaurant|cafe|eat|dining|bar|pub)/i.test(cat)) {
    blocks = `
      node(around:${radius},${lat},${lon})["amenity"~"restaurant|cafe|fast_food|food_court|ice_cream|bar|pub"]; 
      way(around:${radius},${lat},${lon})["amenity"~"restaurant|cafe|fast_food|food_court|ice_cream|bar|pub"]; 
      relation(around:${radius},${lat},${lon})["amenity"~"restaurant|cafe|fast_food|food_court|ice_cream|bar|pub"]; 
    `;
  } else if (/(shopping|shop|mall|market|store)/i.test(cat)) {
    blocks = `
      node(around:${radius},${lat},${lon})["shop"~"mall|department_store|supermarket|convenience|clothes|electronics|bakery|butcher|books|furniture|shoe|jewelry|gift|toy|cosmetics"]; 
      way(around:${radius},${lat},${lon})["shop"~"mall|department_store|supermarket|convenience|clothes|electronics|bakery|butcher|books|furniture|shoe|jewelry|gift|toy|cosmetics"]; 
      relation(around:${radius},${lat},${lon})["shop"~"mall|department_store|supermarket|convenience|clothes|electronics|bakery|butcher|books|furniture|shoe|jewelry|gift|toy|cosmetics"]; 
    `;
  } else {
    blocks = `
      node(around:${radius},${lat},${lon})["tourism"~"museum|attraction|gallery|artwork|zoo"]; 
      way(around:${radius},${lat},${lon})["tourism"~"museum|attraction|gallery|artwork|zoo"]; 
      relation(around:${radius},${lat},${lon})["tourism"~"museum|attraction|gallery|artwork|zoo"]; 
      node(around:${radius},${lat},${lon})["amenity"~"theatre|cinema"]; 
      way(around:${radius},${lat},${lon})["amenity"~"theatre|cinema"]; 
      node(around:${radius},${lat},${lon})["leisure"~"park|garden"]; 
      way(around:${radius},${lat},${lon})["leisure"~"park|garden"]; 
    `;
  }
  const overpassQuery = `[out:json][timeout:25];
  (
    ${blocks}
  );
  out center 15;`;
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
      const typeTag = (e.tags && (e.tags.shop || e.tags.tourism || e.tags.amenity || e.tags.leisure)) || "poi";
      return { name, lat: String(latRes), lon: String(lonRes), type: typeTag };
    });
    return places;
  } catch (err) {
    console.error('Overpass error:', err && err.message ? err.message : err);
    return [];
  }
}

// Known city coordinates for faster searches (cache)
const CITY_COORDS = {
  'seattle': { lat: 47.6062, lon: -122.3321, radius: 0.15 },
  'ahmedabad': { lat: 23.0225, lon: 72.5714, radius: 0.15 },
  'paris': { lat: 48.8566, lon: 2.3522, radius: 0.12 },
  'london': { lat: 51.5074, lon: -0.1278, radius: 0.12 },
  'new york': { lat: 40.7128, lon: -74.0060, radius: 0.15 },
  'tokyo': { lat: 35.6762, lon: 139.6503, radius: 0.15 },
  'chicago': { lat: 41.8781, lon: -87.6298, radius: 0.12 }
};

// Dynamic geocoding function
async function geocodeCity(cityName) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&limit=1`;
    console.log(`Geocoding ${cityName}...`);
    const response = await fetch(url, {
      headers: { 'User-Agent': 'HotelConciergeBot/1.0' },
      signal: AbortSignal.timeout(5000)
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0) {
        const result = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), radius: 0.15 };
        console.log(`✅ Geocoded ${cityName}: ${result.lat}, ${result.lon}`);
        // Cache it for future use
        CITY_COORDS[cityName.toLowerCase()] = result;
        return result;
      }
    }
    console.log(`❌ Could not geocode ${cityName}`);
  } catch (err) {
    console.error(`Geocoding error for ${cityName}:`, err.message || err);
  }
  return null;
}

async function findPlaces(cityOrCoords, type = 'tourist attraction') {
  if (!cityOrCoords) return { live: false, places: FALLBACK_PLACES };

  // Use Azure Maps Search API (free tier) - more reliable than Nominatim
  const AZURE_MAPS_KEY = process.env.AZURE_MAPS_KEY || 'demo'; // User can add their key later
  
  if (typeof cityOrCoords === 'object' && cityOrCoords.lat && cityOrCoords.lon) {
    try {
      const coordsPlaces = await findPlacesAroundCoords(cityOrCoords.lat, cityOrCoords.lon, 1200, type);
      if (coordsPlaces && coordsPlaces.length > 0) {
        console.log('Coordinate search returned count:', coordsPlaces.length);
        return { live: true, places: coordsPlaces };
      }
    } catch (err) {
      console.error('Error during coords lookup:', err && err.message ? err.message : err);
    }
    return { live: false, places: FALLBACK_PLACES };
  }

  const cityName = typeof cityOrCoords === 'string' ? cityOrCoords : String(cityOrCoords || '');
  
  // Check if we have coordinates for this city (cached or known)
  const cityKey = cityName.toLowerCase();
  let knownCity = CITY_COORDS[cityKey];
  
  // If not in cache, try to geocode it dynamically
  if (!knownCity) {
    knownCity = await geocodeCity(cityName);
  }
  
  if (knownCity) {
    console.log(`Using coordinates for ${cityName}: ${knownCity.lat}, ${knownCity.lon}`);
    try {
      const coordsPlaces = await findPlacesAroundCoords(knownCity.lat, knownCity.lon, 5000, type);
      if (coordsPlaces && coordsPlaces.length > 0) {
        console.log(`✅ Found ${coordsPlaces.length} places in ${cityName} using coordinates`);
        return { live: true, places: coordsPlaces };
      }
    } catch (err) {
      console.error('Error searching by coordinates:', err.message || err);
    }
  }
  
  // If geocoding failed or no results, use fallback
  console.log(`No results found for ${cityName}, using fallback places.`);
  return { live: false, places: FALLBACK_PLACES };
}

// ============================================

// Category filter for places
function filterPlacesByType(places, type) {
  try {
    if (!type || !Array.isArray(places)) return places || [];
    const t = String(type).toLowerCase();
    const isFood = /(food|restaurant|restaurants|cafe|cafes|eat|eatery)/.test(t);
    const isShop = /(shopping|shop|shops|mall|market)/.test(t);
    const isAttraction = /(attraction|museum|museums|park|parks|theatre|theater|cinema)/.test(t) || (!isFood && !isShop);
    const FOOD = new Set(['restaurant','cafe','fast_food','food_court','ice_cream','bar','pub']);
    const SHOP = new Set(['mall','department_store','supermarket','convenience','clothes','electronics','bakery','butcher','books','furniture','shoe','jewelry','gift','toy','cosmetics','marketplace']);
    const ATR = new Set(['museum','attraction','gallery','artwork','zoo','theatre','cinema','park','garden']);
    const ok = (val) => {
      const v = String(val||'').toLowerCase();
      if (isFood) return FOOD.has(v);
      if (isShop) return SHOP.has(v) || v==='shop';
      if (isAttraction) return ATR.has(v);
      return true;
    };
    const out = places.filter(p => ok(p.type));
    return out.length>0 ? out : places;
  } catch { return places || []; }
}
// TOOL EXECUTION HANDLERS
// ============================================

async function executeToolCall(toolCall) {
  const functionName = toolCall.function.name;
  const args = JSON.parse(toolCall.function.arguments || '{}');
  
  console.log(`🔧 Executing tool: ${functionName}`, args);

  switch (functionName) {
    case 'searchNearbyAttractions': {
      const location = args.location;
      const type = args.type || 'tourist attraction';
      const result = await findPlaces(location, type);
      const filteredPlaces = filterPlacesByType(result.places, type);
      return {
        success: true,
        live: result.live,
        places: filteredPlaces,
        message: result.live 
          ? `Found ${filteredPlaces.length} ${type}(s) near ${location}`
          : `Using fallback suggestions (live data unavailable)`
      };
    }

    case 'searchFoodPlaces': {
      const location = args.location;
      const result = await findPlaces(location, 'restaurant');
      const filteredPlaces = filterPlacesByType(result.places, 'restaurant');
      return {
        success: true,
        live: result.live,
        places: filteredPlaces,
        message: result.live
          ? `Found ${filteredPlaces.length} food & drink places near ${location}`
          : `Using fallback suggestions (live data unavailable)`
      };
    }

    case 'searchAttractionPlaces': {
      const location = args.location;
      const result = await findPlaces(location, 'tourist attraction');
      const filteredPlaces = filterPlacesByType(result.places, 'tourist attraction');
      return {
        success: true,
        live: result.live,
        places: filteredPlaces,
        message: result.live
          ? `Found ${filteredPlaces.length} attractions near ${location}`
          : `Using fallback suggestions (live data unavailable)`
      };
    }

    case 'searchShoppingPlaces': {
      const location = args.location;
      const result = await findPlaces(location, 'shopping');
      const filteredPlaces = filterPlacesByType(result.places, 'shopping');
      return {
        success: true,
        live: result.live,
        places: filteredPlaces,
        message: result.live
          ? `Found ${filteredPlaces.length} shopping places near ${location}`
          : `Using fallback suggestions (live data unavailable)`
      };
    }

    case 'getHotelInfo': {
      const answer = answerFromQnA(args.query);
      return {
        success: true,
        answer: answer || 'I don\'t have that specific information. Please contact hotel staff.',
        query: args.query
      };
    }

    case 'getTransportationInfo': {
      const transportType = args.transportType;
      return {
        success: true,
        info: `Transportation information for ${transportType}. (Connect to real booking system here)`,
        transportType
      };
    }

    default:
      return {
        success: false,
        error: `Unknown tool: ${functionName}`
      };
  }
}

// ============================================
// AZURE AI AGENT CONVERSATION HANDLER
// ============================================

async function handleAzureAIAgent(userMessage, conversationHistory = []) {
  if (!azureOpenAIClient) {
    throw new Error('Azure OpenAI client not initialized');
  }

  // Build conversation messages
  const messages = [
    {
      role: 'system',
      content: `You are a helpful hotel concierge AI assistant. You help guests with:
  - Finding nearby attractions, restaurants, and places to visit
  - Answering hotel-related questions (check-in/out, amenities, WiFi, etc.)
  - Providing transportation information
  - General hospitality assistance

  🚨 CRITICAL RULES for place searches - FOLLOW EXACTLY:
    1. ALWAYS call exactly ONE search tool for place discovery per user message.
    2. Tool selection:
      - Food / restaurants / cafe / bar queries → use searchFoodPlaces
      - Museums / parks / theatre / attractions → use searchAttractionPlaces
      - Shopping / mall / market / store queries → use searchShoppingPlaces
      - Mixed / unclear / generic "things to do" → use searchNearbyAttractions with appropriate type parameter
    3. Never fabricate or supplement places beyond the returned "places" array.
    4. Response formatting after tool call:
      - If live=true: Begin with "Here are some great options:" and list ONLY the places.
      - If live=false: Begin with "I apologize for the inconvenience. Here are some general suggestions:" and list ONLY fallback places.
    5. DO NOT apologize when live=true.
    6. NEVER add locations from memory (e.g., "Agashiye", "Swati Snacks") unless they were returned.
    7. If user asks follow-up clarifications about listed places, you may describe ONLY fields you received (name, type); otherwise re-run an appropriate search tool if needing fresh results.
  
  Be friendly, professional, and helpful.`
    },
    ...conversationHistory,
    {
      role: 'user',
      content: userMessage
    }
  ];

  try {
    let response = await azureOpenAIClient.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
      messages: messages,
      tools: agentTools,
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 800
    });
    if (response && response.usage) logTokenUsage(response.usage, 'pre-tools');

    let assistantMessage = response.choices[0].message;
    let toolResults = [];
    let suggestions = null;
    let liveLookup = null;

    // Handle tool calls if the agent wants to use them
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log(`🤖 Agent requested ${assistantMessage.tool_calls.length} tool call(s)`);
      
      // Execute all tool calls
      for (const toolCall of assistantMessage.tool_calls) {
        const result = await executeToolCall(toolCall);
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: toolCall.function.name,
          content: JSON.stringify(result)
        });

        // Extract suggestions for UI
        if (result.places && Array.isArray(result.places)) {
          suggestions = result.places;
          liveLookup = result.live;
        }
      }

      // Send tool results back to the agent for final response
      messages.push(assistantMessage);
      messages.push(...toolResults);

      response = await azureOpenAIClient.chat.completions.create({
        model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
        messages: messages,
        temperature: 0.7,
        max_tokens: 800
      });
      if (response && response.usage) logTokenUsage(response.usage, 'post-tools');

      assistantMessage = response.choices[0].message;
    }

    return {
      reply: assistantMessage.content,
      intent: 'ai_agent',
      suggestions,
      liveLookup,
      toolsUsed: assistantMessage.tool_calls ? assistantMessage.tool_calls.map(tc => tc.function.name) : []
    };

  } catch (error) {
    console.error('❌ Azure AI Agent error:', error);
    throw error;
  }
}

// ============================================
// MAIN API ENDPOINT
// ============================================

app.post('/api/message', async (req, res) => {
  try {
    const { sessionId = 'anon', message = '', consentLocation = false, coords, city, conversationHistory = [] } = req.body;

    if (activeRequests.get(sessionId)) {
      return res.json({ 
        reply: "I'm processing your previous request. Please wait a moment before sending another.", 
        queued: false 
      });
    }
    activeRequests.set(sessionId, true);

    let result;

    // Use Azure AI Agent if available, otherwise fall back to original logic
    if (USE_AZURE_AI && azureOpenAIClient) {
      try {
        console.log('🤖 Using Azure AI Agent for message:', message);
        result = await handleAzureAIAgent(message, conversationHistory);
      } catch (error) {
        console.error('Azure AI Agent failed, falling back to original logic:', error.message);
        // Fall back to original logic if Azure AI fails
        result = await handleOriginalLogic(message, consentLocation, coords, city);
      }
    } else {
      console.log('📝 Using original logic (Azure AI not configured)');
      result = await handleOriginalLogic(message, consentLocation, coords, city);
    }

    activeRequests.delete(sessionId);
    return res.json(result);

  } catch (err) {
    activeRequests.delete(req.body.sessionId || 'anon');
    console.error('API /api/message error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ reply: "Internal error. Try again later." });
  }
});

// Original logic function (from your existing server.js)
async function handleOriginalLogic(message, consentLocation, coords, city) {
  const intent = detectIntent(message);
  let reply = '';
  let suggestions = null;
  let liveLookup = null;

  if (intent === 'greet') {
    reply = 'Hello – welcome! How can I help you today?';
  } else if (intent === 'hotel_info') {
    const qnaAns = answerFromQnA(message);
    reply = qnaAns || "I don't have that info right now – would you like me to connect you to hotel staff?";
  } else if (intent === 'dining') {
    if (/order|room service|reserve|reservation/.test(message.toLowerCase())) {
      reply = 'I can help with room service or reservations – do you want to order now or make a reservation? Please tell me dish or cuisine and party size.';
    } else {
      reply = 'What kind of food are you looking for (cuisine, budget, or dietary needs)?';
    }
  } else if (intent === 'local_attractions') {
    const cityFromMessage = extractCityFromMessage(message);
    if (!consentLocation && !city && !coords && !cityFromMessage) {
      reply = 'I need a city name or permission to use your location. May I use the city name for suggestions?';
    } else {
      const searchArea = consentLocation ? coords : (cityFromMessage || city || 'hotel area');
      console.log('Search area chosen:', searchArea);
      const result = await findPlaces(searchArea, 'tourist attraction');
      liveLookup = result.live;
      if (result.places && result.places.length) {
        reply = result.live
          ? `Here are the top ${result.places.length} nearby attractions:`
          : "I couldn't fetch live attraction data right now – here are general suggestions instead.";
        suggestions = result.places;
      } else {
        reply = "I couldn't find live attraction data right now. Would you like general suggestions instead?";
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
    reply = 'You are welcome - have a great stay!';
  } else {
    const qnaAns = answerFromQnA(message);
    reply = qnaAns || "I'm not sure I understood. Could you please rephrase or tell me one detail (e.g., city or room number)?";
  }

  return { reply, intent, suggestions, liveLookup };
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
  return 'unknown';
}

app.get('/api/health', (req, res) => res.json({ status: 'ok', azureAI: !!azureOpenAIClient }));

app.listen(PORT, () => {
  console.log(`🚀 AI Concierge with Azure AI listening on http://localhost:${PORT}`);
  console.log(`   Azure AI Agent: ${USE_AZURE_AI ? '✅ Enabled' : '❌ Disabled'}`);
});










