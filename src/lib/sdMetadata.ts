// PNG text chunks (tEXt + uncompressed iTXt), read by hand. Tavern character cards keep their JSON in one.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const isPng = (bytes: Uint8Array): boolean =>
  bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b);

/** All PNG text chunks as keyword→value (tEXt + uncompressed iTXt). Empty for non-PNG. */
export function readPngTextChunks(bytes: Uint8Array): Map<string, string> {
  const map = new Map<string, string>();
  if (!isPng(bytes)) return map;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const latin1 = new TextDecoder('latin1');
  const utf8 = new TextDecoder('utf-8');
  let pos = 8; // skip the signature
  while (pos + 8 <= bytes.length) {
    const length = view.getUint32(pos);
    const type = latin1.decode(bytes.subarray(pos + 4, pos + 8));
    const dataStart = pos + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > bytes.length) break; // truncated/invalid
    const data = bytes.subarray(dataStart, dataEnd);
    if (type === 'tEXt') {
      // keyword \0 text (Latin-1)
      const nul = data.indexOf(0);
      if (nul !== -1) map.set(latin1.decode(data.subarray(0, nul)), latin1.decode(data.subarray(nul + 1)));
    } else if (type === 'iTXt') {
      // keyword \0 compressionFlag compressionMethod languageTag \0 translatedKeyword \0 text (UTF-8)
      const kEnd = data.indexOf(0);
      if (kEnd !== -1 && data[kEnd + 1] === 0) { // only uncompressed
        const langEnd = data.indexOf(0, kEnd + 3);
        const transEnd = langEnd !== -1 ? data.indexOf(0, langEnd + 1) : -1;
        if (transEnd !== -1) map.set(latin1.decode(data.subarray(0, kEnd)), utf8.decode(data.subarray(transEnd + 1)));
      }
    }
    if (type === 'IEND') break;
    pos = dataEnd + 4; // skip the 4-byte CRC
  }
  return map;
}
