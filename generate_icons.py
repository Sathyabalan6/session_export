#!/usr/bin/env python3
"""Generate placeholder icons for the extension."""
import os, struct, zlib

def create_png(size, color=(29, 155, 240)):
    """Create a simple solid-color PNG."""
    if not isinstance(color, (tuple, list)) or len(color) < 3:
        raise ValueError(f"Invalid color: {color}")
    if not isinstance(size, int) or size <= 0:
        raise ValueError(f"Invalid size: {size}")

    def png_chunk(name, data):
        c = zlib.crc32(name + data) & 0xffffffff
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', c)

    r, g, b = color[0], color[1], color[2]
    rows = [b'\x00' + bytes([r, g, b, 255] * size) for _ in range(size)]
    raw = b''.join(rows)

    compressed = zlib.compress(raw)
    ihdr_data = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    png = b'\x89PNG\r\n\x1a\n'
    png += png_chunk(b'IHDR', ihdr_data)
    png += png_chunk(b'IDAT', compressed)
    png += png_chunk(b'IEND', b'')
    return png

os.makedirs('icons', exist_ok=True)
for size in [16, 48, 128]:
    with open(f'icons/icon{size}.png', 'wb') as f:
        f.write(create_png(size))
    print(f"Created icon{size}.png")

print("Icons generated!")
