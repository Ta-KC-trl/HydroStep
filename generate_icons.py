import struct, zlib, os

def create_png(size, r, g, b):
    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = zlib.crc32(c) & 0xFFFFFFFF
        return struct.pack('>I', len(data)) + c + struct.pack('>I', crc)

    signature = b'\x89PNG\r\n\x1a\n'
    ihdr_data = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    ihdr = chunk(b'IHDR', ihdr_data)

    raw = b''
    for y in range(size):
        raw += b'\x00'
        for x in range(size):
            raw += bytes([r, g, b])

    compressed = zlib.compress(raw)
    idat = chunk(b'IDAT', compressed)
    iend = chunk(b'IEND', b'')

    return signature + ihdr + idat + iend

os.makedirs('icons', exist_ok=True)

for s in [16, 48, 128]:
    png = create_png(s, 0, 122, 255)
    path = f'icons/icon{s}.png'
    with open(path, 'wb') as f:
        f.write(png)
    print(f'Created {path} ({len(png)} bytes)')

print('Done!')
