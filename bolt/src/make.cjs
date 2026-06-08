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

const { statSync, rmSync, readFileSync, mkdirSync, readdirSync, writeFileSync } = require('node:fs');
const { dirname, basename } = require('node:path');
const { assert } = require('node:console');
const { exec, execv, makeWorkDir, linkOrCopySync } = require('./utils.cjs');
const { pack } = require('./pack.cjs');
const { commonOptions } = require('./commonOptions.cjs');
const { extract } = require('./extract.cjs');
const { Package } = require('./Package.cjs');
const { PackageStore } = require('./PackageStore.cjs');
const { PackageConfigStore } = require('./PackageConfigStore.cjs');
const { PackageBuilder } = require('./PackageBuilder.cjs');
const { PackageDependencyResolver } = require('./PackageDependencyResolver.cjs');
const { PackageConfig } = require('./PackageConfig.cjs');
const { PackageConfigBuilder } = require('./PackageConfigBuilder.cjs');

class PackageProvider {
  constructor(packageStore, configStore) {
    this.packageStore = packageStore;
    this.configStore = configStore;
  }

  getPackage(fullPackageName) {
    if (fullPackageName === this.configStore.getTopPackageFullName()) {
      return this.configStore.getTopConfig();
    }
    return this.packageStore?.getPackage(fullPackageName);
  }
}

function detectBitbakeEnvironment() {
  if (exec(`which bitbake >/dev/null; echo $?`).trim() !== "0" || !process.env.BUILDDIR) {
    throw new Error('Instructions to make package require bitbake environment.\n' +
      'Please source setup-environment script.');
  }
}

function detectMainLayerDir() {
  if (process.env.BUILDDIR) {
    const setupDonePath = process.env.BUILDDIR + "/conf/setup.done";
    if (statSync(setupDonePath, { throwIfNoEntry: false })?.isFile()) {
      const setupDone = readFileSync(setupDonePath, 'utf8').trim().split('\n');
      if (setupDone.length) {
        return setupDone.at(-1);
      }
    }
  }

  return null;
}

function validateFilePath(path) {
  if (statSync(path, { throwIfNoEntry: false })?.isFile()) {
    return path;
  }
  return null;
}

function writeSbomConf(workDir, mode) {
  const path = `${workDir}/sbom.conf`;
  const cond = mode === 'full'
    ? '1'
    : "${@'1' if 'GPL' in (d.getVar('LICENSE') or '') and not any(bb.data.inherits_class(c, d) for c in ('native','nativesdk','cross','crosssdk','cross-canadian')) else '0'}";

  writeFileSync(
    path,
    `INHERIT += "create-spdx"\n` +
    `SPDX_PRETTY = "1"\n` +
    `SPDX_INCLUDE_SOURCES = "${cond}"\n` +
    `SPDX_ARCHIVE_SOURCES = "${cond}"\n`
  );

  return path;
}

function bitbakeMakeOCIImage(config, options, workDir) {
  detectBitbakeEnvironment();
  const noSstate = options.noSstate ? ' --no-setscene' : '';
  const postread = options.sbom ? ` -R "${writeSbomConf(workDir, options.sbom)}"` : '';
  exec(`bitbake${noSstate}${postread} ${config.image}`, { stdio: 'inherit' });
  const defaultImage = `${process.env.BUILDDIR}/tmp-glibc/deploy/images/arm/${config.image}.tar`;
  const result = validateFilePath(defaultImage) ??
    validateFilePath(`${process.env.BUILDDIR}/tmp-glibc/deploy/images/arm64/${config.image}.tar`) ??
    validateFilePath(`${process.env.BUILDDIR}/tmp-glibc/deploy/images/amd64/${config.image}.tar`);

  if (result) {
    return result;
  }

  throw new Error(`Image not found: ${defaultImage}`);
}

async function make(packageAlias, options) {
  const workDir = makeWorkDir();
  try {
    await makeCommand(packageAlias, workDir, options);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function resolvePackageConfigStore(target) {
  if (target.endsWith('.bolt.json')) {
    if (!statSync(target, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Bolt config file not found: ${target}`);
    }
    return new PackageConfigStore(dirname(target), basename(target, '.bolt.json'));
  }
  return new PackageConfigStore(detectMainLayerDir() ?? process.cwd(), target);
}

async function makeCommand(packageAlias, workDir, options) {
  const packageConfigStore = resolvePackageConfigStore(packageAlias);
  const packageConfig = packageConfigStore.getTopConfig();
  const packageBoltConfig = packageConfigStore.getTopBoltConfig();

  const packageConfigBuilder = new PackageConfigBuilder(packageConfig);
  packageConfigBuilder.resolveAutoValues(packageConfigStore.getPath());
  const packageStore = PackageStore.find(workDir);

  if (options.install && !packageStore) {
    throw new Error(`Package store not found!`);
  }

  let contentFile;
  let imageTarPath;

  if (options.sbom && !packageBoltConfig?.bitbake?.image) {
    throw new Error(`--sbom is only supported for bitbake targets`);
  }

  if (options.noSstate && !packageBoltConfig?.bitbake?.image) {
    throw new Error(`--no-sstate is only supported for bitbake targets`);
  }

  if (packageBoltConfig?.bitbake?.image) {
    const packageRootfsDir = `${workDir}/${packageConfig.getFullName()}-rootfs`;
    const packageLayerArchive = `${workDir}/${packageConfig.getFullName()}-layer.tgz`;
    const packages = PackageDependencyResolver.getDependencies(
      packageConfig.getFullName(),
      new PackageProvider(packageStore, packageConfigStore)
    );
    const last = packages.pop();

    assert(last.getFullName() === packageConfig.getFullName());

    contentFile = packageRootfsDir + ".tgz";
    imageTarPath = bitbakeMakeOCIImage(packageBoltConfig.bitbake, options, workDir);
    const platform = PackageConfig.makePlatformConfigFromOCIImageConfig(
      extract(imageTarPath, contentFile, { returnConfig: true })
    );
    packageConfigBuilder.setPlatform(platform);

    if (packages.length) {
      const packageRootfsArchive = contentFile;
      mkdirSync(packageRootfsDir, { recursive: true });
      exec(`tar xf ${packageRootfsArchive} -C ${packageRootfsDir}`);

      const packageBuilder = new PackageBuilder(`${workDir}/${packageConfig.getFullName()}`);

      for (const pkg of packages) {
        if (!pkg.isCompatible(platform)) {
          throw new Error(`Package ${pkg.getFullName()} is prepared for platform incompatible with ${JSON.stringify(platform)}`);
        }
        if (!pkg.isReleaseVersion()) {
          packageConfigBuilder.updateVersionNameWithCustomDependency(pkg);
        }
        packageBuilder.merge(pkg.getLayerDir());
      }

      packageBuilder.merge(packageRootfsDir, ['usr/share/common-licenses']);
      packageBuilder.finish(packageLayerArchive);
      contentFile = packageLayerArchive;
    }
  } else if (packageBoltConfig?.direct?.archive) {
    if (packageBoltConfig.direct.script) {
      const scriptPath = packageConfigStore.resolveRelativePath(packageBoltConfig.direct.script);
      execv(scriptPath, [], { cwd: dirname(scriptPath), stdio: 'inherit' });
    }
    contentFile = packageConfigStore.resolveRelativePath(packageBoltConfig.direct.archive);
    if (!statSync(contentFile, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Archive not found: ${contentFile}`);
    }
  } else if (packageBoltConfig?.direct?.empty) {
    contentFile = workDir + '/empty.tgz';
    exec(`tar czf ${contentFile} --files-from /dev/null`);
  }

  if (contentFile) {
    const packageConfigPath = `${workDir}/${packageConfig.getFullName()}.json`;
    packageConfigBuilder
      .updateVersionNameIfNotSpecified(packageConfigStore.getPath())
      .store(packageConfigPath);

    if (options.sbom) {
      const imageName = packageBoltConfig.bitbake.image;
      const imageDir = dirname(imageTarPath);
      const machine = basename(imageDir);
      const deployDir = dirname(dirname(imageDir));
      const sbomFile = `${imageName}-${machine}.spdx.tar.zst`;
      const sbomLink = `${imageDir}/${sbomFile}`;
      const licenseManifest = `${deployDir}/licenses/${imageName}-${machine}/license.manifest`;

      if (!statSync(sbomLink, { throwIfNoEntry: false })) {
        throw new Error(`SBOM file not found: ${sbomLink}`);
      }
      if (!statSync(licenseManifest, { throwIfNoEntry: false })) {
        throw new Error(`License manifest not found: ${licenseManifest}`);
      }

      const sbomBase = `${process.cwd()}/sbom/${machine}/${packageConfig.getFullName()}`;
      const sbomExtractDir = `${sbomBase}/sbom`;

      rmSync(sbomBase, { recursive: true, force: true });
      mkdirSync(sbomExtractDir, { recursive: true });
      exec(`tar --zstd -xf "${sbomLink}" -C "${sbomExtractDir}"`);
      linkOrCopySync(licenseManifest, `${sbomBase}/license.manifest`, true);

      const recipesDir = `${deployDir}/spdx/${machine}/recipes`;

      if (options.sbom === 'optimized') {
        const { makeOptimizedSbom } = require('./make-sbom-optimized.cjs');
        makeOptimizedSbom({
          sbomBase,
          recipesDir,
          imageName,
          machine,
        });
      } else {
        const recipeSources = statSync(recipesDir, { throwIfNoEntry: false })?.isDirectory()
          ? readdirSync(recipesDir).filter(name => name.startsWith('recipe-') && name.endsWith('.tar.zst'))
          : [];
        for (const name of recipeSources) {
          linkOrCopySync(`${recipesDir}/${name}`, `${sbomExtractDir}/${name}`, true);
        }
        console.log(`Wrote SBOM to ${sbomExtractDir} (${recipeSources.length} recipe source archives)`);
      }
    }

    pack(packageConfigPath, contentFile, options);

    if (options.install) {
      const packageFileName = Package.makeFileName(packageConfig.getFullName());
      try {
        linkOrCopySync(packageFileName, packageStore.getPath() + '/' + packageFileName, options.overwrite);
      } catch (err) {
        if (err.code === 'EEXIST') {
          throw new Error(`File ${packageStore.getPath() + '/' + packageFileName} already exists, use --force-install to overwrite.`);
        } else {
          throw err;
        }
      }
      console.log(`Installed ${packageFileName} in ${packageStore.getPath()}`);
    }
  } else {
    throw new Error(`No instructions to make ${packageAlias}!`);
  }
}

exports.make = make;

exports.makeOptions = {
  key: commonOptions.key,
  cert: commonOptions.cert,

  install(params, result) {
    if (params.options.install === "") {
      Object.assign(result, {
        install: true,
      });
      return true;
    }
    return false;
  },

  sbom(params, result) {
    const v = params.options.sbom;
    if (v === '') {
      result.sbom = 'full';
      return true;
    }
    if (v === 'full' || v === 'with-gpl-sources' || v === 'optimized') {
      result.sbom = v;
      return true;
    }
    return false;
  },

  "no-sstate"(params, result) {
    return (result.noSstate = (params.options["no-sstate"] === ''));
  },

  "force-install"(params, result) {
    if (params.options["force-install"] === "") {
      Object.assign(result, {
        install: true,
        overwrite: true,
      });
      return true;
    }
    return false;
  }
};
