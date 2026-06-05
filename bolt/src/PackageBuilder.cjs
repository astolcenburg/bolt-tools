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

const { readFileSync, existsSync, rmSync } = require('node:fs');
const { exec } = require('./utils.cjs');

class PackageBuilder {
  constructor(workDir) {
    this.workDir = workDir;
    exec(`umoci init --layout ${this.workDir}/oci`);
    exec(`umoci new --image ${this.workDir}/oci`);
    this.initialized = false;
  }

  merge(rootfs, resetPaths = []) {
    if (this.initialized) {
      for (const path of resetPaths) {
        rmSync(`${this.workDir}/bundle/rootfs/${path}`, { recursive: true, force: true });
      }
      exec(`rsync -crlpgoDX ${rootfs}/ ${this.workDir}/bundle/rootfs`);
      exec(`umoci repack --refresh-bundle --image ${this.workDir}/oci ${this.workDir}/bundle`);
    } else {
      exec(`umoci insert --rootless --image ${this.workDir}/oci ${rootfs} /`);
      exec(`umoci unpack --rootless --image ${this.workDir}/oci ${this.workDir}/bundle`);
      this.initialized = true;
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
