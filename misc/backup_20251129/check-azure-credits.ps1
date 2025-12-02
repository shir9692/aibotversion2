# Daily Azure Credit Balance Check
# Run this script daily at 8 AM using Windows Task Scheduler

$ErrorActionPreference = "Stop"

# Get today's date
$startDate = (Get-Date).AddDays(-1).ToString("yyyy-MM-dd")
$endDate = (Get-Date).ToString("yyyy-MM-dd")

Write-Host "Checking Azure spending from $startDate to $endDate..."

try {
    # Get current subscription
    $subscription = az account show --query "{name:name, id:id}" | ConvertFrom-Json
    
    Write-Host "`nSubscription: $($subscription.name)"
    Write-Host "Subscription ID: $($subscription.id)`n"
    
    # Get cost for last 30 days
    $cost = az consumption usage list `
        --start-date (Get-Date).AddDays(-30).ToString("yyyy-MM-dd") `
        --end-date $endDate `
        --query "[].{cost:pretaxCost, currency:currency}" `
        | ConvertFrom-Json
    
    if ($cost) {
        $totalCost = ($cost | Measure-Object -Property cost -Sum).Sum
        $currency = $cost[0].currency
        
        Write-Host "======================================"
        Write-Host "Azure Spending (Last 30 days)"
        Write-Host "======================================"
        Write-Host "Total: $currency $([math]::Round($totalCost, 2))"
        Write-Host "Average per day: $currency $([math]::Round($totalCost/30, 2))"
        Write-Host "======================================`n"
        
        # Get spending by service
        Write-Host "Top 5 Services by Cost:"
        $services = az consumption usage list `
            --start-date (Get-Date).AddDays(-30).ToString("yyyy-MM-dd") `
            --end-date $endDate `
            --query "[].{service:meterCategory, cost:pretaxCost}" `
            | ConvertFrom-Json
        
        $services | Group-Object service | 
            Select-Object Name, @{N='Cost';E={($_.Group | Measure-Object -Property cost -Sum).Sum}} |
            Sort-Object Cost -Descending |
            Select-Object -First 5 |
            Format-Table -AutoSize
        
    } else {
        Write-Host "No usage data found for the specified period."
    }
    
    # Optional: Send email (requires SMTP configuration)
    # Uncomment and configure if you want email notifications
    <#
    $emailParams = @{
        To = "your-email@example.com"
        From = "azure-alerts@yourdomain.com"
        Subject = "Azure Daily Credit Report - $(Get-Date -Format 'yyyy-MM-dd')"
        Body = "Total spending (30 days): $currency $([math]::Round($totalCost, 2))"
        SmtpServer = "smtp.gmail.com"
        Port = 587
        UseSsl = $true
        Credential = (Get-Credential)
    }
    Send-MailMessage @emailParams
    #>
    
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}
