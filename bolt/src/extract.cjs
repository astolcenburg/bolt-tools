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

const { mkdirSync, readFileSync, rmSync } = require('node:fs');
const { exec, moveSync } = require('./utils.cjs');

function extract(image, output, options) {
  let result;

  const dir = exec(`mktemp -d -p .`).trim();
  mkdirSync(dir + "/oci", { recursive: true });
  exec(`tar xf ${image} -C ${dir}/oci`);
  exec(`umoci unpack --rootless --image ${dir}/oci ${dir}/bundle`);

  const index = JSON.parse(readFileSync(`${dir}/oci/index.json`));
  const [manifestAlgo, manifestDigest] = index.manifests[0].digest.split(':');
  const manifest = JSON.parse(readFileSync(`${dir}/oci/blobs/${manifestAlgo}/${manifestDigest}`));
  const [overlayAlgo, overlayDigest] = manifest.layers.at(-1).digest.split(':');
  moveSync(`${dir}/oci/blobs/${overlayAlgo}/${overlayDigest}`, output);

  if (options?.returnConfig) {
    const [configAlgo, configDigest] = manifest.config.digest.split(':');
    result = JSON.parse(readFileSync(`${dir}/oci/blobs/${configAlgo}/${configDigest}`));
  }

  rmSync(dir, { recursive: true, force: true });

  console.log(`Extracted ${output} from ${image}`);

  return result;
}

exports.extract = extract;
