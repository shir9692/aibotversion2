# Quick Cleanup Script
# Run this when you're done testing to delete everything

$RESOURCE_GROUP = "rg-test-ai"

Write-Host "🗑️  Deleting test resources..." -ForegroundColor Yellow
Write-Host "   Resource Group: $RESOURCE_GROUP"
Write-Host ""

$confirm = Read-Host "Type 'DELETE' to confirm deletion"

if ($confirm -eq 'DELETE') {
    az group delete --name $RESOURCE_GROUP --yes --no-wait
    
    Write-Host ""
    Write-Host "✅ Deletion started!" -ForegroundColor Green
    Write-Host "   Resources will be gone in 5-10 minutes" -ForegroundColor Gray
    Write-Host "   No more charges after deletion completes" -ForegroundColor Green
    Write-Host ""
    
    # Remove .env
    if (Test-Path ".env") {
        Remove-Item ".env"
        Write-Host "   🗑️  Deleted .env file" -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "✅ All done! Your Azure credits are safe! 🎓" -ForegroundColor Cyan
} else {
    Write-Host "❌ Cancelled - resources NOT deleted" -ForegroundColor Red
    Write-Host "   Remember to delete later to avoid charges!" -ForegroundColor Yellow
}
