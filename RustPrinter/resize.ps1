Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("C:\Users\T2-adm-melarrass\Documents\projects\PrintMax\RustPrinter\public\TauriPrint.png")
$size = [math]::Max($img.Width, $img.Height)
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::Transparent)
$x = [math]::Floor(($size - $img.Width) / 2)
$y = [math]::Floor(($size - $img.Height) / 2)
$g.DrawImage($img, $x, $y, $img.Width, $img.Height)
$bmp.Save("C:\Users\T2-adm-melarrass\Documents\projects\PrintMax\RustPrinter\public\TauriPrintSquare.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
$img.Dispose()
