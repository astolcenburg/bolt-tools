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

const { statSync, readFileSync, existsSync } = require('node:fs');
const { exec } = require('./utils.cjs');
const { PackageConfig } = require('./PackageConfig.cjs');

const PACKAGE_FILE_EXTENSION = ".bolt";

class Package {
  static fromPath(path, fullName, workDir) {
    if (Package.validatePackageByPath(path)) {
      return new Package(path, fullName, workDir);
    } else {
      return null;
    }
  }

  static makeFileName(fullName) {
    return fullName + PACKAGE_FILE_EXTENSION;
  }

  static validatePackageByPath(path) {
    return path?.endsWith(PACKAGE_FILE_EXTENSION) && statSync(path, { throwIfNoEntry: false })?.isFile();
  }

  static getPathFromInfo(ociDir, entry) {
    const [algo, digest] = entry.digest.split(":");
    return ociDir + "/blobs/" + algo + "/" + digest;
  }

  static isPackageManifest(manifest) {
    return manifest.mediaType === "application/vnd.oci.image.manifest.v1+json" &&
      manifest.artifactType === "application/vnd.rdk.package+type" &&
      manifest.config?.mediaType === "application/vnd.rdk.package.config.v1+json";
  }

  static getPackageManifest(ociDir, index) {
    if (index.mediaType === "application/vnd.oci.image.index.v1+json") {
      for (let manifestInfo of index.manifests) {
        if (manifestInfo.mediaType === "application/vnd.oci.image.manifest.v1+json") {
          const manifest = JSON.parse(readFileSync(Package.getPathFromInfo(ociDir, manifestInfo)));
          if (Package.isPackageManifest(manifest)) {
            return manifest;
          }
        }
      }
    }

    if (Package.isPackageManifest(index)) {
      return index;
    }

    throw new Error(`Package manifest not found in ${ociDir}!`);
  }

  static getManifest(ociDir) {
    const index = JSON.parse(readFileSync(ociDir + "/index.json"));
    return Package.getPackageManifest(ociDir, index);
  }

  static getConfigPath(ociDir) {
    const manifest = Package.getManifest(ociDir);
    return Package.getPathFromInfo(ociDir, manifest.config);
  }

  static extractLastLayer(ociDir, outDir) {
    const manifest = Package.getManifest(ociDir);
    const layer = manifest.layers.at(-1);

    if (layer.mediaType === "application/vnd.rdk.package.content.layer.v1.erofs+dmverity") {
      exec(`fsck.erofs --preserve-perms ${Package.getPathFromInfo(ociDir, layer)} --extract=${outDir}`);
    } else {
      throw new Error(`Not supported layer type: ${layer.mediaType}`);
    }
  }

  constructor(path, fullName, workDir) {
    this.path = path;
    this.fullName = fullName;
    this.workDir = workDir;
    this.ociDir = "";
    this.layerDir = "";
  }

  getConfig() {
    if (!this.config) {
      this.config = PackageConfig.fromPath(Package.getConfigPath(this.getOCIDir()));
    }
    return this.config;
  }

  getFullName() {
    return this.getConfig().getFullName();
  }

  getId() {
    return this.getConfig().getId();
  }

  getVersion() {
    return this.getConfig().getVersion();
  }

  getDependencies() {
    return this.getConfig().getDependencies();
  }

  getPath() {
    return this.path;
  }

  isCompatible(platform) {
    return this.getConfig().isCompatible(platform);
  }

  getOCIDir() {
    if (!this.ociDir) {
      const ociDir = this.workDir + '/' + this.fullName;
      if (!existsSync(ociDir)) {
        exec(`cd ${this.workDir} && unzip -o ${this.path} -d ${this.fullName}`);
        statSync(ociDir);
        this.ociDir = ociDir;
      }
    }
    return this.ociDir;
  }

  getLayerDir() {
    if (!this.layerDir) {
      const layerDir = `${this.workDir}/${this.getFullName()}-layer`;
      if (!existsSync(layerDir)) {
        Package.extractLastLayer(this.getOCIDir(), layerDir);
        statSync(layerDir);
        this.layerDir = layerDir;
      }
    }
    return this.layerDir;
  }
}

exports.Package = Package;
