# Quick Azure Setup Script
# Run this in PowerShell (as Administrator recommended)

Write-Host "🚀 AI Concierge - Azure Deployment Quick Setup" -ForegroundColor Cyan
Write-Host ""

# Variables - CUSTOMIZE THESE
$RESOURCE_GROUP = "rg-ai-concierge"
$LOCATION = "eastus"
$OPENAI_NAME = "openai-concierge-$(Get-Random -Maximum 9999)"
$WEBAPP_NAME = "ai-concierge-app-$(Get-Random -Maximum 9999)"
$APP_SERVICE_PLAN = "asp-ai-concierge"

Write-Host "📝 Configuration:" -ForegroundColor Yellow
Write-Host "   Resource Group: $RESOURCE_GROUP"
Write-Host "   Location: $LOCATION"
Write-Host "   OpenAI Name: $OPENAI_NAME"
Write-Host "   Web App Name: $WEBAPP_NAME"
Write-Host ""

# Check if Azure CLI is installed
Write-Host "🔍 Checking Azure CLI..." -ForegroundColor Yellow
try {
    $azVersion = az version --output json 2>$null | ConvertFrom-Json
    Write-Host "   ✅ Azure CLI found: $($azVersion.'azure-cli')" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Azure CLI not found. Installing..." -ForegroundColor Red
    Write-Host "   Please run: winget install -e --id Microsoft.AzureCLI" -ForegroundColor Yellow
    Write-Host "   Or download from: https://aka.ms/installazurecliwindows" -ForegroundColor Yellow
    exit 1
}

# Login to Azure
Write-Host ""
Write-Host "🔐 Logging in to Azure..." -ForegroundColor Yellow
az login

if ($LASTEXITCODE -ne 0) {
    Write-Host "   ❌ Azure login failed" -ForegroundColor Red
    exit 1
}
Write-Host "   ✅ Logged in successfully" -ForegroundColor Green

# Create Resource Group
Write-Host ""
Write-Host "📦 Creating Resource Group..." -ForegroundColor Yellow
az group create --name $RESOURCE_GROUP --location $LOCATION --output none
Write-Host "   ✅ Resource Group created" -ForegroundColor Green

# Create Azure OpenAI
Write-Host ""
Write-Host "🧠 Creating Azure OpenAI Service (this may take 2-3 minutes)..." -ForegroundColor Yellow
az cognitiveservices account create `
  --name $OPENAI_NAME `
  --resource-group $RESOURCE_GROUP `
  --kind OpenAI `
  --sku S0 `
  --location $LOCATION `
  --yes `
  --output none

if ($LASTEXITCODE -ne 0) {
    Write-Host "   ❌ Failed to create Azure OpenAI Service" -ForegroundColor Red
    Write-Host "   Note: Azure OpenAI requires application approval. Apply at:" -ForegroundColor Yellow
    Write-Host "   https://aka.ms/oai/access" -ForegroundColor Yellow
    exit 1
}
Write-Host "   ✅ Azure OpenAI Service created" -ForegroundColor Green

# Deploy GPT-4 Model
Write-Host ""
Write-Host "🤖 Deploying GPT-4 model..." -ForegroundColor Yellow
az cognitiveservices account deployment create `
  --name $OPENAI_NAME `
  --resource-group $RESOURCE_GROUP `
  --deployment-name gpt-4 `
  --model-name gpt-4 `
  --model-version "turbo-2024-04-09" `
  --model-format OpenAI `
  --sku-capacity 10 `
  --sku-name Standard `
  --output none

Write-Host "   ✅ GPT-4 model deployed" -ForegroundColor Green

# Get OpenAI Endpoint
$OPENAI_ENDPOINT = az cognitiveservices account show `
  --name $OPENAI_NAME `
  --resource-group $RESOURCE_GROUP `
  --query properties.endpoint `
  --output tsv

Write-Host "   📍 Endpoint: $OPENAI_ENDPOINT" -ForegroundColor Cyan

# Create App Service Plan
Write-Host ""
Write-Host "☁️ Creating App Service Plan..." -ForegroundColor Yellow
az appservice plan create `
  --name $APP_SERVICE_PLAN `
  --resource-group $RESOURCE_GROUP `
  --sku B1 `
  --is-linux `
  --output none

Write-Host "   ✅ App Service Plan created" -ForegroundColor Green

# Create Web App
Write-Host ""
Write-Host "🌐 Creating Web App..." -ForegroundColor Yellow
az webapp create `
  --name $WEBAPP_NAME `
  --resource-group $RESOURCE_GROUP `
  --plan $APP_SERVICE_PLAN `
  --runtime "NODE:18-lts" `
  --output none

Write-Host "   ✅ Web App created" -ForegroundColor Green

# Enable Managed Identity
Write-Host ""
Write-Host "🔑 Enabling Managed Identity..." -ForegroundColor Yellow
az webapp identity assign `
  --name $WEBAPP_NAME `
  --resource-group $RESOURCE_GROUP `
  --output none

$PRINCIPAL_ID = az webapp identity show `
  --name $WEBAPP_NAME `
  --resource-group $RESOURCE_GROUP `
  --query principalId `
  --output tsv

Write-Host "   ✅ Managed Identity enabled" -ForegroundColor Green

# Assign OpenAI Role
Write-Host ""
Write-Host "🔐 Assigning OpenAI permissions..." -ForegroundColor Yellow
$subscriptionId = az account show --query id -o tsv
az role assignment create `
  --role "Cognitive Services OpenAI User" `
  --assignee-object-id $PRINCIPAL_ID `
  --assignee-principal-type ServicePrincipal `
  --scope "/subscriptions/$subscriptionId/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.CognitiveServices/accounts/$OPENAI_NAME" `
  --output none

Write-Host "   ✅ Permissions assigned" -ForegroundColor Green

# Configure App Settings
Write-Host ""
Write-Host "⚙️ Configuring Web App settings..." -ForegroundColor Yellow
az webapp config appsettings set `
  --name $WEBAPP_NAME `
  --resource-group $RESOURCE_GROUP `
  --settings `
    AZURE_OPENAI_ENDPOINT=$OPENAI_ENDPOINT `
    AZURE_OPENAI_DEPLOYMENT_NAME="gpt-4" `
    AZURE_OPENAI_API_VERSION="2024-08-01-preview" `
    PORT="8080" `
    SCM_DO_BUILD_DURING_DEPLOYMENT="true" `
  --output none

Write-Host "   ✅ Settings configured" -ForegroundColor Green

# Get Web App URL
$WEBAPP_URL = az webapp show `
  --name $WEBAPP_NAME `
  --resource-group $RESOURCE_GROUP `
  --query defaultHostName `
  --output tsv

# Summary
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "✅ DEPLOYMENT SUCCESSFUL!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Resource Details:" -ForegroundColor Cyan
Write-Host "   Resource Group:    $RESOURCE_GROUP" -ForegroundColor White
Write-Host "   OpenAI Service:    $OPENAI_NAME" -ForegroundColor White
Write-Host "   OpenAI Endpoint:   $OPENAI_ENDPOINT" -ForegroundColor White
Write-Host "   Web App:           $WEBAPP_NAME" -ForegroundColor White
Write-Host "   Web App URL:       https://$WEBAPP_URL" -ForegroundColor White
Write-Host ""
Write-Host "📝 Next Steps:" -ForegroundColor Yellow
Write-Host "   1. Create .env file for local development:" -ForegroundColor White
Write-Host "      Copy-Item .env.example .env" -ForegroundColor Gray
Write-Host ""
Write-Host "   2. Edit .env and add:" -ForegroundColor White
Write-Host "      AZURE_OPENAI_ENDPOINT=$OPENAI_ENDPOINT" -ForegroundColor Gray
Write-Host "      AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4" -ForegroundColor Gray
Write-Host ""
Write-Host "   3. Install dependencies:" -ForegroundColor White
Write-Host "      cp package-azure.json package.json" -ForegroundColor Gray
Write-Host "      npm install" -ForegroundColor Gray
Write-Host ""
Write-Host "   4. Test locally:" -ForegroundColor White
Write-Host "      npm start" -ForegroundColor Gray
Write-Host ""
Write-Host "   5. Deploy to Azure:" -ForegroundColor White
Write-Host "      See azure-setup.md for GitHub Actions setup" -ForegroundColor Gray
Write-Host ""
Write-Host "🔗 Useful Commands:" -ForegroundColor Yellow
Write-Host "   View logs:         az webapp log tail --name $WEBAPP_NAME --resource-group $RESOURCE_GROUP" -ForegroundColor Gray
Write-Host "   Open in browser:   start https://$WEBAPP_URL" -ForegroundColor Gray
Write-Host "   Delete resources:  az group delete --name $RESOURCE_GROUP --yes" -ForegroundColor Gray
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Green

# Save credentials to file
$credentialsFile = "azure-credentials.txt"
@"
Azure OpenAI Concierge - Deployment Credentials
================================================

Resource Group: $RESOURCE_GROUP
Location: $LOCATION
OpenAI Service: $OPENAI_NAME
OpenAI Endpoint: $OPENAI_ENDPOINT
Web App Name: $WEBAPP_NAME
Web App URL: https://$WEBAPP_URL
Managed Identity Principal ID: $PRINCIPAL_ID

Deployment Date: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

"@ | Out-File -FilePath $credentialsFile -Encoding UTF8

Write-Host "💾 Credentials saved to: $credentialsFile" -ForegroundColor Cyan
Write-Host ""
