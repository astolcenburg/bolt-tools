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

const config = require('./config.cjs');

class RemotePackageManager {
  constructor(remote) {
    this.remote = remote;
  }

  isPackageInstalled(id, version) {
    try {
      return this.remote.makeThunderRequest({
        method: `${config.PACKAGE_MANAGER_CALLSIGN}.packageState`,
        params: { packageId: id, version },
      }) === "INSTALLED";
    } catch (e) {
      return false;
    }
  }

  isActive() {
    try {
      const status = this.remote.makeThunderRequest({
        method: `Controller.status@${config.PACKAGE_MANAGER_CALLSIGN}`,
      });
      return status[0].state === "activated";
    } catch (e) {
      return false;
    }
  }

  install(id, version, fileLocator) {
    return this.remote.makeThunderRequest({
      method: `${config.PACKAGE_MANAGER_CALLSIGN}.install`,
      params: { packageId: id, version, fileLocator },
    });
  }
}

exports.RemotePackageManager = RemotePackageManager;
