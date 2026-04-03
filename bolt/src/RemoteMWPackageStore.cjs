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

class RemoteMWPackageStore {
  constructor(remote) {
    this.remote = remote;
  }

  getPackagePath(id, version) {
    const path = `${config.REMOTE_MW_PACKAGE_STORE_DIR}/${id}/${version}/package.ralf`;
    if (this.remote.fileExists(path)) {
      return path;
    } else {
      return null;
    }
  }
}

exports.RemoteMWPackageStore = RemoteMWPackageStore;
