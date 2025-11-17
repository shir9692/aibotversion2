# Quick Cost Estimator for Testing

Write-Host "💰 Azure OpenAI Cost Estimator" -ForegroundColor Cyan
Write-Host ""

$messagesCount = Read-Host "How many test messages do you plan to send? (default: 50)"
if ([string]::IsNullOrWhiteSpace($messagesCount)) { $messagesCount = 50 }
$messagesCount = [int]$messagesCount

Write-Host ""
Write-Host "📊 Cost Breakdown:" -ForegroundColor Yellow
Write-Host ""

# GPT-4 pricing
$inputTokensPerMessage = 100  # Average tokens in a message
$outputTokensPerMessage = 150  # Average response tokens
$inputCostPer1K = 0.03  # GPT-4 input
$outputCostPer1K = 0.06  # GPT-4 output

$totalInputTokens = $messagesCount * $inputTokensPerMessage
$totalOutputTokens = $messagesCount * $outputTokensPerMessage

$inputCost = ($totalInputTokens / 1000) * $inputCostPer1K
$outputCost = ($totalOutputTokens / 1000) * $outputCostPer1K
$totalCost = $inputCost + $outputCost

Write-Host "   Messages: $messagesCount" -ForegroundColor White
Write-Host "   Estimated Input Tokens: $($totalInputTokens.ToString('N0'))" -ForegroundColor White
Write-Host "   Estimated Output Tokens: $($totalOutputTokens.ToString('N0'))" -ForegroundColor White
Write-Host ""
Write-Host "   Input Cost:  `$$($inputCost.ToString('F3'))" -ForegroundColor Green
Write-Host "   Output Cost: `$$($outputCost.ToString('F3'))" -ForegroundColor Green
Write-Host "   ─────────────────────" -ForegroundColor Gray
Write-Host "   Total Cost:  `$$($totalCost.ToString('F2'))" -ForegroundColor Cyan
Write-Host ""

Write-Host "💡 Cost-Saving Tips:" -ForegroundColor Yellow
Write-Host "   • Just browsing/clicking around: `$0.00 (no API calls)" -ForegroundColor White
Write-Host "   • Testing with 20-30 messages: ~`$0.05-0.15" -ForegroundColor White
Write-Host "   • Full testing (100 messages): ~`$0.40-0.75" -ForegroundColor White
Write-Host "   • Delete resources immediately after testing!" -ForegroundColor Red
Write-Host ""

Write-Host "🎓 Student Credit Preservation:" -ForegroundColor Yellow
Write-Host "   • Create resources only when ready to test" -ForegroundColor White
Write-Host "   • Test for 1-2 hours, then delete immediately" -ForegroundColor White
Write-Host "   • Cost for one test session: <`$1.00" -ForegroundColor White
Write-Host "   • Azure OpenAI charges ONLY when you use it" -ForegroundColor White
Write-Host ""

Write-Host "⏱️  Testing Timeline:" -ForegroundColor Yellow
Write-Host "   Setup (5 min):      `$0.00" -ForegroundColor White
Write-Host "   Testing (1 hour):   ~`$0.20-0.50" -ForegroundColor White
Write-Host "   Cleanup (2 min):    `$0.00" -ForegroundColor White
Write-Host "   ─────────────────────────" -ForegroundColor Gray
Write-Host "   Total Session:      <`$1.00" -ForegroundColor Cyan
Write-Host ""
