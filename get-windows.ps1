Get-Process -Name wechatdevtools | ForEach-Object {
    if ($_.MainWindowTitle -ne "") {
        [PSCustomObject]@{
            Id = $_.Id
            Title = $_.MainWindowTitle
        }
    }
} | Where-Object { $_.Title -ne $null } | Format-Table -AutoSize