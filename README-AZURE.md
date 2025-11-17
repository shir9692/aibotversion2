# AI Chatbot Concierge with Azure OpenAI Integration

An intelligent hotel concierge chatbot powered by Azure OpenAI that helps guests with:
- 🗺️ Finding nearby attractions using OpenStreetMap
- 🏨 Answering hotel-related questions
- 🚕 Transportation information
- 🍽️ Dining recommendations

## 🆕 What's New - Azure AI Integration

This chatbot now features:
- **Azure OpenAI GPT-4 Agent** for intelligent, context-aware conversations
- **Function Calling** - Agent automatically searches locations and retrieves information
- **Multi-turn Conversations** with memory
- **Managed Identity Security** - No API keys in code
- **Auto-scaling** on Azure App Service

## 🚀 Quick Start

### Option 1: Automated Azure Deployment (Recommended)

```powershell
# Run the automated setup script
.\deploy-to-azure.ps1
```

This will automatically:
- Create Azure resources (OpenAI, App Service, etc.)
- Configure managed identity and permissions
- Set up environment variables
- Provide you with deployment URLs

### Option 2: Manual Setup

See [azure-setup.md](azure-setup.md) for detailed step-by-step instructions.

## 💻 Local Development

### Prerequisites
- Node.js 18+
- Azure account (for Azure OpenAI)

### Setup

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/shir9692/ai-chatbot-concierge.git
   cd ai-chatbot-concierge
   cp package-azure.json package.json
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add your Azure OpenAI credentials:
   ```env
   AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
   AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4
   AZURE_OPENAI_API_KEY=your-api-key  # For local dev only
   ```

3. **Run locally:**
   ```bash
   npm start
   ```

   Visit http://localhost:3000

### Run Original Version (without Azure AI)

```bash
npm run start:original
```

## 📁 Project Structure

```
ai-chatbot-concierge/
├── server.js                    # Original server (rule-based)
├── server-with-azure-ai.js      # Enhanced server with Azure OpenAI
├── index.html                   # Frontend UI
├── qna.json                     # FAQ knowledge base
├── fallback_places.json         # Default suggestions
├── package.json                 # Original dependencies
├── package-azure.json           # Azure-enabled dependencies
├── .env.example                 # Environment template
├── deploy-to-azure.ps1          # Automated Azure setup script
├── azure-setup.md               # Detailed setup guide
└── .github/workflows/
    └── azure-deploy.yml         # CI/CD pipeline

```

## 🤖 How It Works

### Azure AI Agent Architecture

1. **User sends message** → Frontend
2. **Frontend** → POST /api/message → Backend
3. **Backend** evaluates:
   - If Azure AI is configured → Use intelligent agent
   - Otherwise → Use original rule-based logic
4. **Azure AI Agent**:
   - Analyzes user intent
   - Decides which tools to call (search attractions, get hotel info, etc.)
   - Executes function calls
   - Generates natural language response
5. **Response with suggestions** → Frontend
6. **Frontend displays** results + map markers

### Agent Tools

The Azure AI agent has access to these functions:

- `searchNearbyAttractions(location, type)` - Search POIs via OpenStreetMap
- `getHotelInfo(query)` - Answer hotel questions from FAQ
- `getTransportationInfo(transportType)` - Provide transport options

## 🌐 Deployment Options

### Azure App Service (Recommended)
- Managed platform, auto-scaling
- Integrated with Azure OpenAI via Managed Identity
- See [azure-setup.md](azure-setup.md)

### Azure Functions
- Serverless, pay-per-execution
- Good for sporadic usage

### Docker Container
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package-azure.json package.json
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "server-with-azure-ai.js"]
```

## 🧪 Testing

Try these example queries:

1. **Location search:**
   - "Find tourist attractions near San Francisco"
   - "Show me restaurants in Paris"
   - "What's there to do near the Eiffel Tower?"

2. **Hotel info:**
   - "What time is check-out?"
   - "What's the WiFi password?"
   - "Do you have breakfast?"

3. **Transportation:**
   - "I need a taxi to the airport"
   - "How do I get to downtown?"

4. **Conversation:**
   - Have a natural back-and-forth conversation!

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `AZURE_OPENAI_ENDPOINT` | Your Azure OpenAI endpoint URL | Yes (for AI) |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | Model deployment name (e.g., gpt-4) | Yes (for AI) |
| `AZURE_OPENAI_API_KEY` | API key (local dev only) | No |
| `AZURE_OPENAI_API_VERSION` | API version | No (defaults to 2024-08-01-preview) |
| `PORT` | Server port | No (defaults to 3000) |
| `QNA_DEBUG` | Enable QnA debug logging | No |

## 📊 Monitoring

### View Azure Logs
```bash
az webapp log tail --name <your-app-name> --resource-group rg-ai-concierge
```

### Check Health
```bash
curl https://<your-app-name>.azurewebsites.net/api/health
```

Response includes Azure AI status:
```json
{
  "status": "ok",
  "azureAI": true
}
```

## 💰 Cost Estimation

**Development/Testing:**
- Azure App Service B1: ~$13/month
- Azure OpenAI: Pay-per-token
  - GPT-4: $0.03/1K input tokens, $0.06/1K output tokens
  - Estimated: $5-20/month for light usage

**Production:**
- App Service P1V2: ~$73/month
- Azure OpenAI: Scale with usage

## 🛠️ Troubleshooting

### Azure AI not working

1. Check environment variables:
   ```bash
   az webapp config appsettings list --name <app-name> --resource-group <rg-name>
   ```

2. Verify managed identity has permission:
   ```bash
   az role assignment list --assignee <principal-id>
   ```

3. Check logs for errors

### OpenStreetMap API rate limits

- Nominatim: 1 request/second
- Overpass: Fair use policy
- Consider caching results

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally and on Azure
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file

## 🙏 Acknowledgments

- OpenStreetMap for location data
- Azure OpenAI for AI capabilities
- Fuse.js for fuzzy matching

## 📞 Support

For issues and questions:
- GitHub Issues: https://github.com/shir9692/ai-chatbot-concierge/issues
- Azure OpenAI access: https://aka.ms/oai/access

---

**Made with ❤️ using Azure OpenAI and OpenStreetMap**
