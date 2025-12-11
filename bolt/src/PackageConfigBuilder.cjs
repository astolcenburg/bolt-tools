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

  updateVersionNameIfNotSpecified(repoPath) {
    if (!this.originalVersionName || this.originalVersionName === "develop") {
      this.versionName = exec('git describe --dirty 2>/dev/null || echo develop', { cwd: repoPath }).trim();
      this.updateVersionName();
    }

    return this;
  }

  updateVersionNameWithCustomDependency(pkg) {
    const versionNameModifier = `/${pkg.getId()}+${pkg.getVersionName()}`;

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
