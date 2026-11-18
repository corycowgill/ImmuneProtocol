"""Stage 1 - Download + validate the TRELLIS source GLBs from iCloud Drive shares.

    python3 tools/trellis/download.py [A B C D] [--force]

iCloud share URLs are web-app pages, not files. Each share's short GUID is
resolved through iCloud's public CloudKit endpoint
(ckdatabasews.icloud.com .../public/records/resolve), which returns the shared
file record: real file name, extension, size, and a signed download URL.

Originals land in tools/trellis/originals/source_<X>.glb and are never
overwritten unless --force is given and the remote checksum changed. A
manifest (tools/trellis/originals/manifest.json) records source URL, remote
file name, size, iCloud checksum and SHA-256; unchanged sources are skipped.
"""
import hashlib
import json
import os
import re
import struct
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ORIGINALS = os.path.join(HERE, 'originals')
MANIFEST = os.path.join(ORIGINALS, 'manifest.json')
RESOLVE = 'https://ckdatabasews.icloud.com/database/1/com.apple.cloudkit/production/public/records/resolve'


def log(*args):
    print('[download]', *args, flush=True)


def resolve(url):
    guid = re.search(r'/iclouddrive/([^/#?]+)', url)
    if not guid:
        raise ValueError('Not an iCloud Drive share URL: ' + url)
    body = json.dumps({'shortGUIDs': [{'value': guid.group(1)}]}).encode()
    req = urllib.request.Request(RESOLVE, data=body, headers={
        'Content-Type': 'text/plain', 'Origin': 'https://www.icloud.com', 'User-Agent': 'Mozilla/5.0'})
    result = json.load(urllib.request.urlopen(req, timeout=60))['results'][0]
    if 'rootRecord' not in result:
        raise RuntimeError('Share did not resolve to a file record: %s' % json.dumps(result)[:300])
    fields = result['rootRecord']['fields']
    content = fields['fileContent']['value']
    ext = fields.get('extension', {}).get('value', '')
    name = result['share']['fields']['cloudkit.title']['value']
    try:  # iCloud ships the basename base64-encoded
        import base64
        name = base64.b64decode(fields['encryptedBasename']['value']).decode('utf-8')
    except Exception:
        pass
    filename = name + ('.' + ext if ext else '')
    return {
        'guid': guid.group(1), 'filename': filename, 'extension': ext, 'size': content['size'],
        'icloud_checksum': content['fileChecksum'],
        'download_url': content['downloadURL'].replace('${f}', urllib.parse.quote(filename)),
    }


def validate_glb(data):
    """Checks the GLB header, chunk layout and that the JSON chunk parses."""
    if len(data) < 20 or data[:4] != b'glTF':
        head = data[:64].lstrip().lower()
        kind = 'HTML page' if head.startswith((b'<!doctype', b'<html')) else 'non-GLB data'
        raise ValueError('Downloaded %s, not a GLB' % kind)
    magic, version, length = struct.unpack('<4sII', data[:12])
    if version != 2:
        raise ValueError('Unsupported glTF container version %d' % version)
    if length != len(data):
        raise ValueError('GLB header length %d != file size %d (truncated?)' % (length, len(data)))
    offset, chunks = 12, []
    while offset < length:
        clen, ctype = struct.unpack('<I4s', data[offset:offset + 8])
        chunks.append((ctype, clen))
        offset += 8 + clen
    if offset != length or not chunks or chunks[0][0] != b'JSON':
        raise ValueError('Malformed GLB chunk layout: %s' % chunks)
    gltf = json.loads(data[20:20 + chunks[0][1]])
    binary = chunks[1][1] if len(chunks) > 1 and chunks[1][0] == b'BIN\x00' else 0
    for view in gltf.get('bufferViews', []):
        if view.get('buffer', 0) == 0 and view.get('byteOffset', 0) + view['byteLength'] > binary:
            raise ValueError('bufferView exceeds BIN chunk')
    return {
        'gltf_version': gltf.get('asset', {}).get('version'), 'generator': gltf.get('asset', {}).get('generator'),
        'meshes': len(gltf.get('meshes', [])), 'materials': len(gltf.get('materials', [])),
        'images': len(gltf.get('images', [])), 'skins': len(gltf.get('skins', [])),
        'animations': len(gltf.get('animations', [])), 'bin_bytes': binary,
        'extensions_required': gltf.get('extensionsRequired', []),
    }


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    force = '--force' in sys.argv
    sources = json.load(open(os.path.join(HERE, 'sources.json')))
    os.makedirs(ORIGINALS, exist_ok=True)
    manifest = json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {}
    failed = []
    for key in args or sorted(sources):
        url = sources[key]
        path = os.path.join(ORIGINALS, 'source_%s.glb' % key)
        try:
            info = resolve(url)
            known = manifest.get(key)
            if os.path.exists(path) and known and known['icloud_checksum'] == info['icloud_checksum']:
                log(key, 'unchanged (iCloud checksum %s); skipping' % info['icloud_checksum'])
                known['remote_filename'] = info['filename']
                continue
            if os.path.exists(path) and not force:
                raise RuntimeError('%s exists and the remote file changed; re-run with --force to replace it' % path)
            log(key, 'downloading', info['filename'], info['size'], 'bytes')
            data = urllib.request.urlopen(urllib.request.Request(
                info['download_url'], headers={'User-Agent': 'Mozilla/5.0'}), timeout=300).read()
            if len(data) != info['size']:
                raise ValueError('Size mismatch: got %d, iCloud reports %d' % (len(data), info['size']))
            structure = validate_glb(data)
            with open(path, 'wb') as handle:
                handle.write(data)
            os.chmod(path, 0o444)  # originals are read-only
            manifest[key] = {
                'source_url': url, 'remote_filename': info['filename'], 'size': len(data),
                'icloud_checksum': info['icloud_checksum'], 'sha256': hashlib.sha256(data).hexdigest(),
                'local_file': os.path.relpath(path, HERE), 'glb': structure,
            }
            log(key, 'OK sha256', manifest[key]['sha256'][:16], structure)
        except Exception as error:  # keep going; report every failure
            failed.append(key)
            log(key, 'FAILED:', error)
    with open(MANIFEST, 'w') as handle:
        json.dump(manifest, handle, indent=2)
    if failed:
        sys.exit('Failed sources: ' + ', '.join(failed))


if __name__ == '__main__':
    main()
