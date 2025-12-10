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

const { statSync, rmSync, readFileSync, mkdirSync } = require('node:fs');
const { assert } = require('node:console');
const { exec, printError, makeWorkDir, linkOrCopySync } = require('./utils.cjs');
const { pack } = require('./pack.cjs');
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
    return this.packageStore.getPackage(fullPackageName);
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

function bitbakeMakeOCIImage(config) {
  detectBitbakeEnvironment();
  exec(`bitbake ${config.image}`, { stdio: 'inherit' });
  const defaultImage = `${process.env.BUILDDIR}/tmp-glibc/deploy/images/arm/${config.image}.tar`;
  let result = validateFilePath(defaultImage) ??
    validateFilePath(`${process.env.BUILDDIR}/tmp-glibc/deploy/images/arm64/${config.image}.tar`) ??
    validateFilePath(`${process.env.BUILDDIR}/tmp-glibc/deploy/images/amd64/${config.image}.tar`);

  if (result) {
    return result;
  }

  throw new Error(`Image not found: ${defaultImage}`);
}

async function make(packageAlias, options) {
  let workDir = makeWorkDir();
  try {
    await makeCommand(packageAlias, workDir, options);
  } catch (e) {
    printError(e);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

async function makeCommand(packageAlias, workDir, options) {
  const packageConfigStore = new PackageConfigStore(detectMainLayerDir() ?? process.cwd(), packageAlias);
  const packageConfig = packageConfigStore.getTopConfig();
  const packageBoltConfig = packageConfigStore.getTopBoltConfig();

  if (!packageConfig) {
    throw new Error(`Package config for ${packageAlias} not found!`);
  }

  const packageConfigBuilder = new PackageConfigBuilder(packageConfig);

  let packageStore;
  const constructPackageStore = function () {
    if (!packageStore) {
      packageStore = new PackageStore(process.env.BUILDDIR ?? process.cwd(), workDir);
    }
    return packageStore;
  };

  if (options.install && constructPackageStore().getPath() === '') {
    throw new Error(`Package store not found!`);
  }

  let contentFile;

  if (packageBoltConfig?.bitbake?.image) {
    const packageRootfsDir = `${workDir}/${packageConfig.getFullName()}-rootfs`;
    const packageLayerArchive = `${workDir}/${packageConfig.getFullName()}-layer.tgz`;
    const packages = PackageDependencyResolver.getDependencies(
      packageConfig.getFullName(),
      new PackageProvider(constructPackageStore(), packageConfigStore)
    );
    const last = packages.pop();

    assert(last.getFullName() === packageConfig.getFullName());

    contentFile = packageRootfsDir + ".tgz";
    const platform = PackageConfig.makePlatformConfigFromOCIImageConfig(
      extract(bitbakeMakeOCIImage(packageBoltConfig.bitbake), contentFile, { returnConfig: true })
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
        packageBuilder.merge(pkg.getLayerDir());
      }

      packageBuilder.merge(packageRootfsDir);
      packageBuilder.finish(packageLayerArchive);
      contentFile = packageLayerArchive;
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
    await pack(packageConfigPath, contentFile);
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
  install(params, result) {
    if (params.options.install === "") {
      Object.assign(result, {
        install: true,
      });
      return true;
    }
    return false;
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
