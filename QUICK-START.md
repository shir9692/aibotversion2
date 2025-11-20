# 🚀 Quick Reference - Azure AI Integration

## Files Created
✅ `server-with-azure-ai.js` - Enhanced Node.js server with Azure OpenAI Agent
✅ `package-azure.json` - Dependencies including Azure OpenAI SDK
✅ `.env.example` - Environment configuration template
✅ `deploy-to-azure.ps1` - Automated Azure setup script (PowerShell)
✅ `azure-setup.md` - Detailed step-by-step setup guide
✅ `.github/workflows/azure-deploy.yml` - GitHub Actions CI/CD pipeline
✅ `README-AZURE.md` - Updated documentation

## 🎯 Fastest Path to Deploy

### For Quick Testing (10 minutes):
```powershell
# 1. Run automated setup
.\deploy-to-azure.ps1

# 2. Install dependencies locally
cp package-azure.json package.json
npm install

# 3. Create .env from output of script
# (Script saves credentials to azure-credentials.txt)

# 4. Test locally
npm start

# 5. Deploy to Azure
npm install
Compress-Archive -Path * -DestinationPath deploy.zip -Force
az webapp deployment source config-zip --resource-group rg-ai-concierge --name <your-app-name> --src deploy.zip
```

### For Production (with GitHub Actions):
```powershell
# 1. Run automated setup
.\deploy-to-azure.ps1

# 2. Create Service Principal
az ad sp create-for-rbac --name "github-ai-concierge" --role contributor --scopes "/subscriptions/<sub-id>/resourceGroups/rg-ai-concierge" --sdk-auth

# 3. Add GitHub Secrets (Settings → Secrets):
#    - AZURE_CREDENTIALS (JSON from step 2)
#    - AZURE_OPENAI_ENDPOINT (from script output)
#    - AZURE_OPENAI_DEPLOYMENT_NAME (gpt-4)

# 4. Update .github/workflows/azure-deploy.yml with your app name

# 5. Push to GitHub
git add .
git commit -m "Add Azure AI integration"
git push origin main
```

## 🔑 Key Changes to Your Code

### 1. Added Azure OpenAI Client
```javascript
const { AzureOpenAI } = require('openai');
const { DefaultAzureCredential } = require('@azure/identity');

// Managed Identity (production)
const credential = new DefaultAzureCredential();
const azureOpenAIClient = new AzureOpenAI({
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  azureADTokenProvider: getBearerTokenProvider(credential, scope)
});
```

### 2. Agent Tools for Your Functions
```javascript
const agentTools = [
  {
    type: 'function',
    function: {
      name: 'searchNearbyAttractions',
      description: 'Search for tourist attractions...',
      parameters: { location: 'string', type: 'string' }
    }
  }
];
```

### 3. Smart Routing
```javascript
// Use Azure AI if configured, otherwise original logic
if (USE_AZURE_AI && azureOpenAIClient) {
  result = await handleAzureAIAgent(message);
} else {
  result = await handleOriginalLogic(message);
}
```

## 📝 Environment Variables You Need

**For Local Development:**
```env
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4
AZURE_OPENAI_API_KEY=<your-key>  # Local dev only
PORT=3000
```

**For Azure (automatically set by script):**
- AZURE_OPENAI_ENDPOINT
- AZURE_OPENAI_DEPLOYMENT_NAME
- AZURE_OPENAI_API_VERSION
- PORT=8080

## 🧪 Test Queries

Once deployed, try:
1. "Find attractions near Tokyo"
2. "What time is breakfast?"
3. "I need to get to the airport"
4. "Show me museums in London"

## 💡 What the Agent Does

**Your Original Bot:**
- Rule-based intent detection
- Direct API calls to OpenStreetMap
- Fixed response templates

**New Azure AI Agent:**
- ✨ Natural language understanding (GPT-4)
- 🔧 Automatic function calling
- 💬 Multi-turn conversations
- 🎯 Context-aware responses
- 🔄 Learns from conversation flow

## 🎬 Demo Flow

```
User: "Find me things to do near San Francisco"
  ↓
Agent: Understands intent → Calls searchNearbyAttractions("San Francisco")
  ↓
Your Code: Fetches from OpenStreetMap/Overpass
  ↓
Agent: Formats response naturally
  ↓
User sees: "Here are the top attractions near San Francisco: 
            1. Golden Gate Bridge, 2. Alcatraz Island..."
```

## 🚨 Troubleshooting

| Issue | Solution |
|-------|----------|
| "az not recognized" | Install Azure CLI: `winget install -e --id Microsoft.AzureCLI` |
| Azure login fails | Run `az login` in new terminal |
| OpenAI access denied | Apply for access: https://aka.ms/oai/access |
| 401 Unauthorized | Check managed identity role assignment |
| Function not called | Verify tool definitions match function names |
| No response | Check logs: `az webapp log tail` |

## 📊 Cost Tracking

Monitor your usage:
```bash
# OpenAI usage
az monitor metrics list --resource <openai-resource-id> --metric "TokenCount"

# App Service costs
az consumption usage list --start-date 2025-11-01 --end-date 2025-11-14
```

## 🎓 Next Steps After Deployment

1. **Add Conversation History**: Store in Azure Cosmos DB
2. **Add Voice**: Integrate Azure Speech Services
3. **Add Images**: Use Azure Computer Vision for attraction photos
4. **Add Analytics**: Enable Application Insights
5. **Add Auth**: Integrate Azure AD B2C for guest login

## 📞 Commands Cheat Sheet

```bash
# Azure Resources
az group list
az webapp list --resource-group rg-ai-concierge
az cognitiveservices account list --resource-group rg-ai-concierge

# Logs & Debugging
az webapp log tail --name <app-name> --resource-group rg-ai-concierge
az webapp log download --name <app-name> --resource-group rg-ai-concierge

# Restart & Config
az webapp restart --name <app-name> --resource-group rg-ai-concierge
az webapp config appsettings list --name <app-name> --resource-group rg-ai-concierge

# Clean Up
az group delete --name rg-ai-concierge --yes --no-wait
```

## 🎉 Success Checklist

- [ ] Ran `deploy-to-azure.ps1` successfully
- [ ] Azure OpenAI service created
- [ ] Web App deployed
- [ ] Managed Identity configured
- [ ] Tested locally with npm start
- [ ] Deployed to Azure
- [ ] Tested live URL
- [ ] Set up GitHub Actions (optional)
- [ ] Reviewed logs for errors
- [ ] Tested all agent functions

## 💬 Support

- **Code Issues**: GitHub Issues
- **Azure Issues**: Azure Portal → Support
- **OpenAI Access**: https://aka.ms/oai/access

---
**You're all set! Your chatbot now has Azure AI superpowers! 🚀**
