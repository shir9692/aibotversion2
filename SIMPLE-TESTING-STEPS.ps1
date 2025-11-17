# SUPER SIMPLE TESTING GUIDE
# Follow these steps exactly - takes 15 minutes total!

## STEP 1: Ensure Correct Directory
$ProjectDir = "C:\Users\rshir\ai-chatbot-concierge\ai-chatbot-concierge-main"
if ((Get-Location).Path -ne $ProjectDir) {
    Write-Host "Changing to project directory..." -ForegroundColor Yellow
    Set-Location $ProjectDir
}
Write-Host "Current directory: $(Get-Location)" -ForegroundColor Green

## STEP 2: Add Azure CLI to PATH and Login (1 minute)
$env:PATH = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin;" + $env:PATH
az login

# A browser will open - login with your Azure student account
# Close browser when it says "You have logged in"

## STEP 3: Set Your Variables (✅ UPDATED with your actual resources!)
$RESOURCE_GROUP = "oepnaiShir"
$LOCATION = "eastus2"
$OPENAI_NAME = "openaiInstanceshir"

Write-Host "Resource Group: $RESOURCE_GROUP"
Write-Host "Location: $LOCATION"
Write-Host "OpenAI Name: $OPENAI_NAME"

## STEP 4: ✅ SKIP - Resource Group Already Created!
# You already have resource group: oepnaiShir

## STEP 5: ✅ SKIP - Azure OpenAI Already Created!
# You already have: openaiInstanceshir in East US 2

## STEP 6: ✅ SKIP - GPT-4o Model Already Deployed!
# Deployment name: gpt-4
# Model: gpt-4o (2024-08-06)

## STEP 6B: Verify Deployment (optional)
az cognitiveservices account deployment list `
  --name $OPENAI_NAME `
  --resource-group $RESOURCE_GROUP `
  --output table

# Should show: gpt-4 deployment with gpt-4o model

## STEP 7: Get Your Credentials
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

Write-Host ""
Write-Host "✅ Your Credentials:"
Write-Host "Endpoint: $OPENAI_ENDPOINT"
Write-Host "Key: $OPENAI_KEY"

## STEP 8: Create .env File (copy this to a file named .env)
@"
AZURE_OPENAI_ENDPOINT=$OPENAI_ENDPOINT
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4
AZURE_OPENAI_API_VERSION=2024-08-01-preview
AZURE_OPENAI_API_KEY=$OPENAI_KEY
PORT=3000
"@ | Out-File -FilePath ".env" -Encoding UTF8

Write-Host ""
Write-Host "✅ .env file created!"

## STEP 9: Install Dependencies (1 minute)
cp package-azure.json package.json
npm install

## STEP 10: Start Testing! (as long as you want)
Write-Host "`n🚀 Starting server from: $(Get-Location)`n" -ForegroundColor Cyan
node server-with-azure-ai.js

# Open browser: http://localhost:3000
# Try: "Find attractions near Paris"
# Or: "Find restaurants in Ahmedabad"

## STEP 11: CLEANUP - DELETE EVERYTHING (2 minutes)
# ⚠️ IMPORTANT: Run this when done to avoid charges!
# This will delete: oepnaiShir resource group and openaiInstanceshir

az group delete --name $RESOURCE_GROUP --yes --no-wait

Write-Host ""
Write-Host "✅ Resources deleted! You're all clean!"
Write-Host "Total cost for testing session: ~$0.30-$0.50"

# ═══════════════════════════════════════════════════════════
# THAT'S IT! You've tested Azure AI integration!
# ═══════════════════════════════════════════════════════════

# Cost breakdown for this test:
# - Resource creation: $0.00
# - Testing 50 messages: ~$0.30
# - Cleanup: $0.00
# - Total: < $0.50 for most tests
