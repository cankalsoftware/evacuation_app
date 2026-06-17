Add-Type -AssemblyName System.Drawing
$files = @("icon.png", "splash.png", "android-icon-foreground.png")
foreach ($f in $files) {
    $path = "assets\" + $f
    Rename-Item $path ($f + ".old")
    $img = [System.Drawing.Image]::FromFile((Get-Item ($path + ".old")).FullName)
    $img.Save((Get-Item "assets").FullName + "\" + $f, [System.Drawing.Imaging.ImageFormat]::Png)
    $img.Dispose()
    Remove-Item ($path + ".old")
}
