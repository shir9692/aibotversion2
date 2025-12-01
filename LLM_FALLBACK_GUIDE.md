# 🤖 LLM Fallback Implementation - Testing & Usage Guide

## System Overview

Your AI Concierge now uses a **3-tier intelligent fallback system** for answering hotel questions:

```
┌─────────────────────────────────────────────────────────────┐
│                    USER QUERY                               │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  TIER 1: RAG │
                    │ (Knowledge   │
                    │  Base Search)│
                    └──────┬──────┘
                           │
          ┌────────────────┴────────────────┐
          │                                 │
      Found?                            Not Found?
       (>0.7)                            (<0.7)
          │                                 │
       ✅ Return                      ┌──────▼──────┐
       with Sources               │  TIER 2: LLM  │
                              │  (Azure OpenAI)│
                              └──────┬──────┘
                                     │
                        ┌────────────┴────────────┐
                        │                         │
                    Success?                 Error?
                        │                         │
                     ✅ Return            ┌──────▼──────┐
                   LLM Answer           │ TIER 3: QnA  │
                                        │(Keyword-based)
                                        └──────┬──────┘
                                               │
                                        ┌──────┴──────┐
                                        │             │
                                    Found?         Not Found?
                                        │             │
                                     ✅ Return    ✅ Return
                                   QnA Answer   "Contact Staff"
```

---

## Current Implementation Status

✅ **Deployed**: Production-ready  
✅ **LLM**: Azure OpenAI (GPT-4 compatible)  
✅ **RAG**: 15 hotel knowledge documents with embeddings  
✅ **Tracking**: Full analytics and logging  

---

## Test Cases

### Test 1: RAG Match (Tier 1 - Should Succeed)

**Query**: "What time is breakfast?"

**Expected Flow**:
1. RAG semantic search finds match in knowledge base
2. Returns document with high similarity (>0.7)
3. Logs: `✅ Answered using RAG with 1 sources`

**Analytics**:
- Method: `RAG`
- Confidence: 0.85+ (high)
- Response time: <500ms

---

### Test 2: LLM Fallback (Tier 2 - RAG Miss, LLM Hit)

**Query**: "Can I get a wake-up call at 6 AM?"

**Expected Flow**:
1. RAG searches knowledge base → No match
2. Logs: `⚠️  RAG found no matches for: "..."`
3. LLM fallback triggers
4. Azure OpenAI generates: "Yes, we can arrange a wake-up call. Please call the front desk..."
5. Logs: `🤖 Attempting LLM fallback (RAG had no matches)...`
6. Logs: `✅ LLM fallback generated response`

**Analytics**:
- Method: `LLM_FALLBACK`
- Confidence: 0.5 (lower than RAG)
- Response time: 1-3s (includes LLM latency)

---

### Test 3: QnA Fallback (Tier 3 - All Miss)

**Query**: "Something completely random xyz"

**Expected Flow**:
1. RAG: No match
2. LLM: No relevant answer
3. QnA: No keyword match
4. Returns: "I don't have that specific information. Please contact hotel staff."

**Analytics**:
- Method: `NONE`
- Knowledge gap tracked

---

### Test 4: Complex Scenario (Multi-step)

**Conversation**:
1. User: "What are your room rates?" → RAG match ✅
2. User: "Can I negotiate?" → LLM fallback 🤖
3. User: "What's the WiFi password?" → RAG match ✅

---

## Monitoring & Analytics

### View Real-Time Analytics

```
Dashboard: http://localhost:3000/analytics
```

**Metrics Available**:
- Total messages processed
- RAG vs LLM vs QnA distribution
- Average response times by method
- Knowledge gaps (questions with no answers)
- Guest satisfaction ratings
- Deflection rate (% handled without staff contact)

---

## Server Logs - What to Look For

### Successful RAG Match
```
🔍 Semantic search found 1 relevant documents (threshold: 0.7)
✅ Answered using RAG with 1 sources
```

### Successful LLM Fallback
```
⚠️  RAG found no matches for: "Can I request early checkout?"
🤖 Attempting LLM fallback (RAG had no matches)...
✅ LLM fallback generated response
```

### QnA Fallback
```
📋 Answered using keyword QnA
```

### Complete Failure (Tracked as Knowledge Gap)
```
❌ No answer found in any method for: "..."
```

---

## Performance Characteristics

### Response Times

| Method | Typical Time | Notes |
|--------|-------------|-------|
| RAG | 200-500ms | Fast (local similarity search) |
| LLM Fallback | 1-3s | Includes API call to Azure OpenAI |
| QnA | 50-100ms | Fastest (keyword lookup) |

### Cost Per Query

| Method | Tokens | Estimated Cost |
|--------|--------|-----------------|
| RAG | ~50 (embedding only) | $0.0001 |
| LLM Fallback | ~300 | $0.005-$0.01 |
| QnA | 0 | Free |

**Cost Optimization Tip**: Improve knowledge base coverage to reduce LLM fallback usage

---

## Configuration & Customization

### Adjust RAG Similarity Threshold

**Location**: `server-with-azure-ai.js`, line ~510

```javascript
const relevantDocs = scoredDocs
  .filter(doc => doc.similarity > 0.7)  // ← Change this value
  .sort((a, b) => b.similarity - a.similarity)
```

- **Higher (0.8-0.9)**: More strict, fewer RAG matches, more LLM fallbacks
- **Lower (0.5-0.6)**: More permissive, more RAG matches, fewer LLM fallbacks

### Customize LLM System Prompt

**Location**: `server-with-azure-ai.js`, line ~545

```javascript
const systemPrompt = `You are a helpful hotel concierge AI assistant...`
```

Add hotel-specific context here for better responses.

---

## Troubleshooting

### Issue: All queries returning "Contact staff"

**Diagnosis**:
1. Check if RAG initialized: Look for `✅ RAG initialized with X documents`
2. Check if Azure OpenAI is working: Look for `? Azure OpenAI initialized`
3. Check logs for errors

**Solution**:
```bash
# Verify environment variables
echo $env:AZURE_OPENAI_ENDPOINT
echo $env:AZURE_OPENAI_DEPLOYMENT_NAME
```

### Issue: LLM responses are generic/unhelpful

**Cause**: System prompt needs hotel-specific context

**Solution**: Update the LLM system prompt with:
- Hotel name and address
- Key amenities
- Policies
- Emergency contacts

### Issue: Slow responses (3+ seconds)

**Cause**: LLM fallback being triggered too often

**Solution**:
1. Expand knowledge base with more documents
2. Lower RAG similarity threshold slightly
3. Check Azure OpenAI rate limits

---

## Advanced: Manual Testing via API

### Test RAG with curl

```bash
curl -X POST http://localhost:3000/api/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -d '{
    "message": "What time is breakfast?",
    "sessionId": "test-session"
  }'
```

### Expected Response with RAG Hit
```json
{
  "reply": "Breakfast is served from 6:30 AM to 10:30 AM...",
  "method": "RAG",
  "sources": [
    {
      "title": "Hotel Breakfast Policy",
      "category": "Amenities",
      "similarity": "0.89"
    }
  ]
}
```

### Expected Response with LLM Fallback
```json
{
  "reply": "Yes, we can arrange that. Please contact the front desk...",
  "method": "LLM_FALLBACK",
  "sources": [],
  "note": "(Generated via AI - use front desk for critical policies)"
}
```

---

## Knowledge Base Management

### Current Knowledge Base (15 documents)

View: `hotel_knowledge.json`

**Categories covered**:
- Hotel Policies
- Amenities
- Services
- Dining
- Transportation
- Rooms

### Adding New Documents

Edit `hotel_knowledge.json` and add:

```json
{
  "title": "Your Document Title",
  "category": "Category Name",
  "content": "Detailed information about the topic..."
}
```

Then restart the server - RAG will automatically regenerate embeddings.

---

## Success Metrics

Track these to ensure system is working well:

| Metric | Target | Current |
|--------|--------|---------|
| RAG match rate | >60% | ? (Check dashboard) |
| LLM fallback rate | <30% | ? (Check dashboard) |
| Avg response time | <1s | ? (Check dashboard) |
| Knowledge gaps | <10% | ? (Check dashboard) |
| Guest satisfaction | >4.0/5 | ? (Check ratings) |
| Deflection rate | >80% | ? (Check dashboard) |

---

## Next Steps

### Short Term
1. ✅ Test all three fallback paths
2. ✅ Monitor analytics dashboard
3. ✅ Check server logs for errors

### Medium Term
1. Expand knowledge base with more documents
2. Fine-tune LLM system prompt for your hotel
3. Set up alerts for knowledge gaps
4. Optimize RAG similarity threshold

### Long Term
1. Collect guest feedback on responses
2. Retrain embeddings periodically
3. Add domain-specific terminology
4. Integrate with ticketing system for staff escalation

---

## Support & Debugging

### Server Health Check

```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "status": "ok",
  "azureAI": true
}
```

### View All Endpoints

- Chat API: `POST /api/message`
- Analytics: `GET /api/analytics`
- Health: `GET /api/health`
- Dashboard: `http://localhost:3000/analytics`

---

## Questions?

Check the server logs with:

```bash
# In terminal where server is running, look for:
# ✅ (success indicators)
# ⚠️  (warnings)
# 🤖 (LLM activity)
# 🔍 (RAG search results)
```

Each query will show which tier (RAG/LLM/QnA) answered it!
