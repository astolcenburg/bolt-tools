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

const { Remote } = require('./Remote.cjs');
const config = require('./config.cjs');
const { existsSync } = require('fs');

function ensurePkgFileExists(pkgFile) {
  if (!existsSync(pkgFile)) {
    throw new Error(`File ${pkgFile} not found!`);
  }
}

function parsePkgName(pkg) {
  const parsed = pkg.split("+");

  if (parsed.length !== 2 || parsed[0].length === 0 || parsed[1].length === 0) {
    throw new Error(`Invalid package name ${pkg}! Expected format: id+version`);
  }

  return {
    id: parsed[0],
    version: parsed[1],
  }
}

function install(remoteName, pkg, options) {
  const remote = new Remote(remoteName);
  const pkgFile = `${pkg}.bolt`;

  ensurePkgFileExists(pkgFile);
  const pkgInfo = parsePkgName(pkg);
  const remoteDir = config.REMOTE_TMP_DIR + "/" + pkg;
  remote.mkdir(remoteDir);
  remote.copyFile(pkgFile, remoteDir);

  const out = remote.makeThunderRequest({
    method: "org.rdk.PackageManagerRDKEMS.install",
    params: {
      packageId: pkgInfo.id,
      version: pkgInfo.version,
      fileLocator: remoteDir + "/" + pkgFile,
    }
  });

  console.log(`install result: ${out}`);

  remote.rmdir(remoteDir);
}

exports.install = install;
