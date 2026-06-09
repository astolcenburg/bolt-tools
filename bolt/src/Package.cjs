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

const { statSync, readFileSync, existsSync, mkdirSync } = require('node:fs');
const { execv } = require('./utils.cjs');
const { PackageConfig } = require('./PackageConfig.cjs');
const config = require('./config.cjs');
const path = require('node:path');

const PACKAGE_FILE_EXTENSION = ".bolt";

class Package {
  static fromPath(path, workDir) {
    if (Package.validatePackageByPath(path)) {
      return new Package(path, this.pathToFullName(path), workDir);
    } else {
      return null;
    }
  }

  static fromPathAndFullName(path, fullName, workDir) {
    if (Package.validatePackageByPath(path)) {
      return new Package(path, fullName, workDir);
    } else {
      return null;
    }
  }

  static makeFileName(fullName) {
    return fullName + PACKAGE_FILE_EXTENSION;
  }

  static isPackageFileName(fileName) {
    return fileName.endsWith(PACKAGE_FILE_EXTENSION);
  }

  static pathToFullName(packagePath) {
    return path.basename(packagePath, PACKAGE_FILE_EXTENSION);
  }

  static parsePackageFullName(fullName) {
    const parsed = fullName.split("+");

    if (parsed.length === 2) {
      return parsed;
    }

    return [fullName, ''];
  }

  static validatePackageByPath(path) {
    return statSync(path, { throwIfNoEntry: false })?.isFile();
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

  static hasSignature(pkgPath) {
    const index = JSON.parse(execv('unzip', ['-p', pkgPath, 'index.json']));
    for (const manifest of index.manifests ?? []) {
      const refName = manifest.annotations?.["org.opencontainers.image.ref.name"];
      if (refName?.endsWith(".sig")) {
        return true;
      }
    }
    return false;
  }

  static mediaTypeToExtension(mediaType) {
    const prefix = config.CONTENT_LAYER_MEDIA_TYPE_PREFIX;

    if (mediaType.startsWith(`${prefix}erofs`)) {
      return 'erofs';
    } else {
      switch (mediaType) {
        case `${prefix}tar`:
          return 'tar';
        case `${prefix}tar+gzip`:
          return 'tar.gz';
        case `${prefix}zip`:
          return 'zip';
      }
    }

    return 'layer';
  }

  static extractLayer(layerPath, mediaType, outDir) {
    const prefix = config.CONTENT_LAYER_MEDIA_TYPE_PREFIX;
    mkdirSync(outDir, { recursive: true });

    if (mediaType.startsWith(`${prefix}erofs`)) {
      execv('fsck.erofs', ['--preserve-perms', layerPath, `--extract=${outDir}`]);
    } else if (mediaType === `${prefix}tar`) {
      execv('tar', ['xf', layerPath, '-C', outDir]);
    } else if (mediaType === `${prefix}tar+gzip`) {
      execv('tar', ['xzf', layerPath, '-C', outDir]);
    } else if (mediaType === `${prefix}zip`) {
      execv('unzip', ['-o', '-q', layerPath, '-d', outDir]);
    } else {
      throw new Error(`Not supported layer type: ${mediaType}`);
    }
  }

  constructor(packagePath, fullName, workDir) {
    this.path = path.resolve(packagePath);
    this.fullName = fullName;
    this.workDir = workDir;
    this.ociDir = "";
    this.layerDir = "";
  }

  getIndex() {
    if (!this.index) {
      this.index = JSON.parse(readFileSync(this.getIndexPath()));
    }
    return this.index;
  }

  getManifest() {
    if (!this.manifest) {
      const index = this.getIndex();
      if (index.mediaType === "application/vnd.oci.image.index.v1+json") {
        for (const info of index.manifests ?? []) {
          if (info.mediaType === "application/vnd.oci.image.manifest.v1+json") {
            const manifest = JSON.parse(readFileSync(this.getBlobPath(info)));
            if (Package.isPackageManifest(manifest)) {
              this.manifestInfo = info;
              this.manifest = manifest;
              return this.manifest;
            }
          }
        }
      }
      if (Package.isPackageManifest(index)) {
        this.manifestInfo = null;
        this.manifest = index;
        return this.manifest;
      }
      throw new Error(`Package manifest not found in ${this.getOCIDir()}!`);
    }
    return this.manifest;
  }

  getBlobPath(entry) {
    return Package.getPathFromInfo(this.getOCIDir(), entry);
  }

  getIndexPath() {
    return `${this.getOCIDir()}/index.json`;
  }

  getConfigPath() {
    return this.getBlobPath(this.getManifest().config);
  }

  getManifestPath() {
    this.getManifest();
    return this.manifestInfo ? this.getBlobPath(this.manifestInfo) : this.getIndexPath();
  }

  getSignatureManifestPath() {
    for (const info of this.getIndex().manifests ?? []) {
      if (info.annotations?.["org.opencontainers.image.ref.name"]?.endsWith(".sig")) {
        return this.getBlobPath(info);
      }
    }
    return null;
  }

  getSignatureManifest() {
    if (this.signatureManifest === undefined) {
      const signatureManifestPath = this.getSignatureManifestPath();
      this.signatureManifest = signatureManifestPath ? JSON.parse(readFileSync(signatureManifestPath)) : null;
    }
    return this.signatureManifest;
  }

  getSignatureConfigPath() {
    const manifest = this.getSignatureManifest();
    return manifest?.config ? this.getBlobPath(manifest.config) : null;
  }

  getSignatureLayerPath() {
    const manifest = this.getSignatureManifest();
    return manifest?.layers?.[0] ? this.getBlobPath(manifest.layers[0]) : null;
  }

  getSignatureCertificate() {
    if (this.certificate === undefined) {
      const manifest = this.getSignatureManifest();
      this.certificate = manifest?.layers?.[0]?.annotations?.["dev.sigstore.cosign/certificate"] ?? null;
    }
    return this.certificate;
  }

  getSignature() {
    if (this.signature === undefined) {
      const manifest = this.getSignatureManifest();
      this.signature = manifest?.layers?.[0]?.annotations?.["dev.cosignproject.cosign/signature"] ?? null;
    }
    return this.signature;
  }

  getContentLayer() {
    const layer = this.getManifest().layers.at(-1);
    if (!layer || layer.mediaType === "application/vnd.oci.empty.v1+json") {
      return null;
    }
    const offset = parseInt(layer.annotations?.["org.rdk.package.content.dmverity.offset"], 10);
    return {
      mediaType: layer.mediaType,
      path: this.getBlobPath(layer),
      hasDmverity: layer.mediaType.includes("dmverity"),
      dmverityOffset: Number.isInteger(offset) && offset > 0 ? offset : undefined,
    };
  }

  extractRootfs(outDir) {
    const layer = this.getContentLayer();
    if (!layer) {
      throw new Error(`Package has no content layer`);
    }
    Package.extractLayer(layer.path, layer.mediaType, outDir);
  }

  getConfig() {
    if (!this.config) {
      this.config = PackageConfig.fromPath(this.getConfigPath());
      if (!this.config) {
        throw new Error(`Package config is invalid in ${this.getOCIDir()}`);
      }
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

  getVersionName() {
    return this.getConfig().getVersionName();
  }

  getDependencies() {
    return this.getConfig().getDependencies();
  }

  getPath() {
    return this.path;
  }

  getPlatform() {
    return this.getConfig().getPlatform();
  }

  isCompatible(platform) {
    return this.getConfig().isCompatible(platform);
  }

  isReleaseVersion() {
    return this.getConfig().isReleaseVersion();
  }

  getOCIDir() {
    if (!this.ociDir) {
      const ociDir = this.workDir + '/' + this.fullName;
      if (!existsSync(ociDir)) {
        execv('unzip', ['-o', this.path, '-d', ociDir]);
      }
      statSync(ociDir);
      this.ociDir = ociDir;
    }
    return this.ociDir;
  }

  getLayerDir() {
    if (!this.layerDir) {
      const layerDir = `${this.workDir}/${this.getFullName()}-layer`;
      if (!existsSync(layerDir)) {
        this.extractRootfs(layerDir);
      }
      statSync(layerDir);
      this.layerDir = layerDir;
    }
    return this.layerDir;
  }
}

exports.Package = Package;
