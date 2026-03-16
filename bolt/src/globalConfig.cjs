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

const { GLOBAL_CONFIG_PATH } = require('./config.cjs');
const { resolvePath } = require('./utils.cjs');
const fs = require('node:fs');
const path = require('node:path');

const CONFIG_DIR = path.dirname(GLOBAL_CONFIG_PATH);

function loadGlobalConfig() {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(GLOBAL_CONFIG_PATH, 'utf-8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`Warning: could not load ${GLOBAL_CONFIG_PATH}: ${err}`);
    }
    return {};
  }

  const result = {};

  if (typeof parsed?.key === 'string' && parsed.key !== '') {
    result.key = resolvePath(CONFIG_DIR, parsed.key);
  } else if (parsed?.key !== undefined) {
    console.warn(`Warning: invalid 'key' in ${GLOBAL_CONFIG_PATH}: expected a non-empty string`);
  }

  if (typeof parsed?.cert === 'string' && parsed.cert !== '') {
    if (result.key) {
      result.cert = resolvePath(CONFIG_DIR, parsed.cert);
    } else {
      console.warn(`Warning: 'cert' in ${GLOBAL_CONFIG_PATH} is ignored because 'key' is missing or invalid`);
    }
  } else if (parsed?.cert !== undefined) {
    console.warn(`Warning: invalid 'cert' in ${GLOBAL_CONFIG_PATH}: expected a non-empty string`);
  }

  return result;
}

exports.loadGlobalConfig = loadGlobalConfig;
