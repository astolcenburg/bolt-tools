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
const { resolve, isAbsolute, dirname, join } = require('path');
const { PackageConfig } = require('./PackageConfig.cjs');

const PACKAGE_CONFIGS_DIR = "package-configs";
const MAX_DEPTH = 100;

class PackageConfigStore {
  static parsePackageConfig(path) {
    if (!statSync(path, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Package config ${path} not found!`);
    }
    const result = PackageConfig.fromPath(path);
    if (!result) {
      throw new Error(`Package config ${path} is invalid!`);
    }
    return result;
  }

  static parsePotentialBoltConfig(path) {
    if (statSync(path, { throwIfNoEntry: false })?.isFile()) {
      const boltConfig = JSON.parse(readFileSync(path));
      if (!boltConfig.config) {
        throw new Error(`Bolt config ${path} is missing the required "config" field!`);
      }
      let packageConfigPath = boltConfig.config;
      if (!isAbsolute(packageConfigPath)) {
        packageConfigPath = resolve(dirname(path), packageConfigPath);
      }
      return {
        boltConfigPath: resolve(path),
        boltConfig,
        packageConfig: PackageConfigStore.parsePackageConfig(packageConfigPath),
      };
    }
    return null;
  }

  static findConfig(base, name) {
    const searched = [];

    let dir = resolve(base);
    for (let i = 0; i < MAX_DEPTH; ++i) {
      const path = join(dir, name);
      const subdirPath = join(dir, PACKAGE_CONFIGS_DIR, name);
      searched.push(path, subdirPath);

      const result =
        PackageConfigStore.parsePotentialBoltConfig(path) ??
        PackageConfigStore.parsePotentialBoltConfig(subdirPath);

      if (result) {
        return result;
      }

      const parent = dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }

    throw new Error(`Could not find ${name}. Searched in:\n${searched.join('\n')}`);
  }

  constructor(initDir, packageAlias) {
    const { boltConfigPath, boltConfig, packageConfig } =
      PackageConfigStore.findConfig(initDir, packageAlias + '.bolt.json');

    this.path = dirname(boltConfigPath);
    this.topPackageConfig = packageConfig;
    this.topPackageAlias = packageAlias;
    this.topPackageBoltConfig = boltConfig;
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
