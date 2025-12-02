# Test-Only Azure Setup (Minimal Resources)
# This creates ONLY Azure OpenAI for testing locally
# Cost: ~$0.01-0.10 for a few hours of testing
# Delete everything when done!

Write-Host "🧪 Azure AI - TEST ONLY Setup (Minimal Resources)" -ForegroundColor Cyan
Write-Host "   This creates ONLY Azure OpenAI for local testing" -ForegroundColor Yellow
Write-Host "   You'll test on localhost - NO App Service costs!" -ForegroundColor Green
Write-Host ""

# Variables
$RESOURCE_GROUP = "rg-test-ai-concierge"
$LOCATION = "eastus"
$OPENAI_NAME = "openai-test-$(Get-Random -Maximum 9999)"

Write-Host "📝 Test Configuration:" -ForegroundColor Yellow
Write-Host "   Resource Group: $RESOURCE_GROUP"
Write-Host "   OpenAI Name: $OPENAI_NAME"
Write-Host "   Location: $LOCATION"
Write-Host ""
Write-Host "💰 Estimated Cost: Less than $0.10 for testing" -ForegroundColor Green
Write-Host ""

$continue = Read-Host "Continue? (y/n)"
if ($continue -ne 'y') {
    Write-Host "Cancelled." -ForegroundColor Yellow
    exit 0
}

# Check Azure CLI
Write-Host ""
Write-Host "🔍 Checking Azure CLI..." -ForegroundColor Yellow
try {
    $azVersion = az version --output json 2>$null | ConvertFrom-Json
    Write-Host "   ✅ Azure CLI found" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Azure CLI not found. Installing..." -ForegroundColor Red
    Write-Host "   Run: winget install -e --id Microsoft.AzureCLI" -ForegroundColor Yellow
    exit 1
}

# Login
Write-Host ""
Write-Host "🔐 Logging in to Azure..." -ForegroundColor Yellow
az login --output none
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ❌ Login failed" -ForegroundColor Red
    exit 1
}
Write-Host "   ✅ Logged in" -ForegroundColor Green

# Create Resource Group
Write-Host ""
Write-Host "📦 Creating Resource Group..." -ForegroundColor Yellow
az group create --name $RESOURCE_GROUP --location $LOCATION --output none
Write-Host "   ✅ Resource Group created" -ForegroundColor Green

# Create Azure OpenAI
Write-Host ""
Write-Host "🧠 Creating Azure OpenAI Service..." -ForegroundColor Yellow
Write-Host "   (This may take 2-3 minutes)" -ForegroundColor Gray

az cognitiveservices account create `
  --name $OPENAI_NAME `
  --resource-group $RESOURCE_GROUP `
  --kind OpenAI `
  --sku S0 `
  --location $LOCATION `
  --yes `
  --output none

if ($LASTEXITCODE -ne 0) {
    Write-Host "   ❌ Failed to create Azure OpenAI" -ForegroundColor Red
    Write-Host ""
    Write-Host "   NOTE: Azure OpenAI requires application approval." -ForegroundColor Yellow
    Write-Host "   Apply at: https://aka.ms/oai/access" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "   Alternative: Use Azure OpenAI in a region with availability" -ForegroundColor Yellow
    Write-Host "   Or wait for approval (usually 1-2 business days)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   Cleaning up..." -ForegroundColor Gray
    az group delete --name $RESOURCE_GROUP --yes --no-wait --output none
    exit 1
}
Write-Host "   ✅ Azure OpenAI created" -ForegroundColor Green

# Deploy GPT-4 model
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

# Get credentials
Write-Host ""
Write-Host "🔑 Getting credentials..." -ForegroundColor Yellow

$OPENAI_ENDPOINT = az cognitiveservices account show `
  --name $OPENAI_NAME `
  --resource-group $RESOURCE_GROUP `
  --query properties.endpoint `
  --output tsv

$OPENAI_KEY = az cognitiveservices account keys list `
  --name $OPENAI_NAME `
  --resource-group $RESOURCE_GROUP `
  --query key1 `
  --output tsv

Write-Host "   ✅ Credentials retrieved" -ForegroundColor Green

# Create .env file
Write-Host ""
Write-Host "📝 Creating .env file..." -ForegroundColor Yellow

$envContent = @"
# Azure OpenAI Configuration (TEST ONLY - DELETE AFTER TESTING)
AZURE_OPENAI_ENDPOINT=$OPENAI_ENDPOINT
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4
AZURE_OPENAI_API_VERSION=2024-08-01-preview
AZURE_OPENAI_API_KEY=$OPENAI_KEY

# Server Configuration
PORT=3000

# Debug
QNA_DEBUG=false
"@

$envContent | Out-File -FilePath ".env" -Encoding UTF8 -NoNewline
Write-Host "   ✅ .env file created" -ForegroundColor Green

# Summary
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "✅ TEST SETUP COMPLETE!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Your Test Resources:" -ForegroundColor Cyan
Write-Host "   Resource Group:  $RESOURCE_GROUP" -ForegroundColor White
Write-Host "   OpenAI Service:  $OPENAI_NAME" -ForegroundColor White
Write-Host "   Endpoint:        $OPENAI_ENDPOINT" -ForegroundColor White
Write-Host ""
Write-Host "🧪 Ready to Test Locally:" -ForegroundColor Yellow
Write-Host ""
Write-Host "   1. Install dependencies:" -ForegroundColor White
Write-Host "      cp package-azure.json package.json" -ForegroundColor Gray
Write-Host "      npm install" -ForegroundColor Gray
Write-Host ""
Write-Host "   2. Start the server:" -ForegroundColor White
Write-Host "      npm start" -ForegroundColor Gray
Write-Host ""
Write-Host "   3. Open browser:" -ForegroundColor White
Write-Host "      http://localhost:3000" -ForegroundColor Gray
Write-Host ""
Write-Host "   4. Test these queries:" -ForegroundColor White
Write-Host "      - 'Find attractions near Tokyo'" -ForegroundColor Gray
Write-Host "      - 'What time is check-out?'" -ForegroundColor Gray
Write-Host "      - 'Show me restaurants in Paris'" -ForegroundColor Gray
Write-Host ""
Write-Host "💰 Cost Tracking:" -ForegroundColor Yellow
Write-Host "   - Azure OpenAI: Pay per token used" -ForegroundColor White
Write-Host "   - GPT-4: ~$0.03 per 1K input tokens" -ForegroundColor White
Write-Host "   - Testing (100 messages): ~$0.10-0.50" -ForegroundColor White
Write-Host "   - Just browsing: FREE (only charges when you send messages)" -ForegroundColor White
Write-Host ""
Write-Host "🗑️  DELETE RESOURCES WHEN DONE:" -ForegroundColor Red
Write-Host ""
Write-Host "   Quick delete:" -ForegroundColor White
Write-Host "      az group delete --name $RESOURCE_GROUP --yes --no-wait" -ForegroundColor Gray
Write-Host ""
Write-Host "   Or run the cleanup script:" -ForegroundColor White
Write-Host "      .\cleanup-test-resources.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "⚠️  IMPORTANT: Delete resources after testing to avoid charges!" -ForegroundColor Red
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Green

# Save cleanup script
$cleanupScript = @"
# Cleanup Test Resources
Write-Host "🗑️  Deleting test resources..." -ForegroundColor Yellow
Write-Host "   Resource Group: $RESOURCE_GROUP" -ForegroundColor White
Write-Host ""

`$confirm = Read-Host "Are you sure you want to delete ALL test resources? (yes/no)"
if (`$confirm -eq 'yes') {
    az group delete --name $RESOURCE_GROUP --yes --no-wait
    Write-Host ""
    Write-Host "✅ Deletion started (runs in background)" -ForegroundColor Green
    Write-Host "   Check status: az group show --name $RESOURCE_GROUP" -ForegroundColor Gray
    Write-Host ""
    Write-Host "   Resources will be fully deleted in 5-10 minutes" -ForegroundColor Yellow
    Write-Host "   You can close this window" -ForegroundColor Gray
    Write-Host ""
    
    # Remove .env file
    if (Test-Path ".env") {
        Remove-Item ".env" -Force
        Write-Host "   🗑️  Deleted .env file" -ForegroundColor Gray
    }
} else {
    Write-Host "Cancelled." -ForegroundColor Yellow
}
"@

$cleanupScript | Out-File -FilePath "cleanup-test-resources.ps1" -Encoding UTF8
Write-Host "💾 Cleanup script saved: cleanup-test-resources.ps1" -ForegroundColor Cyan
Write-Host ""

# Save resource info
$resourceInfo = @"
Azure AI Concierge - Test Resources
====================================
Created: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

Resource Group: $RESOURCE_GROUP
OpenAI Service: $OPENAI_NAME
OpenAI Endpoint: $OPENAI_ENDPOINT
Model: gpt-4

⚠️ DELETE THESE RESOURCES AFTER TESTING!

Quick Delete Command:
az group delete --name $RESOURCE_GROUP --yes --no-wait

Or run:
.\cleanup-test-resources.ps1

Estimated Testing Cost:
- 100 messages: ~`$0.10-0.50
- 500 messages: ~`$0.50-2.00
- Just browsing: FREE

"@

$resourceInfo | Out-File -FilePath "test-resources.txt" -Encoding UTF8
Write-Host "💾 Resource info saved: test-resources.txt" -ForegroundColor Cyan
Write-Host ""
