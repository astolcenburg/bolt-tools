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

const zlib = require('node:zlib');

let crcTable = null;

// https://en.wikipedia.org/wiki/Computation_of_cyclic_redundancy_checks#CRC-32_example
function initCrcTable() {
  if (crcTable === null) {
    crcTable = new Int32Array(256);

    for (let i = 0; i < 256; i++) {
      let crc = i;

      for (let j = 0; j < 8; j++) {
        crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
      }

      crcTable[i] = crc;
    }
  }
}

function crc32Fallback(buf, prev = 0) {
  initCrcTable();

  let crc = (prev ^ 0xFFFFFFFF) >>> 0;

  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
  }

  return (crc ^ 0xFFFFFFFF) >>> 0;
}

const crc32 = zlib.crc32 ?? crc32Fallback;

exports.crc32 = crc32;
