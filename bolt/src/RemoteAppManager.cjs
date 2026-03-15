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

const { Package } = require('./Package.cjs');
const config = require('./config.cjs');

const FOCUS_RETRY_INTERVAL_MS = 500;
const FOCUS_RETRY_TIMEOUT_MS = 5000;

class RemoteAppManager {
  constructor(remote) {
    this.remote = remote;
  }

  isActive() {
    try {
      const status = this.remote.makeThunderRequest({
        method: `Controller.status@${config.APP_MANAGER_CALLSIGN}`,
      });
      return status[0].state === "activated";
    } catch (e) {
      return false;
    }
  }

  launch(pkg) {
    const [id] = Package.parsePackageFullName(pkg);

    this.remote.makeThunderRequest({
      method: `${config.APP_MANAGER_CALLSIGN}.launchApp`,
      params: {
        appId: id,
      }
    });
  }

  focus(pkg) {
    const [id] = Package.parsePackageFullName(pkg);
    let appInstanceId;
    const deadline = Date.now() + FOCUS_RETRY_TIMEOUT_MS;

    while (!appInstanceId && Date.now() < deadline) {
      const loadedApps = this.remote.makeThunderRequest({
        method: `${config.APP_MANAGER_CALLSIGN}.getLoadedApps`,
      });

      for (const app of loadedApps) {
        if (app.appId === id) {
          appInstanceId = app.appInstanceId;
        }
      }

      if (!appInstanceId) {
        this.remote.exec(`usleep ${FOCUS_RETRY_INTERVAL_MS * 1000}`);
      }
    }

    if (appInstanceId) {
      this.remote.makeThunderRequest({
        method: "org.rdk.RDKWindowManager.setFocus",
        params: { client: appInstanceId },
      });
      return true;
    }

    return false;
  }
}

exports.RemoteAppManager = RemoteAppManager;
