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
      return this.makeRequest("packageState", { packageId: id, version }) === "INSTALLED";
    } catch (e) {
      return false;
    }
  }

  isActive() {
    return this.getCallsign() !== null;
  }

  install(id, version, fileLocator) {
    return this.makeRequest("install", { packageId: id, version, fileLocator });
  }

  callsignIsActive(callsign) {
    try {
      const status = this.remote.makeThunderRequest({
        method: `Controller.status@${callsign}`,
      });
      return status[0].state === "activated";
    } catch (e) {
      return false;
    }
  }

  getCallsign() {
    if (this.callsign === undefined) {
      this.callsign = null;
      for (const callsign of config.PACKAGE_MANAGER_CALLSIGNS) {
        if (this.callsignIsActive(callsign)) {
          this.callsign = callsign;
          break;
        }
      }
    }
    return this.callsign;
  }

  makeRequest(method, params) {
    const callsign = this.getCallsign();
    if (!callsign) {
      throw new Error("No package manager is active on the device");
    }
    return this.remote.makeThunderRequest({
      method: `${callsign}.${method}`,
      params,
    });
  }
}

exports.RemotePackageManager = RemotePackageManager;
