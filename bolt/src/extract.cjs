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

const { mkdirSync, readFileSync, rmSync, existsSync, createReadStream, createWriteStream } = require('node:fs');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');
const path = require('node:path');
const { exec, execv, moveSync, makeWorkDir } = require('./utils.cjs');
const { Package } = require('./Package.cjs');
const config = require('./config.cjs');

const COMPONENTS = {
  package() {
    return true;
  },
  index() {
    return true;
  },
  manifest() {
    return true;
  },
  'package-config'() {
    return true;
  },
  signature(pkg) {
    return Boolean(pkg.getSignature());
  },
  'signature-manifest'(pkg) {
    return Boolean(pkg.getSignatureManifestPath());
  },
  'signature-config'(pkg) {
    return Boolean(pkg.getSignatureConfigPath());
  },
  'signature-layer'(pkg) {
    return Boolean(pkg.getSignatureLayerPath());
  },
  'signature-certificate'(pkg) {
    return Boolean(pkg.getSignatureCertificate());
  },
  layer(pkg) {
    return Boolean(pkg.getContentLayer());
  },
  rootfs(pkg) {
    return Boolean(pkg.getContentLayer());
  },
};

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

async function writeStream(sourceStream, dest) {
  if (dest === config.STDOUT_TARGET) {
    await pipeline(sourceStream, process.stdout, { end: false });
    return;
  }

  mkdirSync(path.dirname(dest), { recursive: true });

  const tempFile = dest + config.TEMP_FILE_SUFFIX;

  try {
    await pipeline(sourceStream, createWriteStream(tempFile));
    moveSync(tempFile, dest);
  } catch (err) {
    rmSync(tempFile, { force: true });
    throw err;
  }

  console.error(`Extracted ${dest}`);
}

function prepareDir(outName, fillDir) {
  if (outName === config.STDOUT_TARGET) {
    throw new Error(`This component is a directory and cannot be written to stdout`);
  }
  if (existsSync(outName)) {
    throw new Error(`Destination already exists: ${outName}`);
  }

  const tempDir = outName + config.TEMP_FILE_SUFFIX;

  rmSync(tempDir, { recursive: true, force: true });

  try {
    mkdirSync(tempDir, { recursive: true });
    fillDir(tempDir);
    moveSync(tempDir, outName);
  } catch (err) {
    rmSync(tempDir, { recursive: true, force: true });
    throw err;
  }

  console.error(`Extracted ${outName}/`);
}

async function extractPackage(pkgPath, options) {
  const workDir = makeWorkDir();

  try {
    const pkg = Package.fromPath(pkgPath, workDir);
    if (!pkg) {
      throw new Error(`Not a file: ${pkgPath}`);
    }

    const base = pkg.getFullName();
    const contentLayer = pkg.getContentLayer();

    const requested = options.requested ?? [];
    const defaultRun = requested.length === 0;

    if (defaultRun) {
      for (const [component, isAvailable] of Object.entries(COMPONENTS)) {
        if (isAvailable(pkg)) {
          requested.push(component);
        }
      }
    }

    const out = options.out ?? (defaultRun ? base : '.');
    if (out === config.STDOUT_TARGET) {
      throw new Error(`--out cannot be "${config.STDOUT_TARGET}" (stdout)`);
    }
    const isImplicitCwd = options.out === undefined && !defaultRun;
    if (!isImplicitCwd && existsSync(out)) {
      throw new Error(`Output directory already exists: ${out}`);
    }
    mkdirSync(out, { recursive: true });

    const makeName = (userName, name) => userName || path.join(out, name);

    for (const component of requested) {
      const userName = options[component];

      switch (component) {
        case 'package-config':
          await writeStream(createReadStream(pkg.getConfigPath()), makeName(userName, 'package-config.json'));
          break;
        case 'manifest':
          await writeStream(createReadStream(pkg.getManifestPath()), makeName(userName, 'manifest.json'));
          break;
        case 'index':
          await writeStream(createReadStream(pkg.getIndexPath()), makeName(userName, 'index.json'));
          break;
        case 'layer': {
          if (!contentLayer) {
            console.warn(`Skipping layer: package has no content layer`);
            break;
          }
          let range = {};
          if (contentLayer.hasDmverity) {
            if (contentLayer.dmverityOffset === undefined) {
              console.warn(`Warning: dm-verity layer has no valid offset; writing full blob including the hash tree`);
            } else {
              range = { start: 0, end: contentLayer.dmverityOffset - 1 };
            }
          }
          await writeStream(
            createReadStream(contentLayer.path, range),
            makeName(userName, `layer.${Package.mediaTypeToExtension(contentLayer.mediaType)}`));
          break;
        }
        case 'signature': {
          const signature = pkg.getSignature();
          if (!signature) throw new Error(`Package is not signed: ${pkgPath}`);

          await writeStream(Readable.from(signature), makeName(userName, 'signature.sig'));
          break;
        }
        case 'signature-manifest': {
          const signatureManifestPath = pkg.getSignatureManifestPath();
          if (!signatureManifestPath) throw new Error(`Package is not signed: ${pkgPath}`);

          await writeStream(createReadStream(signatureManifestPath), makeName(userName, 'signature-manifest.json'));
          break;
        }
        case 'signature-config': {
          const signatureConfigPath = pkg.getSignatureConfigPath();
          if (!signatureConfigPath) throw new Error(`Package is not signed: ${pkgPath}`);

          await writeStream(createReadStream(signatureConfigPath), makeName(userName, 'signature-config.json'));
          break;
        }
        case 'signature-layer': {
          const signatureLayerPath = pkg.getSignatureLayerPath();
          if (!signatureLayerPath) throw new Error(`Package is not signed: ${pkgPath}`);

          await writeStream(createReadStream(signatureLayerPath), makeName(userName, 'signature-layer.json'));
          break;
        }
        case 'signature-certificate': {
          const certificate = pkg.getSignatureCertificate();
          if (!certificate) throw new Error(`No certificate found in package: ${pkgPath}`);

          await writeStream(Readable.from(certificate), makeName(userName, 'signature-certificate.pem'));
          break;
        }
        case 'rootfs':
          if (!contentLayer) {
            console.warn(`Skipping rootfs: package has no content layer`);
            break;
          }
          prepareDir(makeName(userName, 'rootfs'), (dir) => pkg.extractRootfs(dir));
          break;
        case 'package':
          prepareDir(makeName(userName, 'package.oci'), (dir) => execv('cp', ['-a', `${pkg.getOCIDir()}/.`, `${dir}/`]));
          break;
      }
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function extractCommand(input, second, third) {
  if (typeof second === 'string') {
    if (Package.isPackageFileName(input)) {
      throw new Error(`${input} is a bolt package; use: bolt extract ${input} [--component[=<path>] ...]`);
    }
    if (third?.requested?.length) {
      throw new Error(`Component flags are not supported with the deprecated OCI-image form`);
    }
    return extract(input, second, third);
  }
  return extractPackage(input, second);
}

exports.extract = extract;
exports.extractCommand = extractCommand;

exports.extractOptions = {
  ...Object.fromEntries(Object.keys(COMPONENTS).map(component => [
    component,
    (params, result) => {
      result[component] = params.options[component];
      (result.requested ??= []).push(component);
      return true;
    },
  ])),
  out: (params, result) => !!(result.out = params.options.out),
};
