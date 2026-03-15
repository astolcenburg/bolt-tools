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

class ThunderError extends Error {
  constructor(method, response, message) {
    super(`${method} ${message}`);
    this.thunderResponse = response;
    this.name = this.constructor.name;
  }
}

function parseThunderResponse(method, responseString) {
  const response = JSON.parse(responseString);

  if (typeof response !== 'object' || response === null) {
    throw new ThunderError(method, response, `Unexpected response: ${responseString}`);
  }

  if (response.error) {
    throw new ThunderError(method, response, `${response.error?.message} (${response.error?.code})`);
  }

  return response.result;
}

exports.ThunderError = ThunderError;
exports.parseThunderResponse = parseThunderResponse;
