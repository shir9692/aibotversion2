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
const { CosmosClient } = require('@azure/cosmos');

// Load data files relative to this script directory to avoid CWD issues
let qna = [];
let FALLBACK_PLACES = [];
let hotelKnowledge = [];
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
try {
  const knowledgePath = path.join(__dirname, 'hotel_knowledge.json');
  hotelKnowledge = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));
  console.log(`✅ Loaded ${hotelKnowledge.length} hotel knowledge documents`);
} catch (e) {
  console.error('Failed to load hotel_knowledge.json:', e && e.message ? e.message : e);
  hotelKnowledge = [];
}

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));  // Serve static files

const PORT = process.env.PORT || 3000;

// ============================================
// COSMOS DB SETUP FOR TICKETING
// ============================================

let ticketsContainer = null;
const USE_COSMOS_DB = process.env.COSMOS_ENDPOINT && process.env.COSMOS_KEY && process.env.COSMOS_DATABASE && process.env.COSMOS_CONTAINER;

if (USE_COSMOS_DB) {
  try {
    const cosmosClient = new CosmosClient({
      endpoint: process.env.COSMOS_ENDPOINT,
      key: process.env.COSMOS_KEY
    });
    const database = cosmosClient.database(process.env.COSMOS_DATABASE);
    ticketsContainer = database.container(process.env.COSMOS_CONTAINER);
    console.log('? Cosmos DB initialized for ticketing');
  } catch (error) {
    console.error('Failed to initialize Cosmos DB:', error.message);
  }
} else {
  console.warn('? Cosmos DB not configured. Ticketing will use in-memory storage (data will be lost on restart).');
}

// In-memory fallback for tickets if Cosmos DB not available
const inMemoryTickets = [];

// ============================================
// ANALYTICS TRACKING SYSTEM
// ============================================

const analytics = {
  sessions: {},           // sessionId -> { messageCount, firstSeen, lastSeen }
  questions: {},          // question -> count
  failedQueries: [],      // { query, reason, timestamp, sessionId }
  tickets: [],            // { ticketId, requestType, timestamp, sessionId }
  conversions: [],        // { type, value, timestamp, sessionId }
  locationSearches: {}    // location -> count
};

function trackQuestion(sessionId, question) {
  const normalized = question.toLowerCase().trim();
  analytics.questions[normalized] = (analytics.questions[normalized] || 0) + 1;
  
  if (!analytics.sessions[sessionId]) {
    analytics.sessions[sessionId] = {
      messageCount: 0,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    };
  }
  analytics.sessions[sessionId].messageCount++;
  analytics.sessions[sessionId].lastSeen = new Date().toISOString();
}

function trackFailedQuery(sessionId, query, reason) {
  analytics.failedQueries.push({
    sessionId,
    query,
    reason,
    timestamp: new Date().toISOString()
  });
  
  // Keep only last 100 failed queries
  if (analytics.failedQueries.length > 100) {
    analytics.failedQueries.shift();
  }
}

function trackTicket(sessionId, ticketId, requestType) {
  analytics.tickets.push({
    sessionId,
    ticketId,
    requestType,
    timestamp: new Date().toISOString()
  });
  
  // Track as conversion
  trackConversion(sessionId, 'ticket_created', requestType);
}

function trackConversion(sessionId, type, value = null) {
  analytics.conversions.push({
    sessionId,
    type,
    value,
    timestamp: new Date().toISOString()
  });
}

function trackLocationSearch(location) {
  analytics.locationSearches[location] = (analytics.locationSearches[location] || 0) + 1;
}

// ============================================
// GUEST PROFILE SYSTEM
// ============================================

let profilesContainer = null;
const USE_PROFILES_DB = USE_COSMOS_DB && process.env.COSMOS_PROFILES_CONTAINER;

if (USE_PROFILES_DB) {
  try {
    const cosmosClient = new CosmosClient({
      endpoint: process.env.COSMOS_ENDPOINT,
      key: process.env.COSMOS_KEY
    });
    const database = cosmosClient.database(process.env.COSMOS_DATABASE);
    profilesContainer = database.container(process.env.COSMOS_PROFILES_CONTAINER);
    console.log('? Cosmos DB initialized for guest profiles');
  } catch (error) {
    console.error('Failed to initialize Profiles DB:', error.message);
  }
} else {
  console.warn('? Guest profiles will use in-memory storage');
}

// In-memory storage for guest profiles
const inMemoryProfiles = new Map();

// Profile helper functions
async function getGuestProfile(sessionId) {
  if (!sessionId) return null;
  
  try {
    if (USE_PROFILES_DB && profilesContainer) {
      const { resource } = await profilesContainer.item(sessionId, sessionId).read();
      return resource;
    } else {
      return inMemoryProfiles.get(sessionId);
    }
  } catch (error) {
    if (error.code === 404) return null; // Profile doesn't exist
    console.error('Error fetching profile:', error.message);
    return null;
  }
}

async function saveGuestProfile(profile) {
  try {
    if (USE_PROFILES_DB && profilesContainer) {
      await profilesContainer.items.upsert(profile);
      console.log(`? Profile saved for session ${profile.id}`);
    } else {
      inMemoryProfiles.set(profile.id, profile);
      console.log(`? Profile saved to in-memory for session ${profile.id}`);
    }
  } catch (error) {
    console.error('Error saving profile:', error.message);
  }
}

function createNewProfile(sessionId) {
  return {
    id: sessionId,
    reservationId: null,
    interests: [],
    language: 'en',
    dietary: [],
    mobility: null,
    onboardingComplete: false,
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
    interactions: []
  };
}

// ============================================
// RAG SYSTEM - SEMANTIC SEARCH WITH EMBEDDINGS
// ============================================

let knowledgeBaseEmbeddings = []; // Store documents with their embeddings
let ragInitialized = false;

// Cosine similarity function
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }
  
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);
  
  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (magA * magB);
}

// Generate embedding for text using Azure OpenAI
async function generateEmbedding(text) {
  if (!azureOpenAIClient) return null;
  
  try {
    // Create a new client specifically for embeddings with correct deployment
    const embeddingClient = new AzureOpenAI({
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview',
      deployment: 'text-embedding-ada-002' // Use embedding deployment name
    });
    
    const response = await embeddingClient.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text.substring(0, 8000) // Limit to 8000 chars
    });
    
    return response.data[0].embedding;
  } catch (error) {
    console.error('Embedding generation error:', error.message);
    return null;
  }
}

// Initialize RAG knowledge base with embeddings
async function initializeRAG() {
  if (!azureOpenAIClient || hotelKnowledge.length === 0) {
    console.log('⚠️  RAG not initialized - Azure OpenAI or knowledge base missing');
    return;
  }
  
  console.log('🔄 Initializing RAG system - generating embeddings...');
  
  try {
    const startTime = Date.now();
    
    // Generate embeddings for all knowledge documents
    for (const doc of hotelKnowledge) {
      const text = `${doc.title}. ${doc.content}`;
      const embedding = await generateEmbedding(text);
      
      if (embedding) {
        knowledgeBaseEmbeddings.push({
          ...doc,
          embedding: embedding
        });
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    ragInitialized = true;
    console.log(`✅ RAG initialized with ${knowledgeBaseEmbeddings.length} documents in ${duration}s`);
  } catch (error) {
    console.error('❌ RAG initialization failed:', error.message);
  }
}

// Semantic search using RAG
async function semanticSearch(query, topK = 3) {
  if (!ragInitialized || knowledgeBaseEmbeddings.length === 0) {
    console.log('RAG not available, using fallback');
    return [];
  }
  
  try {
    // Generate embedding for user query
    const queryEmbedding = await generateEmbedding(query);
    if (!queryEmbedding) return [];
    
    // Calculate similarity with all documents
    const results = knowledgeBaseEmbeddings.map(doc => {
      const similarity = cosineSimilarity(queryEmbedding, doc.embedding);
      return {
        id: doc.id,
        title: doc.title,
        content: doc.content,
        category: doc.category,
        similarity: similarity
      };
    });
    
    // Sort by similarity and return top results
    const topResults = results
      .filter(r => r.similarity > 0.7) // Only return relevant results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
    
    console.log(`🔍 Semantic search found ${topResults.length} relevant documents`);
    return topResults;
  } catch (error) {
    console.error('Semantic search error:', error.message);
    return [];
  }
}

// Answer question using RAG
async function answerWithRAG(query) {
  const relevantDocs = await semanticSearch(query, 3);
  
  if (relevantDocs.length === 0) {
    // Fall back to old qna.json search
    return answerFromQnA(query);
  }
  
  // Build context from retrieved documents
  const context = relevantDocs
    .map(doc => `${doc.title}:\n${doc.content}`)
    .join('\n\n');
  
  return {
    answer: context,
    sources: relevantDocs.map(d => ({ id: d.id, title: d.title, similarity: d.similarity.toFixed(3) })),
    useRAG: true
  };
}

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
      console.log('? Azure OpenAI initialized with API Key');
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
      console.log('? Azure OpenAI initialized with Managed Identity');
    }
  } catch (error) {
    console.error('? Failed to initialize Azure OpenAI:', error.message);
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
      description: 'REQUIRED for ALL hotel-related questions. Call this tool to get accurate information about: hotel policies (check-in/out times, cancellation), amenities (WiFi password, pool, fitness center, parking), services (breakfast, room service, housekeeping), pet policy, accessibility features, payment methods, and any other hotel facility or policy questions. This tool uses semantic search to find the most relevant information from the hotel knowledge base.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The hotel-related question exactly as the guest asked it (e.g., "can I bring my cat?", "what time is check in?", "is there free wifi?", "where do I park?")'
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
  },
  {
    type: 'function',
    function: {
      name: 'createTicket',
      description: 'Create a service ticket for guest requests that require staff action (housekeeping, maintenance, room service, concierge assistance)',
      parameters: {
        type: 'object',
        properties: {
          guestName: {
            type: 'string',
            description: 'Name of the guest making the request (optional)'
          },
          roomNumber: {
            type: 'string',
            description: 'Guest room number (optional)'
          },
          requestType: {
            type: 'string',
            enum: ['Housekeeping', 'Maintenance', 'Room Service', 'Concierge', 'Other'],
            description: 'Category of the service request'
          },
          priority: {
            type: 'string',
            enum: ['Low', 'Medium', 'High', 'Urgent'],
            description: 'Priority level of the request'
          },
          description: {
            type: 'string',
            description: 'Detailed description of what the guest needs'
          }
        },
        required: ['requestType', 'description']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'updateGuestProfile',
      description: 'Save or update guest preferences during onboarding or when guest shares new preferences',
      parameters: {
        type: 'object',
        properties: {
          interests: {
            type: 'array',
            items: { type: 'string' },
            description: 'Guest interests/activities: food, art, hiking, shopping, nightlife, family, culture, sports, relaxation, adventure'
          },
          dietary: {
            type: 'array',
            items: { type: 'string' },
            description: 'Dietary preferences: vegetarian, vegan, halal, kosher, gluten-free, none'
          },
          language: {
            type: 'string',
            description: 'Preferred language code (e.g., en, es, fr)'
          },
          mobility: {
            type: 'string',
            description: 'Mobility constraints if any: wheelchair, limited-mobility, none'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getCurrentWeather',
      description: 'Get current weather conditions and forecast for a location. Use this when guest asks about weather, temperature, rain, or planning outdoor activities.',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'City name or location (e.g., "San Francisco", "Paris"). Use "current" for guest current location if known.'
          }
        },
        required: ['location']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'searchLocalEvents',
      description: 'Search for local events, concerts, festivals, sports games, exhibitions happening in the area. Use when guest asks "what\'s happening", "events tonight", "things to do this weekend".',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'City name or location to search events'
          },
          eventType: {
            type: 'string',
            enum: ['all', 'concerts', 'sports', 'arts', 'festivals', 'nightlife', 'family'],
            description: 'Type of events to search for (default: all)'
          },
          timeframe: {
            type: 'string',
            enum: ['today', 'tonight', 'tomorrow', 'this_weekend', 'this_week'],
            description: 'When to look for events (default: today)'
          }
        },
        required: ['location']
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
        console.log(`? Geocoded ${cityName}: ${result.lat}, ${result.lon}`);
        // Cache it for future use
        CITY_COORDS[cityName.toLowerCase()] = result;
        return result;
      }
    }
    console.log(`? Could not geocode ${cityName}`);
  } catch (err) {
    console.error(`Geocoding error for ${cityName}:`, err.message || err);
  }
  return null;
}

// ============================================
// WEATHER API INTEGRATION (OpenWeatherMap)
// ============================================
async function fetchWeatherData(location) {
  const WEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
  
  if (!WEATHER_API_KEY || WEATHER_API_KEY === 'demo') {
    // Return mock data if no API key configured
    return {
      success: false,
      message: 'Weather service not configured. Please add OPENWEATHER_API_KEY to .env file. Get free API key at https://openweathermap.org/api',
      mockData: {
        location: location,
        current: {
          temp: 72,
          condition: 'Partly Cloudy',
          humidity: 65,
          wind: '8 mph'
        },
        forecast: 'Pleasant conditions expected'
      }
    };
  }

  try {
    let cityName = location;
    let lat, lon;

    // If location is "current" or coordinates available, use browser coords
    if (location.toLowerCase() === 'current' && global.browserCoords) {
      lat = global.browserCoords.lat;
      lon = global.browserCoords.lon;
    } else {
      // Geocode the city first
      const coords = await geocodeCity(cityName);
      if (!coords) {
        return {
          success: false,
          message: `Could not find location: ${cityName}`
        };
      }
      lat = coords.lat;
      lon = coords.lon;
    }

    // Fetch current weather
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=imperial`;
    const response = await fetchWithRetry(weatherUrl, { timeoutMs: 5000 });
    
    if (!response.ok) {
      throw new Error(`Weather API returned ${response.status}`);
    }

    const data = await response.json();
    
    return {
      success: true,
      location: data.name || cityName,
      current: {
        temp: Math.round(data.main.temp),
        feelsLike: Math.round(data.main.feels_like),
        condition: data.weather[0].description,
        humidity: data.main.humidity,
        wind: `${Math.round(data.wind.speed)} mph`,
        icon: data.weather[0].icon
      },
      advice: generateWeatherAdvice(data)
    };

  } catch (error) {
    console.error('Weather API error:', error.message);
    return {
      success: false,
      message: `Weather service temporarily unavailable: ${error.message}`
    };
  }
}

function generateWeatherAdvice(weatherData) {
  const temp = weatherData.main.temp;
  const condition = weatherData.weather[0].main.toLowerCase();
  const advice = [];

  if (temp > 85) advice.push('🌞 It\'s hot! Stay hydrated and seek shade.');
  else if (temp < 50) advice.push('🧥 It\'s chilly - bring a jacket!');
  else advice.push('👌 Perfect weather for exploring!');

  if (condition.includes('rain')) advice.push('☔ Rain expected - bring an umbrella!');
  if (condition.includes('snow')) advice.push('❄️ Snow conditions - dress warmly!');
  if (weatherData.wind.speed > 20) advice.push('💨 Windy conditions - hold onto your hat!');

  return advice.join(' ');
}

// ============================================
// LOCAL EVENTS SEARCH (Mock + Extensible)
// ============================================
async function searchEvents(location, eventType = 'all', timeframe = 'this_week') {
  // Using Ticketmaster Discovery API for real event data
  // Docs: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
  
  const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY;
  
  if (!TICKETMASTER_API_KEY || TICKETMASTER_API_KEY === 'demo') {
    // Return curated mock events when no API key configured
    return {
      success: true,
      message: 'Showing sample events. Add TICKETMASTER_API_KEY to .env for live events.',
      mockEvents: [
        {
          title: 'Live Jazz Night at The Blue Note',
          type: 'concerts',
          date: 'Tonight, 8:00 PM',
          venue: 'The Blue Note Jazz Club',
          price: '$25-45',
          description: 'Local jazz ensemble performing classics and originals'
        },
        {
          title: 'Weekend Farmers Market',
          type: 'family',
          date: 'Saturday & Sunday, 9 AM - 2 PM',
          venue: 'City Square',
          price: 'Free entry',
          description: 'Local produce, artisan goods, food trucks, and live music'
        },
        {
          title: 'Art Gallery Opening: Modern Perspectives',
          type: 'arts',
          date: 'Friday, 6:00 PM',
          venue: 'Metropolitan Gallery',
          price: 'Free',
          description: 'Opening reception for new contemporary art exhibition'
        },
        {
          title: 'City Food Festival',
          type: 'festivals',
          date: 'This Weekend',
          venue: 'Waterfront Park',
          price: '$15 entry',
          description: '50+ food vendors, cooking demos, and live entertainment'
        }
      ]
    };
  }

  try {
    // Get coordinates for location
    const coords = await geocodeCity(location);
    if (!coords) {
      return {
        success: false,
        message: `Could not find location: ${location}`
      };
    }

    // Build Ticketmaster API URL - radius in miles
    const radiusMiles = 15;
    let apiUrl = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TICKETMASTER_API_KEY}&latlong=${coords.lat},${coords.lon}&radius=${radiusMiles}&unit=miles&size=20&sort=date,asc`;
    
    // Add event type classification
    if (eventType && eventType !== 'all') {
      const classificationMap = {
        'concerts': 'Music',
        'sports': 'Sports',
        'arts': 'Arts & Theatre',
        'festivals': 'Miscellaneous',
        'family': 'Family',
        'nightlife': 'Music'
      };
      const classification = classificationMap[eventType];
      if (classification) {
        apiUrl += `&classificationName=${encodeURIComponent(classification)}`;
      }
    }

    // Add date range
    const now = new Date();
    let startDateTime, endDateTime;
    
    switch(timeframe) {
      case 'tonight':
        startDateTime = new Date(now);
        startDateTime.setHours(18, 0, 0, 0);
        endDateTime = new Date(now);
        endDateTime.setHours(23, 59, 59, 999);
        break;
      case 'tomorrow':
        startDateTime = new Date(now);
        startDateTime.setDate(startDateTime.getDate() + 1);
        startDateTime.setHours(0, 0, 0, 0);
        endDateTime = new Date(startDateTime);
        endDateTime.setHours(23, 59, 59, 999);
        break;
      case 'this_weekend':
        const dayOfWeek = now.getDay();
        const daysUntilSaturday = dayOfWeek === 6 ? 0 : (dayOfWeek === 0 ? 6 : 6 - dayOfWeek);
        startDateTime = new Date(now);
        startDateTime.setDate(startDateTime.getDate() + daysUntilSaturday);
        startDateTime.setHours(0, 0, 0, 0);
        endDateTime = new Date(startDateTime);
        endDateTime.setDate(endDateTime.getDate() + 1);
        endDateTime.setHours(23, 59, 59, 999);
        break;
      case 'today':
        startDateTime = new Date(now);
        startDateTime.setHours(0, 0, 0, 0);
        endDateTime = new Date(now);
        endDateTime.setHours(23, 59, 59, 999);s
        break;
      default: // this_week
        startDateTime = new Date(now);
        endDateTime = new Date(now);
        endDateTime.setDate(endDateTime.getDate() + 7);
    }

    if (startDateTime && endDateTime) {
      // Remove milliseconds from ISO string for Ticketmaster API (requires format: YYYY-MM-DDTHH:mm:ssZ)
      apiUrl += `&startDateTime=${startDateTime.toISOString().replace(/\.\d{3}Z$/, 'Z')}`;
      apiUrl += `&endDateTime=${endDateTime.toISOString().replace(/\.\d{3}Z$/, 'Z')}`;
    }

    console.log('Calling Ticketmaster API');
    
    const response = await fetchWithRetry(apiUrl, { timeoutMs: 5000 });
    
    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Ticketmaster error response:', response.status, errorBody);
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const eventsList = data._embedded?.events || [];
    
    console.log('Ticketmaster returned', eventsList.length, 'events');
    
    const events = eventsList.slice(0, 10).map(event => {
      const venue = event._embedded?.venues?.[0];
      const priceRange = event.priceRanges?.[0];
      
      return {
        title: event.name,
        type: event.classifications?.[0]?.segment?.name || 'Event',
        date: new Date(event.dates.start.localDate + 'T' + (event.dates.start.localTime || '00:00:00')).toLocaleString('en-US', { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric', 
          hour: 'numeric', 
          minute: '2-digit' 
        }),
        venue: venue?.name || 'TBA',
        price: priceRange ? `$${priceRange.min}-${priceRange.max}` : 'See website',
        url: event.url,
        description: event.info || event.pleaseNote || 'Check website for details'
      };
    });

    return {
      success: true,
      events: events,
      count: events.length
    };

  } catch (error) {
    console.error('Events API error:', error.message);
    return {
      success: false,
      message: `Events service unavailable: ${error.message}`
    };
  }
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
        console.log(`? Found ${coordsPlaces.length} places in ${cityName} using coordinates`);
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
  
  console.log(`?? Executing tool: ${functionName}`, args);

  switch (functionName) {
    case 'searchNearbyAttractions': {
      let location = args.location;
      const type = args.type || 'tourist attraction';
      
      // Use browser coordinates if available and location is BROWSER_COORDS
      if (location === 'BROWSER_COORDS' && global.browserCoords) {
        location = { lat: parseFloat(global.browserCoords.lat), lon: parseFloat(global.browserCoords.lon) };
      }
      
      // Track location search (use friendly name for coordinates)
      let locationStr;
      if (typeof location === 'object') {
        locationStr = 'Current Location (GPS)';
      } else if (location && location.includes(',') && !isNaN(parseFloat(location.split(',')[0]))) {
        // If it's coordinate string like "47.6,-122.3", use friendly name
        locationStr = 'Current Location (GPS)';
      } else {
        locationStr = location;
      }
      trackLocationSearch(locationStr);
      
      const result = await findPlaces(location, type);
      const filteredPlaces = filterPlacesByType(result.places, type);
      
      // Track failed query if no results
      if (filteredPlaces.length === 0) {
        const sessionId = global.currentSessionId || 'unknown';
        trackFailedQuery(sessionId, `${type} near ${locationStr}`, 'no_results');
      }
      
      return {
        success: true,
        live: result.live,
        places: filteredPlaces,
        message: result.live 
          ? `Found ${filteredPlaces.length} ${type}(s) near ${typeof location === 'object' ? 'your location' : location}`
          : `Using fallback suggestions (live data unavailable)`
      };
    }

    case 'searchFoodPlaces': {
      let location = args.location;
      
      // Use browser coordinates if available and location is BROWSER_COORDS
      if (location === 'BROWSER_COORDS' && global.browserCoords) {
        location = { lat: parseFloat(global.browserCoords.lat), lon: parseFloat(global.browserCoords.lon) };
      }
      
      const result = await findPlaces(location, 'restaurant');
      const filteredPlaces = filterPlacesByType(result.places, 'restaurant');
      return {
        success: true,
        live: result.live,
        places: filteredPlaces,
        message: result.live
          ? `Found ${filteredPlaces.length} food & drink places near ${typeof location === 'object' ? 'your location' : location}`
          : `Using fallback suggestions (live data unavailable)`
      };
    }

    case 'searchAttractionPlaces': {
      let location = args.location;
      
      // Use browser coordinates if available and location is BROWSER_COORDS
      if (location === 'BROWSER_COORDS' && global.browserCoords) {
        location = { lat: parseFloat(global.browserCoords.lat), lon: parseFloat(global.browserCoords.lon) };
      }
      
      const result = await findPlaces(location, 'tourist attraction');
      const filteredPlaces = filterPlacesByType(result.places, 'tourist attraction');
      return {
        success: true,
        live: result.live,
        places: filteredPlaces,
        message: result.live
          ? `Found ${filteredPlaces.length} attractions near ${typeof location === 'object' ? 'your location' : location}`
          : `Using fallback suggestions (live data unavailable)`
      };
    }

    case 'searchShoppingPlaces': {
      let location = args.location;
      
      // Use browser coordinates if available and location is BROWSER_COORDS
      if (location === 'BROWSER_COORDS' && global.browserCoords) {
        location = { lat: parseFloat(global.browserCoords.lat), lon: parseFloat(global.browserCoords.lon) };
      }
      
      const result = await findPlaces(location, 'shopping');
      const filteredPlaces = filterPlacesByType(result.places, 'shopping');
      return {
        success: true,
        live: result.live,
        places: filteredPlaces,
        message: result.live
          ? `Found ${filteredPlaces.length} shopping places near ${typeof location === 'object' ? 'your location' : location}`
          : `Using fallback suggestions (live data unavailable)`
      };
    }

    case 'getHotelInfo': {
      // Try RAG semantic search first
      const ragResult = await answerWithRAG(args.query);
      
      if (ragResult && ragResult.useRAG && ragResult.sources.length > 0) {
        return {
          success: true,
          answer: ragResult.answer,
          sources: ragResult.sources,
          query: args.query,
          method: 'RAG'
        };
      }
      
      // Fall back to old Q&A search
      const answer = answerFromQnA(args.query);
      return {
        success: true,
        answer: answer || 'I don\'t have that specific information. Please contact hotel staff.',
        query: args.query,
        method: 'QnA'
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

    case 'createTicket': {
      const ticketId = `TKT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const ticket = {
        id: ticketId,
        guestName: args.guestName || 'Guest',
        roomNumber: args.roomNumber || 'Not specified',
        requestType: args.requestType,
        priority: args.priority || 'Medium',
        description: args.description,
        status: 'Open',
        createdAt: new Date().toISOString(),
        assignedTo: null,
        resolvedAt: null
      };

      try {
        if (USE_COSMOS_DB && ticketsContainer) {
          // Save to Cosmos DB
          await ticketsContainer.items.create(ticket);
          console.log(`? Ticket ${ticketId} saved to Cosmos DB`);
        } else {
          // Fallback to in-memory storage
          inMemoryTickets.push(ticket);
          console.log(`? Ticket ${ticketId} saved to in-memory storage`);
        }

        // Estimate response time based on request type
        const estimatedTime = {
          'Housekeeping': '15-20 minutes',
          'Maintenance': '30-45 minutes',
          'Room Service': '20-30 minutes',
          'Concierge': '10-15 minutes',
          'Other': '20-30 minutes'
        }[args.requestType] || '20-30 minutes';

        // Track ticket creation in analytics
        const sessionId = global.currentSessionId || 'unknown';
        trackTicket(sessionId, ticketId, args.requestType);

        return {
          success: true,
          ticketId: ticketId,
          status: 'Open',
          requestType: args.requestType,
          estimatedTime: estimatedTime,
          message: `Your request has been submitted successfully. Ticket #${ticketId}. Our ${args.requestType.toLowerCase()} team will assist you within ${estimatedTime}.`
        };
      } catch (error) {
        console.error('Error creating ticket:', error);
        return {
          success: false,
          error: 'Failed to create ticket. Please contact the front desk directly.'
        };
      }
    }

    case 'updateGuestProfile': {
      const sessionId = global.currentSessionId; // Will be set from request handler
      if (!sessionId) {
        return { success: false, error: 'No session ID available' };
      }

      try {
        let profile = await getGuestProfile(sessionId);
        if (!profile) {
          profile = createNewProfile(sessionId);
        }

        // Update profile fields if provided
        if (args.interests && args.interests.length > 0) {
          profile.interests = [...new Set([...profile.interests, ...args.interests])]; // Merge unique
        }
        if (args.dietary && args.dietary.length > 0) {
          profile.dietary = [...new Set([...profile.dietary, ...args.dietary])];
        }
        if (args.language) {
          profile.language = args.language;
        }
        if (args.mobility) {
          profile.mobility = args.mobility;
        }

        profile.onboardingComplete = true;
        profile.lastActive = new Date().toISOString();

        await saveGuestProfile(profile);

        return {
          success: true,
          message: 'Thanks! I\'ve saved your preferences and will tailor my suggestions to your interests.',
          profile: {
            interests: profile.interests,
            dietary: profile.dietary
          }
        };
      } catch (error) {
        console.error('Error updating profile:', error);
        return {
          success: false,
          error: 'Failed to save preferences'
        };
      }
    }

    case 'getCurrentWeather': {
      try {
        const location = args.location || 'current';
        const weatherData = await fetchWeatherData(location);
        
        if (!weatherData.success) {
          return {
            success: false,
            message: weatherData.message,
            mockData: weatherData.mockData
          };
        }

        return {
          success: true,
          location: weatherData.location,
          current: weatherData.current,
          advice: weatherData.advice,
          message: `Current weather in ${weatherData.location}: ${weatherData.current.temp}°F, ${weatherData.current.condition}. ${weatherData.advice}`
        };
      } catch (error) {
        console.error('Weather tool error:', error);
        return {
          success: false,
          error: 'Failed to fetch weather data'
        };
      }
    }

    case 'searchLocalEvents': {
      try {
        const location = args.location;
        const eventType = args.eventType || 'all';
        const timeframe = args.timeframe || 'today';
        
        const eventsData = await searchEvents(location, eventType, timeframe);
        
        if (!eventsData.success) {
          return {
            success: false,
            message: eventsData.message,
            mockEvents: eventsData.mockEvents
          };
        }

        return {
          success: true,
          events: eventsData.events,
          count: eventsData.count,
          message: `Found ${eventsData.count} events in ${location}`
        };
      } catch (error) {
        console.error('Events search tool error:', error);
        return {
          success: false,
          error: 'Failed to search events'
        };
      }
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

async function handleAzureAIAgent(userMessage, conversationHistory = [], guestProfile = null, browserCoords = null) {
  if (!azureOpenAIClient) {
    throw new Error('Azure OpenAI client not initialized');
  }

  // Store browser coordinates globally for tool access
  global.browserCoords = browserCoords;

  // Check if this is a new guest (no profile) for onboarding
  const isNewGuest = !guestProfile || !guestProfile.onboardingComplete;
  const locationContext = browserCoords
    ? `\n\nUSER LOCATION (browser coordinates shared):
    - Latitude: ${browserCoords.lat}
    - Longitude: ${browserCoords.lon}
    - When user says "near me", "nearby", "around here", use BROWSER_COORDS as the location parameter instead of a city name.`
    : '';

  const profileContext = guestProfile && guestProfile.onboardingComplete
    ? `\n\nGUEST PROFILE (use to personalize recommendations):
    - Interests: ${guestProfile.interests.join(', ') || 'not specified'}
    - Dietary: ${guestProfile.dietary.join(', ') || 'no restrictions'}
    - Language: ${guestProfile.language || 'en'}
    - Mobility: ${guestProfile.mobility || 'none'}
    
    When suggesting places, PRIORITIZE options matching their interests and dietary preferences.`
    : '';

  const onboardingPrompt = isNewGuest
    ? `\n\nONBOARDING (GUEST NEEDS PROFILE SETUP):
    
    Current Status:
    - Interests saved: ${guestProfile.interests.length > 0 ? guestProfile.interests.join(', ') : 'NO'}
    - Dietary saved: ${guestProfile.dietary.length > 0 ? guestProfile.dietary.join(', ') : 'NO'}
    
    STEP 1 - If NO interests saved yet:
      Ask: "Welcome! To help you better, what are you most interested in during your stay? (Food & Dining, Arts & Culture, Outdoor Activities, Shopping, Nightlife, Family Fun)"
      When they respond with ANY keyword (food/dining/art/culture/outdoor/shopping/nightlife/family):
        -> Call updateGuestProfile with interests: ["Food & Dining"] (or matching category)
        -> DO NOT ask the interests question again
    
    STEP 2 - If interests ARE saved but NO dietary saved:
      Ask: "Great! Any dietary preferences I should know about? (Vegetarian, Vegan, Halal, Kosher, Gluten-free, No restrictions)"
      When they respond with ANY keyword (vegetarian/vegan/halal/kosher/gluten/no):
        -> Call updateGuestProfile with dietary: ["Vegan"] (or matching option)
        -> DO NOT ask the dietary question again
    
    STEP 3 - After BOTH are saved:
      Say: "Perfect! I've saved your preferences. How can I help you today?"
    
    CRITICAL: If user responds with a single word answer like "food" or "vegan", this IS their answer to your question. Call updateGuestProfile immediately with the matching category. DO NOT repeat the question.`
    : '';

  // Build conversation messages
  const messages = [
    {
      role: 'system',
      content: `You are a warm and experienced hotel concierge AI assistant dedicated to making every guest's stay exceptional.

Your personality:
- Professional yet genuinely friendly and approachable
- Attentive to details and anticipate guest needs
- Patient and understanding, especially with first-time visitors
- Enthusiastic about helping guests discover great experiences
- Express care through your responses (e.g., "I'd be happy to help with that!", "Great choice!", "I hope you enjoy!")

You help guests with:
- Finding wonderful nearby attractions, restaurants, and places to visit
- Answering hotel-related questions (check-in/out, amenities, WiFi, etc.) - ALWAYS use getHotelInfo tool for these
- Providing transportation information and local insights
- Creating service tickets for guest requests with care and urgency
- Collecting guest preferences for thoughtful, personalized recommendations
- General hospitality assistance with a smile

IMPORTANT: For ANY question about the hotel (policies, amenities, services, facilities), you MUST call the getHotelInfo tool. Never answer hotel questions from general knowledge.

Communication style:
- Start conversations warmly and welcome guests genuinely
- Use phrases like "I'd be delighted to help", "Wonderful!", "Let me find that for you"
- End interactions with encouraging notes like "Enjoy your visit!", "Have a great time!", or "Please let me know if you need anything else"
- Be conversational but maintain professionalism
${locationContext}${profileContext}${onboardingPrompt}

  CRITICAL RULES for place searches - FOLLOW EXACTLY:
    1. ALWAYS call exactly ONE search tool for place discovery per user message.
    2. Tool selection:
      - Food / restaurants / cafe / bar queries -> use searchFoodPlaces
      - Museums / parks / theatre / attractions -> use searchAttractionPlaces
      - Shopping / mall / market / store queries -> use searchShoppingPlaces
      - Mixed / unclear / generic "things to do" -> use searchNearbyAttractions with appropriate type parameter
    3. Never fabricate or supplement places beyond the returned "places" array.
    4. Response formatting after tool call:
      - If live=true: Begin with "Here are some great options:" and list ONLY the places.
      - If live=false: Begin with "I apologize for the inconvenience. Here are some general suggestions:" and list ONLY fallback places.
    5. DO NOT apologize when live=true.
    6. NEVER add locations from memory (e.g., "Agashiye", "Swati Snacks") unless they were returned.
    7. If user asks follow-up clarifications about listed places, you may describe ONLY fields you received (name, type); otherwise re-run an appropriate search tool if needing fresh results.

  ?? TICKET CREATION RULES - WHEN TO CREATE TICKETS:
    CREATE TICKET (use createTicket tool) for service requests requiring staff action:
      ? Housekeeping: "need extra towels", "clean my room", "fresh linens", "replace amenities", "need toilet paper"
      ? Maintenance: "AC not working", "TV broken", "leaky faucet", "WiFi not connecting in room"
      ? Room Service: "order breakfast", "food delivery to room"
      ? Concierge: "book a taxi", "arrange airport shuttle", "store luggage", "dinner reservation"
    
    DO NOT create ticket (answer directly) for information queries:
      ? "What time is checkout?" ? Answer from knowledge
      ? "Where is the gym?" ? Provide information
      ? "What's the WiFi password?" ? Give the answer
      ? "Find restaurants nearby" ? Use search tools
    
    When creating tickets:
      - If you have ALL required info (requestType + description), create ticket immediately
      - If missing optional info (room number, guest name), ASK ONCE then create ticket with what you have
      - If guest provides just a number (e.g., "208"), check conversation history - if they mentioned a service request recently, use that number as roomNumber
      - Classify requestType accurately: Housekeeping, Maintenance, Room Service, Concierge
      - Set priority: Low (non-urgent), Medium (standard), High (guest inconvenienced), Urgent (guest comfort affected)
      - Use clear description from guest's request
      - After ticket created, inform guest with ticket number and estimated time
    
    CRITICAL: FOLLOW-UP CONTEXT HANDLING
      - Review the ENTIRE conversation history before responding
      - If you previously asked for room number and guest responds with ONLY a number, that IS their room number
      - Example conversation flow:
        * Guest: "need toilet paper"
        * You: "Could you provide your room number?"
        * Guest: "208"  ? THIS IS THE ROOM NUMBER, CREATE TICKET NOW
      - Do NOT ask "what do you need" again if context is clear from previous messages
      - If guest provides a number after you asked for room/guest info, USE IT and create the ticket immediately
  
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
      console.log(`?? Agent requested ${assistantMessage.tool_calls.length} tool call(s)`);
      
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
    console.error('? Azure AI Agent error:', error);
    throw error;
  }
}

// ============================================
// MAIN API ENDPOINT
// ============================================

app.post('/api/message', async (req, res) => {
  try {
    const { sessionId = 'anon', message = '', consentLocation = false, coords, city, conversationHistory = [] } = req.body;

    // Track the question in analytics
    trackQuestion(sessionId, message);

    if (activeRequests.get(sessionId)) {
      return res.json({ 
        reply: "I'm processing your previous request. Please wait a moment before sending another.", 
        queued: false 
      });
    }
    activeRequests.set(sessionId, true);

    // Load guest profile
    let guestProfile = await getGuestProfile(sessionId);
    if (!guestProfile) {
      guestProfile = createNewProfile(sessionId);
      await saveGuestProfile(guestProfile); // Create profile on first interaction
    } else {
      // Update last active timestamp
      guestProfile.lastActive = new Date().toISOString();
      await saveGuestProfile(guestProfile);
    }

    // Make session ID available for tool execution
    global.currentSessionId = sessionId;

    let result;

    // Use Azure AI Agent if available, otherwise fall back to original logic
    if (USE_AZURE_AI && azureOpenAIClient) {
      try {
        console.log('?? Using Azure AI Agent for message:', message);
        const browserCoords = consentLocation && coords ? coords : null;
        if (browserCoords) {
          console.log('?? Browser location shared:', browserCoords);
        }
        result = await handleAzureAIAgent(message, conversationHistory, guestProfile, browserCoords);
      } catch (error) {
        console.error('Azure AI Agent failed, falling back to original logic:', error.message);
        // Fall back to original logic if Azure AI fails
        result = await handleOriginalLogic(message, consentLocation, coords, city, guestProfile);
      }
    } else {
      console.log('?? Using original logic (Azure AI not configured)');
      result = await handleOriginalLogic(message, consentLocation, coords, city, guestProfile);
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
async function handleOriginalLogic(message, consentLocation, coords, city, guestProfile) {
  const intent = detectIntent(message);
  let reply = '';
  let suggestions = null;
  let liveLookup = null;

  // Check if this is a new guest needing onboarding
  const isNewGuest = !guestProfile || !guestProfile.onboardingComplete;
  
  if (intent === 'greet' && isNewGuest) {
    // First greeting - ask about interests
    if (!guestProfile.interests || guestProfile.interests.length === 0) {
      reply = 'Welcome! To help you better, what are you most interested in during your stay? (Food & Dining, Arts & Culture, Outdoor Activities, Shopping, Nightlife, or Family Fun)';
    } 
    // If they have interests but no dietary info
    else if (!guestProfile.dietary || guestProfile.dietary.length === 0) {
      reply = 'Great! Any dietary preferences I should know about? (Vegetarian, Vegan, Halal, Kosher, Gluten-free, or No restrictions)';
    }
    // Onboarding complete
    else {
      guestProfile.onboardingComplete = true;
      await saveGuestProfile(guestProfile);
      reply = 'Perfect! I\'ve saved your preferences. How can I help you today?';
    }
  } else if (intent === 'greet') {
    reply = 'Hello - welcome! How can I help you today?';
  } else if (intent === 'hotel_info') {
    const qnaAns = answerFromQnA(message);
    reply = qnaAns || "I don't have that info right now - would you like me to connect you to hotel staff?";
  } else if (intent === 'dining') {
    if (/order|room service|reserve|reservation/.test(message.toLowerCase())) {
      reply = 'I can help with room service or reservations - do you want to order now or make a reservation? Please tell me dish or cuisine and party size.';
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
          : "I couldn't fetch live attraction data right now - here are general suggestions instead.";
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
    // Check if message might be answering onboarding questions
    if (isNewGuest) {
      const lowerMsg = message.toLowerCase();
      
      // Check if they're answering interests question
      if (!guestProfile.interests || guestProfile.interests.length === 0) {
        const interestMatches = ['food', 'dining', 'art', 'culture', 'outdoor', 'shopping', 'nightlife', 'family'];
        if (interestMatches.some(keyword => lowerMsg.includes(keyword))) {
          // Save their interest
          if (lowerMsg.includes('food') || lowerMsg.includes('dining')) guestProfile.interests.push('Food & Dining');
          if (lowerMsg.includes('art') || lowerMsg.includes('culture')) guestProfile.interests.push('Arts & Culture');
          if (lowerMsg.includes('outdoor')) guestProfile.interests.push('Outdoor Activities');
          if (lowerMsg.includes('shopping')) guestProfile.interests.push('Shopping');
          if (lowerMsg.includes('nightlife')) guestProfile.interests.push('Nightlife');
          if (lowerMsg.includes('family')) guestProfile.interests.push('Family Fun');
          
          await saveGuestProfile(guestProfile);
          reply = 'Great! Any dietary preferences I should know about? (Vegetarian, Vegan, Halal, Kosher, Gluten-free, or No restrictions)';
          return { intent: 'onboarding', reply, suggestions, liveLookup };
        }
      }
      
      // Check if they're answering dietary question
      if (guestProfile.interests && guestProfile.interests.length > 0 && 
          (!guestProfile.dietary || guestProfile.dietary.length === 0)) {
        const dietaryMatches = ['vegetarian', 'vegan', 'halal', 'kosher', 'gluten', 'no restriction', 'none', 'no'];
        if (dietaryMatches.some(keyword => lowerMsg.includes(keyword))) {
          // Save dietary preference
          if (lowerMsg.includes('vegetarian')) guestProfile.dietary.push('Vegetarian');
          if (lowerMsg.includes('vegan')) guestProfile.dietary.push('Vegan');
          if (lowerMsg.includes('halal')) guestProfile.dietary.push('Halal');
          if (lowerMsg.includes('kosher')) guestProfile.dietary.push('Kosher');
          if (lowerMsg.includes('gluten')) guestProfile.dietary.push('Gluten-free');
          if (lowerMsg.includes('no restriction') || lowerMsg.includes('none') || lowerMsg === 'no') {
            guestProfile.dietary.push('No restrictions');
          }
          
          guestProfile.onboardingComplete = true;
          await saveGuestProfile(guestProfile);
          reply = 'Perfect! I\'ve saved your preferences. How can I help you today?';
          return { intent: 'onboarding', reply, suggestions, liveLookup };
        }
      }
    }
    
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

// Analytics API endpoint
app.get('/api/analytics', (req, res) => {
  try {
    res.json(analytics);
  } catch (error) {
    console.error('Analytics API error:', error);
    res.status(500).json({ error: 'Failed to retrieve analytics' });
  }
});

// Serve analytics dashboard
app.get('/analytics', (req, res) => {
  res.sendFile(path.join(__dirname, 'analytics-dashboard.html'));
});

app.listen(PORT, async () => {
  console.log(`?? AI Concierge with Azure AI listening on http://localhost:${PORT}`);
  console.log(`   Azure AI Agent: ${USE_AZURE_AI ? '? Enabled' : '? Disabled'}`);
  console.log(`   Analytics Dashboard: http://localhost:${PORT}/analytics`);
  
  // Initialize RAG system after server starts
  if (USE_AZURE_AI && azureOpenAIClient && hotelKnowledge.length > 0) {
    console.log('\\n?? Initializing RAG system...');
    await initializeRAG();
    console.log('?? RAG System Status:', ragInitialized ? '? Ready' : '? Not Available');
  } else {
    console.log('\\n\u26a0\ufe0f  RAG system disabled (requires Azure OpenAI and hotel_knowledge.json)');
  }
  
  console.log('\\n??? Server ready! Try asking hotel questions to test RAG semantic search.\\n');
});

