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
const auth = require('./auth');

// Azure Text Analytics Setup (Sentiment Analysis)
const { TextAnalyticsClient, AzureKeyCredential } = require('@azure/ai-text-analytics');
let textAnalyticsClient = null;
if (process.env.AZURE_TEXT_ANALYTICS_ENDPOINT && process.env.AZURE_TEXT_ANALYTICS_KEY) {
  textAnalyticsClient = new TextAnalyticsClient(
    process.env.AZURE_TEXT_ANALYTICS_ENDPOINT,
    new AzureKeyCredential(process.env.AZURE_TEXT_ANALYTICS_KEY)
  );
  console.log('✓ Azure Text Analytics initialized for sentiment analysis');
} else {
  console.warn('Azure Text Analytics not configured. Sentiment analysis will be disabled.');
}

const app = express();

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

...existing code...