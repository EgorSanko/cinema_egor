# Run this AFTER extracting the tar.gz archive
# This script patches layout.tsx to add MobileNav and SW registration

$layoutPath = "C:\Users\egor3\movie\app\layout.tsx"
$content = Get-Content $layoutPath -Raw

# Add MobileNav import if not present
if ($content -notmatch "MobileNav") {
    $content = $content -replace '(import.*Navbar.*from.*)', "`$1`nimport { MobileNav } from `"@/components/mobile-nav`";"
    
    # Add MobileNav before closing </body> or after main content
    # Find the closing body tag or the ThemeProvider closing
    if ($content -match '</body>') {
        $content = $content -replace '</body>', '        <MobileNav />`n      </body>'
    }
}

# Add SW registration script if not present
if ($content -notmatch 'serviceWorker') {
    $swScript = @'

            <script dangerouslySetInnerHTML={{__html: `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js').catch(() => {});
              }
            `}} />
'@
    $content = $content -replace '</head>', "$swScript`n          </head>"
}

# Add viewport-fit=cover for safe areas
if ($content -notmatch 'viewport-fit') {
    $content = $content -replace 'content="width=device-width, initial-scale=1"', 'content="width=device-width, initial-scale=1, viewport-fit=cover"'
}

$content | Set-Content $layoutPath -Encoding UTF8 -NoNewline
Write-Host "layout.tsx patched successfully"

# Generate simple PWA icons (colored squares with play icon)
$iconScript = @'
const { createCanvas } = require("canvas");
const fs = require("fs");

function generateIcon(size, filename) {
  // Since we might not have canvas, create a simple SVG and convert
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${size*0.15}" fill="#e11d48"/>
    <polygon points="${size*0.38},${size*0.25} ${size*0.38},${size*0.75} ${size*0.75},${size*0.5}" fill="white"/>
  </svg>`;
  fs.writeFileSync(filename.replace('.png', '.svg'), svg);
  console.log(`Created ${filename.replace('.png', '.svg')}`);
}

generateIcon(192, "public/icon-192.svg");
generateIcon(512, "public/icon-512.svg");
'@

# Create simple SVG icons for PWA (browsers accept SVG too)
$icon192 = @'
<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="28" fill="#e11d48"/>
  <polygon points="73,37 73,155 155,96" fill="white"/>
</svg>
'@

$icon512 = @'
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="76" fill="#e11d48"/>
  <polygon points="194,98 194,414 414,256" fill="white"/>
</svg>
'@

$icon192 | Set-Content "C:\Users\egor3\movie\public\icon-192.svg" -Encoding UTF8
$icon512 | Set-Content "C:\Users\egor3\movie\public\icon-512.svg" -Encoding UTF8
Write-Host "PWA icons created"

# Update manifest to use SVG icons
$manifestPath = "C:\Users\egor3\movie\app\manifest.ts"
if (Test-Path $manifestPath) {
    $mc = Get-Content $manifestPath -Raw
    $mc = $mc -replace "icon-192\.png", "icon-192.svg"
    $mc = $mc -replace "icon-512\.png", "icon-512.svg"
    $mc = $mc -replace "image/png", "image/svg+xml"
    $mc | Set-Content $manifestPath -Encoding UTF8 -NoNewline
    Write-Host "manifest.ts updated for SVG icons"
}

Write-Host "`nDone! Now run: npm run build"
