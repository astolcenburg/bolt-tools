/*
 * If not stated otherwise in this file or this component's LICENSE file the
 * following copyright and licenses apply:
 *
 * Copyright 2026 RDK Management
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

const { statSync, rmSync } = require('node:fs');
const { makeWorkDir } = require('./utils.cjs');
const { Package } = require('./Package.cjs');
const { PackageConfig } = require('./PackageConfig.cjs');
const { PackageConfigBuilder } = require('./PackageConfigBuilder.cjs');
const { ZIPPackageBuilder } = require('./ZIPPackageBuilder.cjs');
const { writeOCIIndex } = require('./pack.cjs');
const { commonOptions } = require('./commonOptions.cjs');

function edit(packagePath, options) {
  if (!statSync(packagePath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Bolt package not found: ${packagePath}`);
  }
  if (!options.config && !options.set) {
    throw new Error(`--config=<config.json> or --set=<json> is required`);
  }
  if (options.config && !statSync(options.config, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Config file not found: ${options.config}`);
  }

  const workDir = makeWorkDir();
  try {
    const pkg = Package.fromPath(packagePath, workDir);
    if (!pkg) {
      throw new Error(`Invalid bolt package: ${packagePath}`);
    }

    let baseConfig;
    if (options.config) {
      const packageConfig = PackageConfig.fromPath(options.config);
      if (!packageConfig) {
        throw new Error(`Invalid config: ${options.config}`);
      }
      baseConfig = packageConfig.getData();
    } else {
      baseConfig = pkg.getConfig().getData();
    }

    const mergedConfig = options.set ? { ...baseConfig, ...options.set } : baseConfig;
    PackageConfig.validate(mergedConfig);

    const editedConfig = new PackageConfigBuilder({ data: mergedConfig })
      .markAsEdited(pkg)
      .inheritPlatform(pkg.getPlatform())
      .getData();

    const output = PackageConfig.makeFullName(editedConfig.id, editedConfig.version);
    const manifest = pkg.getManifest();

    const builder = new ZIPPackageBuilder(output + ".bolt", workDir);

    for (const layer of manifest.layers) {
      builder.importFile(pkg.getBlobPath(layer));
    }

    const configInfo = builder.importObject(editedConfig);
    const newManifest = {
      ...manifest,
      config: { ...manifest.config, digest: configInfo.digest, size: configInfo.size },
    };
    const manifestInfo = builder.importObject(newManifest);

    writeOCIIndex(builder, { manifestInfo, id: editedConfig.id, options });

    console.log(`Edited ${packagePath} into ${output}.bolt`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

exports.edit = edit;

exports.editOptions = {
  config(params, result) {
    result.config = params.options.config;
    return result.config !== "";
  },

  set(params, result) {
    try {
      result.set = JSON.parse(params.options.set);
    } catch (e) {
      console.error(`Invalid --set value: ${e.message}`);
      return false;
    }
    if (typeof result.set !== "object" || result.set === null || Array.isArray(result.set)) {
      console.error(`Invalid --set value: expected a JSON object, got ${params.options.set}`);
      return false;
    }
    return true;
  },

  key: commonOptions.key,
  cert: commonOptions.cert,
};
