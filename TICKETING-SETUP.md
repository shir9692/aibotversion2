# Guest Ticketing System Setup

## Overview
The AI Concierge now includes automatic ticket creation for guest service requests (housekeeping, maintenance, room service, concierge).

## Features
- ✅ Automatic ticket creation via natural language
- ✅ Azure Cosmos DB storage (with in-memory fallback)
- ✅ Ticket tracking with unique IDs
- ✅ Estimated response times
- ✅ Priority levels (Low, Medium, High, Urgent)

---

## Quick Start (In-Memory Mode)

**No configuration needed!** The system works out-of-the-box using in-memory storage.

**Test it:**
1. Start server: `node server-with-azure-ai.js`
2. Open http://localhost:3000
3. Try: "I need extra towels" → Bot creates ticket automatically

**Note:** In-memory tickets are lost when server restarts.

---

## Production Setup (Cosmos DB)

### 1. Create Azure Cosmos DB Account

```bash
# Login to Azure
az login

# Create resource group (if needed)
az group create --name hotel-concierge-rg --location eastus

# Create Cosmos DB account (free tier available)
az cosmosdb create \
  --name hotel-concierge-cosmos \
  --resource-group hotel-concierge-rg \
  --default-consistency-level Session \
  --locations regionName=eastus \
  --enable-free-tier true

# Create database
az cosmosdb sql database create \
  --account-name hotel-concierge-cosmos \
  --resource-group hotel-concierge-rg \
  --name HotelDB

# Create container for tickets
az cosmosdb sql container create \
  --account-name hotel-concierge-cosmos \
  --resource-group hotel-concierge-rg \
  --database-name HotelDB \
  --name Tickets \
  --partition-key-path "/id"

# Get connection details
az cosmosdb keys list \
  --name hotel-concierge-cosmos \
  --resource-group hotel-concierge-rg \
  --type keys
```

### 2. Configure Environment Variables

Add to your `.env` file:

```env
# Cosmos DB Configuration (Optional - fallback to in-memory if not set)
COSMOS_ENDPOINT=https://hotel-concierge-cosmos.documents.azure.com:443/
COSMOS_KEY=your-primary-key-here
COSMOS_DATABASE=HotelDB
COSMOS_CONTAINER=Tickets
```

**Get your values:**
- `COSMOS_ENDPOINT`: From Azure Portal → Cosmos DB → Overview → URI
- `COSMOS_KEY`: From Azure Portal → Cosmos DB → Keys → Primary Key
- Or use Azure CLI output from step 1

### 3. Restart Server

```powershell
# Stop existing server (Ctrl+C)
# Restart
node server-with-azure-ai.js
```

You should see: `✓ Cosmos DB initialized for ticketing`

---

## Ticket Schema

```json
{
  "id": "TKT-1732012345678-123",
  "guestName": "John Smith",
  "roomNumber": "305",
  "requestType": "Housekeeping",
  "priority": "Medium",
  "description": "Need extra towels",
  "status": "Open",
  "createdAt": "2025-11-17T10:30:00.000Z",
  "assignedTo": null,
  "resolvedAt": null
}
```

**Request Types:**
- `Housekeeping` - Room cleaning, towels, amenities
- `Maintenance` - Repairs, AC, TV, WiFi issues
- `Room Service` - Food delivery
- `Concierge` - Bookings, transportation, recommendations
- `Other` - Miscellaneous requests

**Priority Levels:**
- `Low` - Non-urgent, can wait
- `Medium` - Standard request (default)
- `High` - Guest inconvenienced
- `Urgent` - Immediate attention needed

**Status Values:**
- `Open` - Newly created
- `In Progress` - Staff assigned
- `Resolved` - Completed
- `Closed` - Confirmed with guest

---

## How It Works

### Guest Experience

**Guest:** "I need extra towels"

**Bot Response:**
> Your request has been submitted successfully. Ticket #TKT-1732012345678-123. Our housekeeping team will assist you within 15-20 minutes.

### What Triggers Ticket Creation

**✓ Creates Ticket:**
- "I need extra towels"
- "The AC isn't working"
- "Can you order breakfast for me?"
- "Book a taxi for tomorrow"
- "My TV remote is broken"

**✗ Answers Directly (No Ticket):**
- "What time is checkout?" → Information query
- "Where is the gym?" → Facility location
- "Find restaurants in Tokyo" → Uses search tools
- "What's the WiFi password?" → Direct answer

### AI Decision Making

The Azure OpenAI agent automatically:
1. **Understands intent** - Service request vs. information query
2. **Classifies category** - Housekeeping, Maintenance, Room Service, Concierge
3. **Sets priority** - Based on urgency and guest comfort
4. **Creates ticket** - Saves to Cosmos DB or in-memory
5. **Responds to guest** - With ticket number and estimated time

---

## Viewing Tickets

### Option 1: Azure Portal
1. Go to Azure Portal → Cosmos DB
2. Select your account → Data Explorer
3. Navigate to HotelDB → Tickets → Items
4. View all tickets in JSON format

### Option 2: Query via API (Future Enhancement)

Add an admin endpoint to view/manage tickets:

```javascript
// Example: GET /api/admin/tickets
app.get('/api/admin/tickets', async (req, res) => {
  if (!ticketsContainer) {
    return res.json(inMemoryTickets);
  }
  const { resources } = await ticketsContainer.items
    .query('SELECT * FROM c ORDER BY c.createdAt DESC')
    .fetchAll();
  res.json(resources);
});
```

### Option 3: Staff Mobile App (Power Apps)

Create a no-code staff app:
1. Connect Power Apps to Cosmos DB
2. Staff can view/claim/resolve tickets
3. Push notifications for urgent tickets

---

## Estimated Response Times

| Request Type | Estimated Time |
|--------------|----------------|
| Housekeeping | 15-20 minutes  |
| Maintenance  | 30-45 minutes  |
| Room Service | 20-30 minutes  |
| Concierge    | 10-15 minutes  |
| Other        | 20-30 minutes  |

*Times are configurable in `executeToolCall()` function*

---

## Testing

### Test Scenarios

```
1. Housekeeping Request
   Guest: "I need extra towels in room 305"
   Expected: Ticket created, 15-20 min estimate

2. Maintenance Issue
   Guest: "The AC isn't working"
   Expected: Ticket created with High priority, 30-45 min

3. Information Query (No Ticket)
   Guest: "What time is breakfast?"
   Expected: Direct answer, NO ticket created

4. Mixed Request
   Guest: "Where is the gym? Also, can I get fresh linens?"
   Expected: Answers gym question + creates ticket for linens
```

### Verify Ticket Storage

```powershell
# Check logs for confirmation
# In-memory: "⚠ Ticket TKT-xxx saved to in-memory storage"
# Cosmos DB: "✓ Ticket TKT-xxx saved to Cosmos DB"
```

---

## Cost Considerations

### Cosmos DB Free Tier
- ✅ **1000 RU/s** throughput (sufficient for small-medium hotels)
- ✅ **25 GB storage** (hundreds of thousands of tickets)
- ✅ **Free for first year**, then ~$25/month

### Recommended for Production
- Use Cosmos DB for persistence
- Set up automated ticket cleanup (delete resolved tickets >30 days old)
- Monitor RU consumption via Azure Portal

### Alternative: Azure Table Storage
- Even cheaper (~$0.50/month for small workloads)
- Simpler API, but less querying flexibility
- Good option if budget is critical

---

## Troubleshooting

**Server shows warning about Cosmos DB:**
```
⚠ Cosmos DB not configured. Ticketing will use in-memory storage
```
→ This is normal if you haven't set up Cosmos DB. System works fine in-memory for testing.

**Connection error:**
```
Failed to initialize Cosmos DB: [error message]
```
→ Check `.env` variables: `COSMOS_ENDPOINT`, `COSMOS_KEY`, `COSMOS_DATABASE`, `COSMOS_CONTAINER`

**Tickets not persisting:**
→ Using in-memory mode. Set up Cosmos DB for persistence, or accept that tickets are lost on restart.

---

## Next Steps

1. ✅ **Test in-memory mode** - Try creating tickets now
2. ⏳ **Set up Cosmos DB** - Follow production setup when ready
3. 🚀 **Build staff interface** - Power Apps or custom admin panel
4. 📧 **Add notifications** - Azure Communication Services for SMS/email
5. 📊 **Analytics** - Track ticket resolution times, common requests

---

## Support

For issues or questions:
- Check server logs for error messages
- Verify Azure Cosmos DB connection in Azure Portal
- Review ticket creation logic in `server-with-azure-ai.js` (line ~595-650)
