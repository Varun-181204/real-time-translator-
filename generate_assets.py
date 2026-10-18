import os
import struct
import zlib

os.makedirs('static/icons', exist_ok=True)

# 1. Create SVG Icon
svg_content = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="128" fill="#080B14"/>
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4F8CFF"/>
      <stop offset="100%" stop-color="#22D3EE"/>
    </linearGradient>
  </defs>
  <rect x="48" y="48" width="416" height="416" rx="96" fill="#0F1422" stroke="#263149" stroke-width="12"/>
  <circle cx="256" cy="256" r="120" fill="none" stroke="url(#grad)" stroke-width="24"/>
  <ellipse cx="256" cy="256" rx="54" ry="120" fill="none" stroke="url(#grad)" stroke-width="20"/>
  <line x1="136" y1="256" x2="376" y2="256" stroke="url(#grad)" stroke-width="20" stroke-linecap="round"/>
  <path d="M166 180 Q256 220 346 180" fill="none" stroke="url(#grad)" stroke-width="18" stroke-linecap="round"/>
  <path d="M166 332 Q256 292 346 332" fill="none" stroke="url(#grad)" stroke-width="18" stroke-linecap="round"/>
</svg>"""

with open('static/icons/icon.svg', 'w', encoding='utf-8') as f:
    f.write(svg_content)

# 2. Pure Python PNG Generator (RGBA)
def create_png(width, height, path):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0) # filter type none
        for x in range(width):
            dx = x - width / 2
            dy = y - height / 2
            dist = (dx*dx + dy*dy) ** 0.5
            r_max = width * 0.46
            if dist < r_max:
                t = dist / r_max
                r = int(79 * (1 - t) + 8 * t)
                g = int(140 * (1 - t) + 11 * t)
                b = int(255 * (1 - t) + 20 * t)
                a = 255
            else:
                r, g, b, a = 8, 11, 20, 0
            raw_data.extend([r, g, b, a])

    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw_data), 9)
    png_bytes = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png_bytes)

create_png(192, 192, 'static/icons/icon-192.png')
create_png(512, 512, 'static/icons/icon-512.png')
print('Generated static/icons successfully!')
