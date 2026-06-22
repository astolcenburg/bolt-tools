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

const { lstatSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { exec, execv, removeUnder, resolveUnder, touchUnder } = require('./utils.cjs');

const SYNC_FLAGS = ['-rlpgoDX'];

class PackageBuilder {
  constructor(workDir) {
    this.workDir = workDir;
    exec(`umoci init --layout ${this.workDir}/oci`);
    exec(`umoci new --image ${this.workDir}/oci`);
    this.initialized = false;
  }

  merge(rootfs, override = [], exclude = []) {
    for (const path of exclude) {
      if (!removeUnder(rootfs, path)) {
        console.warn(`Excluded path not found, skipping: ${path}`);
      }
    }
    if (this.initialized) {
      const touched = [];
      for (const path of override) {
        if (touchUnder(rootfs, path)) {
          touched.push(path);
        } else {
          console.warn(`Override path not found, skipping: ${path}`);
        }
      }
      execv('rsync', [...SYNC_FLAGS, '-c', '--', `${rootfs}/`, join(this.workDir, 'bundle', 'rootfs')]);
      this.resync(rootfs, touched, [...SYNC_FLAGS, '-t']);
      exec(`umoci repack --refresh-bundle --image ${this.workDir}/oci ${this.workDir}/bundle`);
    } else {
      exec(`umoci insert --rootless --image ${this.workDir}/oci ${rootfs} /`);
      exec(`umoci unpack --rootless --image ${this.workDir}/oci ${this.workDir}/bundle`);
      this.initialized = true;
    }
  }

  resync(rootfs, paths, flags) {
    const bundleRoot = join(this.workDir, 'bundle', 'rootfs');
    for (const path of paths) {
      const source = resolveUnder(rootfs, path);
      const dest = resolveUnder(bundleRoot, path);
      if (!source || !dest || !lstatSync(source, { throwIfNoEntry: false })?.isDirectory()) {
        console.warn(`Resync path not found, skipping: ${path}`);
        continue;
      }
      execv('rsync', [...flags, '--', `${source}/`, dest]);
    }
  }

  finish(layer) {
    exec(`umoci gc --layout=${this.workDir}/oci`);
    const index = JSON.parse(readFileSync(`${this.workDir}/oci/index.json`));
    const [manifestAlgo, manifestDigest] = index.manifests[0].digest.split(':');
    const manifest = JSON.parse(readFileSync(`${this.workDir}/oci/blobs/${manifestAlgo}/${manifestDigest}`));
    const [layerAlgo, layerDigest] = manifest.layers[manifest.layers.length - 1].digest.split(':');
    exec(`cp ${this.workDir}/oci/blobs/${layerAlgo}/${layerDigest} ${layer}`);
  }
}

exports.PackageBuilder = PackageBuilder;
