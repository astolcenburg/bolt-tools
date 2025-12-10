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

const { readFileSync } = require('node:fs');

class PackageConfig {
  constructor(data, path) {
    this.data = data;
    this.path = path;
  }

  static validate(config) {
    if ((config.packageType === "base" || config.packageType === "runtime" || config.packageType === "application") &&
      typeof config.id === "string" &&
      typeof config.version === "string" &&
      typeof config.entryPoint === "string" &&
      typeof config.name === "string") {
      return;
    } else {
      throw new Error(`Invalid config:\n ${JSON.stringify(config, null, 2)}`);
    }
  }

  static fromPath(path) {
    try {
      const data = JSON.parse(readFileSync(path));
      PackageConfig.validate(data);
      return new PackageConfig(data, path);
    } catch (e) {
      console.warn(`${e}`);
      return null;
    }
  }

  static makeFullName(id, version) {
    return id + "+" + version;
  }

  static makePlatformConfigFromOCIImageConfig(ociImageConfig) {
    if (!ociImageConfig.architecture || !ociImageConfig.os) {
      throw new Error("Invalid OCI Image - no 'architecture' and/or 'os' specified in the config!");
    }

    const platform = {
      architecture: ociImageConfig.architecture,
      os: ociImageConfig.os,
    };

    if (ociImageConfig.variant) {
      platform.variant = ociImageConfig.variant;
    }

    return platform;
  }

  getFullName() {
    const id = this.getId();
    const version = this.getVersion();

    if (id && version) {
      return PackageConfig.makeFullName(id, version);
    } else {
      return "";
    }
  }

  getId() {
    return this.data?.id ?? "";
  }

  getVersion() {
    return this.data?.version ?? "";
  }

  getDependencies() {
    return this.data?.dependencies ?? {};
  }

  getData() {
    return this.data;
  }

  getPath() {
    return this.path;
  }

  isCompatible(platform) {
    let result = false;

    const packagePlatform = this.data?.configuration?.["urn:rdk:config:platform"];

    if (packagePlatform) {
      result = packagePlatform?.architecture === platform?.architecture && packagePlatform?.os === platform?.os;
      if (result && packagePlatform?.variant !== platform?.variant) {
        console.warn(`Packages use different arch variants: ${packagePlatform?.variant} vs. ${platform?.variant}`);
      }
    } else {
      // for backward compatibility treat packages with no platform declaration as compatible
      result = true;
    }

    return result;
  }
}

exports.PackageConfig = PackageConfig;
