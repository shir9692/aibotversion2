# Azure AI Integration Setup Guide

This guide will help you deploy your AI Concierge chatbot to Azure with Azure OpenAI Agent capabilities.

## Prerequisites

1. Azure account with an active subscription
2. Azure CLI installed (or use Azure Cloud Shell)
3. GitHub account
4. Node.js 18+ installed locally

## Step 1: Install Azure CLI (if not already installed)

### Windows (PowerShell as Administrator):
```powershell
winget install -e --id Microsoft.AzureCLI
```

Or download from: https://aka.ms/installazurecliwindows

## Step 2: Create Azure Resources

### 2.1 Login to Azure
```bash
az login
```

### 2.2 Set variables (replace with your values)
```bash
$RESOURCE_GROUP="rg-ai-concierge"
$LOCATION="eastus"
$OPENAI_NAME="openai-concierge-$(Get-Random -Maximum 9999)"
$WEBAPP_NAME="ai-concierge-app-$(Get-Random -Maximum 9999)"
$APP_SERVICE_PLAN="asp-ai-concierge"
```

### 2.3 Create Resource Group
```bash
az group create --name $RESOURCE_GROUP --location $LOCATION
```

### 2.4 Create Azure OpenAI Service
```bash
az cognitiveservices account create `
  --name $OPENAI_NAME `
  --resource-group $RESOURCE_GROUP `
  --kind OpenAI `
  --sku S0 `
  --location $LOCATION `
  --yes
```

### 2.5 Deploy GPT-4 Model
```bash
az cognitiveservices account deployment create `
  --name $OPENAI_NAME `
  --resource-group $RESOURCE_GROUP `
  --deployment-name gpt-4 `
  --model-name gpt-4 `
  --model-version "turbo-2024-04-09" `
  --model-format OpenAI `
  --sku-capacity 10 `
  --sku-name Standard
```

### 2.6 Get OpenAI Endpoint
```bash
$OPENAI_ENDPOINT = az cognitiveservices account show `
  --name $OPENAI_NAME `
  --resource-group $RESOURCE_GROUP `
  --query properties.endpoint `
  --output tsv

Write-Host "Azure OpenAI Endpoint: $OPENAI_ENDPOINT"
```

### 2.7 Create App Service Plan
```bash
az appservice plan create `
  --name $APP_SERVICE_PLAN `
  --resource-group $RESOURCE_GROUP `
  --sku B1 `
  --is-linux
```

### 2.8 Create Web App
```bash
az webapp create `
  --name $WEBAPP_NAME `
  --resource-group $RESOURCE_GROUP `
  --plan $APP_SERVICE_PLAN `
  --runtime "NODE:18-lts"
```

### 2.9 Enable Managed Identity
```bash
az webapp identity assign `
  --name $WEBAPP_NAME `
  --resource-group $RESOURCE_GROUP
```

### 2.10 Get Managed Identity Principal ID
```bash
$PRINCIPAL_ID = az webapp identity show `
  --name $WEBAPP_NAME `
  --resource-group $RESOURCE_GROUP `
  --query principalId `
  --output tsv

Write-Host "Managed Identity Principal ID: $PRINCIPAL_ID"
```

### 2.11 Assign OpenAI User Role to Managed Identity
```bash
az role assignment create `
  --role "Cognitive Services OpenAI User" `
  --assignee-object-id $PRINCIPAL_ID `
  --assignee-principal-type ServicePrincipal `
  --scope "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.CognitiveServices/accounts/$OPENAI_NAME"
```

### 2.12 Configure Web App Settings
```bash
az webapp config appsettings set `
  --name $WEBAPP_NAME `
  --resource-group $RESOURCE_GROUP `
  --settings `
    AZURE_OPENAI_ENDPOINT=$OPENAI_ENDPOINT `
    AZURE_OPENAI_DEPLOYMENT_NAME="gpt-4" `
    AZURE_OPENAI_API_VERSION="2024-08-01-preview" `
    PORT="8080" `
    SCM_DO_BUILD_DURING_DEPLOYMENT="true"
```

## Step 3: Local Development Setup

### 3.1 Install dependencies with Azure packages
```bash
cd C:\Users\rshir\ai-chatbot-concierge\ai-chatbot-concierge-main
cp package-azure.json package.json
npm install
```

### 3.2 Create .env file for local testing
```bash
# Copy .env.example to .env
Copy-Item .env.example .env

# Edit .env and add:
AZURE_OPENAI_ENDPOINT=<your-endpoint-from-step-2.6>
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4
AZURE_OPENAI_API_VERSION=2024-08-01-preview

# For local dev only, you can use API key:
AZURE_OPENAI_API_KEY=<get-from-azure-portal>
```

### 3.3 Test locally
```bash
npm start
```

Visit http://localhost:3000 and test the chatbot!

## Step 4: Deploy to Azure

### Option A: Deploy from Local (Quick Test)

```bash
# Build and zip
npm install
Compress-Archive -Path * -DestinationPath deploy.zip -Force

# Deploy
az webapp deployment source config-zip `
  --resource-group $RESOURCE_GROUP `
  --name $WEBAPP_NAME `
  --src deploy.zip
```

### Option B: GitHub Actions CI/CD (Recommended)

#### 4.1 Create Service Principal for GitHub
```bash
az ad sp create-for-rbac `
  --name "github-ai-concierge" `
  --role contributor `
  --scopes "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RESOURCE_GROUP" `
  --sdk-auth
```

Copy the entire JSON output!

#### 4.2 Add GitHub Secrets

Go to your GitHub repository:
1. Settings → Secrets and variables → Actions
2. Add these secrets:

   - **AZURE_CREDENTIALS**: (paste the JSON from step 4.1)
   - **AZURE_OPENAI_ENDPOINT**: (your OpenAI endpoint)
   - **AZURE_OPENAI_DEPLOYMENT_NAME**: `gpt-4`

#### 4.3 Update workflow file

Edit `.github/workflows/azure-deploy.yml` and change:
```yaml
env:
  AZURE_WEBAPP_NAME: <your-webapp-name-from-step-2.8>
```

#### 4.4 Push to GitHub

```bash
git add .
git commit -m "Add Azure AI integration"
git push origin main
```

The GitHub Action will automatically deploy your app!

## Step 5: Test Your Deployed App

```bash
# Get the app URL
az webapp show `
  --name $WEBAPP_NAME `
  --resource-group $RESOURCE_GROUP `
  --query defaultHostName `
  --output tsv
```

Visit: `https://<your-app-name>.azurewebsites.net`

## Monitoring & Troubleshooting

### View Logs
```bash
az webapp log tail `
  --name $WEBAPP_NAME `
  --resource-group $RESOURCE_GROUP
```

### Check Health
```bash
curl https://<your-app-name>.azurewebsites.net/api/health
```

### SSH into Container
```bash
az webapp ssh `
  --name $WEBAPP_NAME `
  --resource-group $RESOURCE_GROUP
```

## Cost Optimization

- **Development**: Use B1 App Service Plan (~$13/month)
- **Production**: Upgrade to P1V2 or higher
- **Azure OpenAI**: Pay-per-token (GPT-4: $0.03/1K tokens input, $0.06/1K tokens output)

## Clean Up Resources (when done testing)

```bash
az group delete --name $RESOURCE_GROUP --yes --no-wait
```

## What's Different with Azure AI?

Your chatbot now has:

✅ **Intelligent Conversation**: Powered by GPT-4 for natural dialogue
✅ **Function Calling**: Agent can automatically search locations, get hotel info
✅ **Context Awareness**: Multi-turn conversations with memory
✅ **Scalability**: Azure auto-scaling
✅ **Security**: Managed Identity (no API keys in code!)
✅ **Monitoring**: Azure Application Insights integration

## Example Conversations

Try these in your chatbot:

1. "Find me tourist attractions near San Francisco"
2. "What time is check-out?"
3. "I need a taxi to the airport"
4. "Show me restaurants near the Eiffel Tower"

The Azure AI agent will automatically:
- Call the `searchNearbyAttractions` function
- Use OpenStreetMap APIs
- Provide formatted responses with suggestions

## Next Steps

1. Add Azure Application Insights for monitoring
2. Integrate Azure Cosmos DB for conversation history
3. Add Azure AI Speech for voice interactions
4. Deploy frontend to Azure Static Web Apps

## Support

If you encounter issues:
- Check logs: `az webapp log tail`
- Verify environment variables in Azure Portal
- Test OpenAI endpoint: Azure Portal → Azure OpenAI → Playground
