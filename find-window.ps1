Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WindowFinder {
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
}
"@

$sb = New-Object System.Text.StringBuilder(256)
$result = @()

$callback = {
    param($h, $p)
    if ([WindowFinder]::IsWindowVisible($h)) {
        [void][WindowFinder]::GetWindowText($h, $sb, 256)
        $title = $sb.ToString()
        if ($title.Length -gt 0) {
            $result += $title
        }
        $sb.Clear() | Out-Null
    }
    return $true
}

[WindowFinder]::EnumWindows($callback, [IntPtr]::Zero)
$result | Select-Object -Unique