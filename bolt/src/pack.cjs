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

const { digestFile } = require('./digest.cjs');
const { makeArtifactManifest } = require('./artifact-manifest.cjs');
const { exec } = require('./utils.cjs');
const { statSync, mkdirSync, renameSync, writeFileSync, rmSync, readFileSync } = require('node:fs');

function validateConfig(config) {
  if ((config.packageType === "base" || config.packageType === "runtime" || config.packageType === "application") &&
    typeof config.id === "string" &&
    typeof config.version === "string" &&
    typeof config.versionName === "string" &&
    typeof config.name === "string") {
    return;
  } else {
    throw new Error(`Invalid config:\n ${JSON.stringify(config, null, 2)}`);
  }
}

async function pack(configFile, content) {
  statSync(configFile);
  statSync(content);
  const config = JSON.parse(readFileSync(configFile));
  validateConfig(config);
  const output = `${config.id}+${config.version}`;

  if (exec(`which ralfpack >/dev/null; echo $?`).trim() === "0") {
    exec(`ralfpack create --config ${configFile} --content ${content} --image-format erofs.lz4 ${output}.bolt`);
  } else {
    await packInternal(content, config, output);
  }

  console.log(`Prepared ${output}.bolt package from ${configFile} and ${content}`);
}

async function importFile(output, inputFile) {
  const inputFileDigest = await digestFile(inputFile);
  const inputFileSize = statSync(inputFile).size;
  renameSync(inputFile, output + '/blobs/sha256/' + inputFileDigest);

  return {
    digest: 'sha256:' + inputFileDigest,
    size: inputFileSize
  };
}

async function packInternal(content, config, output) {
  rmSync(output, { recursive: true, force: true });
  rmSync(output + ".bolt", { recursive: true, force: true });

  mkdirSync(output + '/blobs/sha256', { recursive: true });

  const erofsTmpFile = output + '/erofs';
  exec(`mkfs.erofs -zlz4 --all-root --tar --gzip ${erofsTmpFile} ${content}`);
  const erofsTmpFileStat = statSync(erofsTmpFile);
  const verityInfo = exec(`veritysetup format ${erofsTmpFile} ${erofsTmpFile} --hash-offset=${erofsTmpFileStat.size}`).trim().split('\n');
  let rootHash;
  let salt;

  for (let line of verityInfo) {
    if (line.startsWith('Root hash:')) {
      rootHash = line.substring('Root hash:'.length).trim();
    } else if (line.startsWith('Salt:')) {
      salt = line.substring('Salt:'.length).trim();
    }
  }

  if (!(typeof rootHash === "string" && rootHash.match(/^[0-9a-f]+$/) && typeof salt === "string" && salt.match(/^[0-9a-f]+$/))) {
    console.error(`Cannot find "Root hash" and/or "Salt" in veritysetup command output!`);
    process.exit(-1);
  }

  const contentInfo = await importFile(output, erofsTmpFile);

  writeFileSync(output + '/config.json', JSON.stringify(config, null, 2));
  const configInfo = await importFile(output, output + '/config.json');

  const manifest = makeArtifactManifest({
    type: config.packageType,
    configSize: configInfo.size,
    configDigest: configInfo.digest,
    contentSize: contentInfo.size,
    contentDigest: contentInfo.digest,
  });

  Object.assign(manifest.layers[0], {
    mediaType: "application/vnd.rdk.package.content.layer.v1.erofs+dmverity",
    annotations: {
      "org.rdk.package.content.dmverity.roothash": rootHash,
      "org.rdk.package.content.dmverity.offset": "" + erofsTmpFileStat.size,
      "org.rdk.package.content.dmverity.salt": salt,
    }
  });

  writeFileSync(output + '/manifest.json', JSON.stringify(manifest, null, 2));
  const manifestInfo = await importFile(output, output + '/manifest.json');

  const index = {
    "schemaVersion": 2,
    "mediaType": "application/vnd.oci.image.index.v1+json",
    "manifests": [
      {
        "mediaType": "application/vnd.oci.image.manifest.v1+json",
        "digest": manifestInfo.digest,
        "size": manifestInfo.size,
        "annotations": {
          "org.opencontainers.image.ref.name": config.id
        }
      }
    ]
  };

  writeFileSync(output + '/index.json', JSON.stringify(index, null, 2));
  writeFileSync(output + '/oci-layout', '{"imageLayoutVersion": "1.0.0"}');
  exec(`zip -r -0 '../${output}.bolt' .`, { cwd: output });
}

exports.pack = pack;
