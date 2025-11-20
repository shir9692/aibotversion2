# Usage Report for Azure OpenAI (local token log)

param(
    [string]$LogPath = "./usage.log.jsonl",
    [double]$PricePromptPer1K = 0.0,
    [double]$PriceCompletionPer1K = 0.0,
    [switch]$TodayOnly
)

Write-Host "📈 Token Usage Report" -ForegroundColor Cyan
Write-Host "Log: $LogPath"

if (!(Test-Path $LogPath)) {
    Write-Host "No log found. Start the server and send a message first." -ForegroundColor Yellow
    exit 0
}

$records = @()
Get-Content -Path $LogPath -ErrorAction Stop | ForEach-Object {
    $line = $_.Trim()
    if (-not [string]::IsNullOrWhiteSpace($line)) {
        try {
            $obj = $line | ConvertFrom-Json
            if ($null -ne $obj.ts) {
                $objDate = [datetime]::Parse($obj.ts)
                if ($TodayOnly) {
                    if ($objDate.Date -eq (Get-Date).Date) { $records += $obj }
                } else {
                    $records += $obj
                }
            }
        } catch { }
    }
}

if ($records.Count -eq 0) {
    Write-Host "No matching records." -ForegroundColor Yellow
    exit 0
}

$sumPrompt = ($records | Measure-Object -Property prompt_tokens -Sum).Sum
$sumCompletion = ($records | Measure-Object -Property completion_tokens -Sum).Sum
$sumTotal = ($records | Measure-Object -Property total_tokens -Sum).Sum

$costPrompt = ($sumPrompt / 1000.0) * $PricePromptPer1K
$costCompletion = ($sumCompletion / 1000.0) * $PriceCompletionPer1K
$costTotal = $costPrompt + $costCompletion

Write-Host "" 
Write-Host ("Records:      {0}" -f $records.Count)
Write-Host ("Prompt tokens: {0}" -f $sumPrompt)
Write-Host ("Output tokens: {0}" -f $sumCompletion)
Write-Host ("Total tokens:  {0}" -f $sumTotal)
Write-Host ""

if ($PricePromptPer1K -gt 0 -or $PriceCompletionPer1K -gt 0) {
    Write-Host ("Prompt cost (@${0}/1K):    ${1:F4}" -f $PricePromptPer1K, $costPrompt) -ForegroundColor Green
    Write-Host ("Completion cost (@${0}/1K): ${1:F4}" -f $PriceCompletionPer1K, $costCompletion) -ForegroundColor Green
    Write-Host "────────────────────────────"
    Write-Host ("Estimated total:            ${0:F4}" -f $costTotal) -ForegroundColor Cyan
} else {
    Write-Host "Set -PricePromptPer1K and -PriceCompletionPer1K to estimate $ cost." -ForegroundColor Yellow
}
