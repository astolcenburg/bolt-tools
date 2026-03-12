/*
 * If not stated otherwise in this file or this component's LICENSE file the
 * following copyright and licenses apply:
 *
 * Copyright 2026 RDK Management
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

const { crc32 } = require('./crc32.cjs');
const assert = require('node:assert');
const fs = require('node:fs');
const { READ_CHUNK_SIZE } = require('../config.cjs');

// Max alignment: extra field is uint16 (max 65535); worst-case paddingLen = alignment + 3,
// so alignment <= 65532. Rounded down to nearest power of two: 32768.
const MAX_ALIGNMENT = 32768;

const ZIP32_MAX = 0xFFFFFFFF;
const CDFH_BASE_SIZE = 46;
const EOCD_SIZE = 22;

function writeLocalHeader(fd, offset, nameBuf, size, crc, alignment, cdSize) {
  assert(alignment > 0 && alignment <= MAX_ALIGNMENT);

  // https://en.wikipedia.org/wiki/ZIP_(file_format)#Local_file_header
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034B50, 0);        // Magic number
  localHeader.writeUInt16LE(20, 4);                // Version
  localHeader.writeUInt16LE(0, 6);                 // Flags
  localHeader.writeUInt16LE(0, 8);                 // Compression method - none
  localHeader.writeUInt32LE(0, 10);                // Time/Date
  localHeader.writeUInt32LE(crc, 14);              // CRC-32
  localHeader.writeUInt32LE(size, 18);             // Compressed size
  localHeader.writeUInt32LE(size, 22);             // Uncompressed size
  localHeader.writeUInt16LE(nameBuf.length, 26);   // Name len

  const headerBaseSize = localHeader.length + nameBuf.length;
  const remainder = (offset + headerBaseSize) % alignment;
  let paddingLen = remainder === 0 ? 0 : alignment - remainder;

  // Extra field TLV records need at least 4 bytes; extend by one unit if padding is too small.
  if (paddingLen > 0 && paddingLen < 4) {
    paddingLen += alignment;
  }

  if (offset + headerBaseSize + paddingLen + size + cdSize > ZIP32_MAX) {
    throw new Error('ZIP archive exceeds the 4 GiB ZIP32 limit');
  }

  localHeader.writeUInt16LE(paddingLen, 28);       // Extra field len

  fs.writeSync(fd, localHeader);
  fs.writeSync(fd, nameBuf);

  if (paddingLen > 0) {
    const extraField = Buffer.alloc(paddingLen);
    extraField.writeUInt16LE(0x0000, 0);            // Header ID (null/padding)
    extraField.writeUInt16LE(paddingLen - 4, 2);    // Data length
    fs.writeSync(fd, extraField);
  }

  return headerBaseSize + paddingLen;
}

class ZIP {
  constructor(outputFile) {
    this.outputFile = outputFile;
    this.fd = fs.openSync(outputFile, 'w');
    this.offset = 0;
    this.cdSize = EOCD_SIZE;
    this.entries = [];
  }

  add(name, dataBuf, alignment = 1) {
    const nameBuf = Buffer.from(name);
    const crc = crc32(dataBuf);

    this.cdSize += CDFH_BASE_SIZE + nameBuf.length;
    const headerSize = writeLocalHeader(this.fd, this.offset, nameBuf, dataBuf.length, crc, alignment, this.cdSize);

    fs.writeSync(this.fd, dataBuf);

    this.entries.push({ nameBuf, size: dataBuf.length, offset: this.offset, crc });
    this.offset += headerSize + dataBuf.length;
  }

  addString(name, str, alignment = 1) {
    this.add(name, Buffer.from(str), alignment);
  }

  addFile(name, dataPath, alignment = 1) {
    const nameBuf = Buffer.from(name);
    const fileSize = fs.statSync(dataPath).size;

    this.cdSize += CDFH_BASE_SIZE + nameBuf.length;
    const crcFieldOffset = this.offset + 14;
    const headerSize = writeLocalHeader(this.fd, this.offset, nameBuf, fileSize, 0, alignment, this.cdSize);

    const buf = Buffer.allocUnsafe(READ_CHUNK_SIZE);
    const inputFd = fs.openSync(dataPath, 'r');
    let crc = 0;
    try {
      let bytesRead;
      while ((bytesRead = fs.readSync(inputFd, buf, 0, READ_CHUNK_SIZE)) > 0) {
        const chunk = buf.subarray(0, bytesRead);
        crc = crc32(chunk, crc);
        fs.writeSync(this.fd, chunk);
      }
    } finally {
      fs.closeSync(inputFd);
    }

    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32LE(crc, 0);
    fs.writeSync(this.fd, crcBuf, 0, 4, crcFieldOffset);

    this.entries.push({ nameBuf, size: fileSize, offset: this.offset, crc });
    this.offset += headerSize + fileSize;
  }

  close() {
    let cdSize = 0;

    for (let entry of this.entries) {
      // https://en.wikipedia.org/wiki/ZIP_(file_format)#Central_directory_file_header_(CDFH)
      const cdfh = Buffer.alloc(46);
      cdfh.writeUInt32LE(0x02014B50, 0);             // Magic number
      cdfh.writeUInt16LE(20, 4);                     // Version made by
      cdfh.writeUInt16LE(20, 6);                     // Version needed
      cdfh.writeUInt16LE(0, 8);                      // Flags
      cdfh.writeUInt16LE(0, 10);                     // Compression method - none
      cdfh.writeUInt32LE(0, 12);                     // Time/Date
      cdfh.writeUInt32LE(entry.crc, 16);             // CRC-32
      cdfh.writeUInt32LE(entry.size, 20);            // Compressed
      cdfh.writeUInt32LE(entry.size, 24);            // Uncompressed
      cdfh.writeUInt16LE(entry.nameBuf.length, 28);  // Name len
      cdfh.writeUInt16LE(0, 30);                     // Extra field len
      cdfh.writeUInt16LE(0, 32);                     // Comment len
      cdfh.writeUInt16LE(0, 34);                     // Disk start
      cdfh.writeUInt16LE(0, 36);                     // Internal attr
      cdfh.writeUInt32LE(0, 38);                     // External attr
      cdfh.writeUInt32LE(entry.offset, 42);          // Relative Offset to Local Header

      fs.writeSync(this.fd, cdfh);
      fs.writeSync(this.fd, entry.nameBuf);
      cdSize += cdfh.length + entry.nameBuf.length;
    }

    // https://en.wikipedia.org/wiki/ZIP_(file_format)#End_of_central_directory_record_(EOCD)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054B50, 0);               // Signature
    eocd.writeUInt16LE(0, 4);                        // Disk number
    eocd.writeUInt16LE(0, 6);                        // CD Start Disk
    eocd.writeUInt16LE(this.entries.length, 8);      // Entries on disk
    eocd.writeUInt16LE(this.entries.length, 10);     // Total entries
    eocd.writeUInt32LE(cdSize, 12);                  // Size of CD
    eocd.writeUInt32LE(this.offset, 16);             // Offset of CD
    eocd.writeUInt16LE(0, 20);                       // Comment len

    fs.writeSync(this.fd, eocd);
    fs.closeSync(this.fd);

    return this.outputFile;
  }
}

exports.ZIP = ZIP;
