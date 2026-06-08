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

const { writeFileSync } = require('node:fs');
const { exec } = require('./utils.cjs');

const RELEASE_BRANCH_PREFIX = 'release/';

function autoVersion(repoPath) {
  const branch = exec('git rev-parse --abbrev-ref HEAD 2>/dev/null || true', { cwd: repoPath }).trim();
  if (branch.startsWith(RELEASE_BRANCH_PREFIX) && branch.length > RELEASE_BRANCH_PREFIX.length) {
    return branch.slice(RELEASE_BRANCH_PREFIX.length);
  }
  return exec('git describe --tags --abbrev=0 2>/dev/null || true', { cwd: repoPath }).trim() || '0.0.1';
}

class PackageConfigBuilder {
  constructor(baseConfig) {
    this.data = baseConfig.data;
    this.originalVersionName = this.data.versionName;
    this.versionName = this.data.versionName ?? "";
    this.versionNameSuffix = "";
  }

  updateVersionName() {
    const versionName = this.versionName + this.versionNameSuffix;
    if (this.data.versionName !== versionName) {
      this.data = Object.assign({}, this.data, { versionName });
    }
  }

  resolveAutoValues(repoPath) {
    let version;

    if (this.data.version === 'auto') {
      version = autoVersion(repoPath);
      this.data.version = version;
    }

    const dependencies = this.data.dependencies ?? {};
    for (const id in dependencies) {
      if (dependencies[id] === 'auto') {
        if (version === undefined) {
          version = autoVersion(repoPath);
        }
        dependencies[id] = version;
      }
    }
  }

  updateVersionNameIfNotSpecified(repoPath) {
    if (!this.originalVersionName || this.originalVersionName === "develop") {
      this.versionName = exec('git describe --dirty 2>/dev/null || echo develop', { cwd: repoPath }).trim();
      this.updateVersionName();
    }

    return this;
  }

  updateVersionNameWithCustomDependency(pkg) {
    const versionNameModifier = `/${pkg.getId()}+${pkg.getVersionName() ?? pkg.getVersion()}`;

    if (versionNameModifier.length <= this.versionNameSuffix.length) {
      if (!this.versionNameSuffix.includes(versionNameModifier)) {
        this.versionNameSuffix += versionNameModifier;
      }
    } else {
      if (!versionNameModifier.includes(this.versionNameSuffix)) {
        this.versionNameSuffix += versionNameModifier;
      } else {
        this.versionNameSuffix = versionNameModifier;
      }
    }

    this.updateVersionName();
  }

  markAsEdited(pkg) {
    const versionName = pkg.getVersionName() ?? pkg.getVersion();

    if (versionName.startsWith("edit/")) {
      this.versionName = versionName;
      this.updateVersionName();
    } else {
      this.versionName = "edit";
      this.updateVersionNameWithCustomDependency(pkg);
    }

    return this;
  }

  getData() {
    return this.data;
  }

  inheritPlatform(platform) {
    if (!platform || this.data.configuration?.["urn:rdk:config:platform"]) {
      return this;
    }

    this.data.configuration = Object.assign({}, this.data.configuration);
    this.data.configuration["urn:rdk:config:platform"] = platform;

    return this;
  }

  setPlatform(platform) {
    const packagePlatform = this.data.configuration?.["urn:rdk:config:platform"] ?? {};

    if (
      packagePlatform?.architecture !== platform?.architecture ||
      packagePlatform?.os !== platform?.os ||
      packagePlatform?.variant !== platform?.variant
    ) {
      if (!this.data.configuration) {
        this.data.configuration = {};
      } else {
        this.data.configuration = Object.assign({}, this.data.configuration);
      }
      this.data.configuration["urn:rdk:config:platform"] = Object.assign({}, packagePlatform, platform);
    }

    return this;
  }

  store(path) {
    writeFileSync(path, JSON.stringify(this.data, null, 2));

    return this;
  }
}

exports.PackageConfigBuilder = PackageConfigBuilder;
