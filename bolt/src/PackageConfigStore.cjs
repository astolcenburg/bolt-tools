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

const { statSync, readFileSync } = require('node:fs');
const { resolve, isAbsolute } = require('path');
const { PackageConfig } = require('./PackageConfig.cjs');

const SUBDIR = "/package-configs/";
const MAX_DEPTH = 100;

class PackageConfigStore {
  static parsePotentialConfig(path) {
    if (statSync(path, { throwIfNoEntry: false })?.isFile()) {
      return PackageConfig.fromPath(path);
    }
    return null;
  }

  static parsePotentialBoltConfig(path) {
    if (statSync(path, { throwIfNoEntry: false })?.isFile()) {
      const boltConfig = JSON.parse(readFileSync(path));
      if (boltConfig.config) {
        let packageConfigPath = boltConfig.config;
        if (!isAbsolute(packageConfigPath)) {
          packageConfigPath = resolve(path + "/../" + packageConfigPath);
        }
        return PackageConfigStore.parsePotentialConfig(packageConfigPath);
      }
    }
    return null;
  }

  static findConfig(base, name) {
    for (let i = 0; i < MAX_DEPTH; ++i) {
      const path = resolve(base + '/' + name);
      const result =
        PackageConfigStore.parsePotentialBoltConfig(path) ??
        PackageConfigStore.parsePotentialBoltConfig(resolve(base + SUBDIR + name));

      if (result) {
        return result;
      } else if (path !== '/' + name) {
        base += '/..';
      } else {
        return null;
      }
    }

    return null;
  }

  constructor(initDir, packageAlias) {
    const topPackageConfig = PackageConfigStore.findConfig(initDir, packageAlias + '.bolt.json');

    if (topPackageConfig) {
      this.path = resolve(topPackageConfig.getPath() + '/..');
      this.topPackageConfig = topPackageConfig;
      this.topPackageAlias = packageAlias;
      this.topPackageBoltConfig = JSON.parse(readFileSync(this.path + '/' + packageAlias + '.bolt.json'));
    } else {
      this.path = null;
    }
  }

  getTopConfig() {
    return this.topPackageConfig;
  }

  getTopBoltConfig() {
    return this.topPackageBoltConfig;
  }

  getTopPackageFullName() {
    return this.topPackageConfig?.getFullName();
  }

  getConfig(packageFullName) {
    if (this.topPackageConfig?.getFullName() === packageFullName) {
      return this.topPackageConfig;
    } else {
      return null;
    }
  }

  getPath() {
    return this.path;
  }

  resolveRelativePath(relativePath) {
    if (isAbsolute(relativePath)) {
      throw new Error(`Path must be relative: ${relativePath}`);
    }
    return resolve(this.path, relativePath);
  }
}

exports.PackageConfigStore = PackageConfigStore;
