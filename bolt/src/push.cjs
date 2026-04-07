/*
 * If not stated otherwise in this file or this component's LICENSE file the
 * following copyright and licenses apply:
 *
 * Copyright 2025 RDK Management
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
const { Package } = require('./Package.cjs');
const { PackageStore } = require('./PackageStore.cjs');
const { Remote } = require('./Remote.cjs');
const { RemoteMWPackageStore } = require('./RemoteMWPackageStore.cjs');
const { RemotePackageManager } = require('./RemotePackageManager.cjs');
const { printError, makeWorkDir } = require('./utils.cjs');
const path = require('node:path');
const { rmSync } = require('node:fs');

function push(remoteName, pkg, options) {
  let workDir = makeWorkDir();
  try {
    pushCommand(remoteName, pkg, workDir, options);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function findPackage(pkgParam, workDir, locations) {
  let result = Package.fromPath(pkgParam, workDir);

  if (result) return result;
  locations.push(pkgParam);

  if (path.basename(pkgParam) === pkgParam) {
    let fileName = pkgParam;
    if (!Package.isPackageFileName(pkgParam)) {
      fileName = Package.makeFileName(pkgParam);
      result = Package.fromPath(fileName, workDir);
      if (result) return result;
      locations.push(fileName);
    }

    const packageStore = PackageStore.find(workDir);
    if (packageStore) {
      result = packageStore.getPackage(pkgParam);
      if (result) return result;
      locations.push(packageStore.generatePackagePath(pkgParam));
    }
  }

  return result;
}

function pushCommand(remoteName, pkgParam, workDir, options) {
  const pkgSearchLocations = [];
  const pkg = findPackage(pkgParam, workDir, pkgSearchLocations);

  if (!pkg) {
    throw new Error(`Package ${pkgParam} not found, tried:\n${pkgSearchLocations.join('\n')}`);
  }

  const remote = new Remote(remoteName);
  const pm = new RemotePackageManager(remote);
  let fullName = Package.pathToFullName(pkg.getPath());
  let [id, version] = Package.parsePackageFullName(fullName);

  if (!version) {
    fullName = pkg.getFullName();
    [id, version] = Package.parsePackageFullName(fullName);
  }

  if (!id || !version || !fullName) {
    throw new Error(`Cannot determine package name, id or version from ${pkgParam}`);
  }

  const remotePath = config.REMOTE_PACKAGES_DIR + "/" + Package.makeFileName(fullName);
  remote.mkdir(`${config.REMOTE_PACKAGES_DIR}`);
  remote.copyFile(pkg.getPath(), remotePath);

  if (!options.direct && !Package.hasSignature(pkg.getPath())) {
    if (pm.isActive()) {
      console.log(`Package ${fullName} is not signed, skipping middleware installation`);
    }
    // signal to callers of this function that direct installation mode was used
    options.direct = true;
  }

  if (!options.direct) {
    try {
      const installResponse = pm.install(id, version, remotePath);

      if (installResponse === "NONE") {
        console.log(`Pushed and installed ${fullName}.bolt on ${remoteName}`);
        const remoteStore = new RemoteMWPackageStore(remote);
        if (remoteStore.getPackagePath(id, version)) {
          remote.rm(remotePath);
          return fullName;
        } else {
          console.log(`Package installed in an unknown location, also deploying directly to allow running in direct mode`);
        }
      } else {
        throw new Error(`Failed to install package ${fullName}: ${installResponse}`);
      }
    } catch (err) {
      if (pm.isActive()) {
        remote.rm(remotePath);
        console.log(`Middleware installation failed; use --direct to skip middleware and deploy directly`);
        throw err;
      }
      // signal to callers of this function that direct installation mode was used
      options.direct = true;
    }
  }

  try {
    remote.unmountPkgWithDeps(fullName);
    remote.rm(`${config.REMOTE_PACKAGES_DIR}/${fullName}`);
    remote.exec([
      `cd '${config.REMOTE_PACKAGES_DIR}'`,
      `rm -rf '${fullName}'`,
      `unzip -o '${fullName}.bolt' -d '${fullName}'`,
      `rm -f '${Package.makeFileName(fullName)}'`,
    ].join(' && '));

    console.log(`Pushed ${fullName}.bolt to ${remoteName}`);
  } catch (err) {
    if (options.direct) {
      throw err;
    }
    console.log(`Direct deployment was unsuccessful`);
    printError(err);
  }

  return fullName;
}

exports.push = push;
exports.pushCommand = pushCommand;

exports.pushOptions = {
  direct(params, result) {
    return (result.direct = (params.options.direct === ""));
  },
}
