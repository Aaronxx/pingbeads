$content = Get-Content 'D:\workspace\pinbeans\miniprogram\src\pages\index\index.js' -Raw
$content = $content -replace 'const \{ gridInfo \} = e\.detail;', 'const { gridInfo, flatCells } = e.detail;'
$content = $content -replace 'flatCells: \[\]', 'flatCells: flatCells || []'
Set-Content 'D:\workspace\pinbeans\miniprogram\src\pages\index\index.js' -Value $content -NoNewline