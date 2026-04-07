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

const { Remote } = require('./Remote.cjs');
const runtime = require('./runtime-config.cjs');
const { makeTemplate, applyGPUConfig } = require('./runtime-config.cjs');
const config = require('./config.cjs');
const { Package } = require('./Package.cjs');
const { RemoteMWPackageStore } = require('./RemoteMWPackageStore.cjs');
const { RemotePackageManager } = require('./RemotePackageManager.cjs');
const { RemoteAppManager } = require('./RemoteAppManager.cjs');
const { pushCommand } = require('./push.cjs');
const { makeWorkDir } = require('./utils.cjs');
const { rmSync } = require('node:fs');

const directOnlyRunOptions = {
  develop: true,
  uid: true,
  gid: true,
  userns: true,
  'clear-storage': true,
  'rw-overlay': true,
};

function getPath(packageDir, entry) {
  const [algo, digest] = entry.digest.split(":");
  return packageDir + "/blobs/" + algo + "/" + digest;
}

function isPackageManifest(manifest) {
  return manifest.mediaType === "application/vnd.oci.image.manifest.v1+json" &&
    manifest.artifactType === "application/vnd.rdk.package+type" &&
    manifest.config?.mediaType === "application/vnd.rdk.package.config.v1+json";
}

function getPackageManifest(remote, packageDir, index) {
  if (index.mediaType === "application/vnd.oci.image.index.v1+json") {
    for (let manifestInfo of index.manifests) {
      if (manifestInfo.mediaType === "application/vnd.oci.image.manifest.v1+json") {
        const manifest = remote.parseJSONFile(getPath(packageDir, manifestInfo));
        if (isPackageManifest(manifest)) {
          return manifest;
        }
      }
    }
  }

  if (isPackageManifest(index)) {
    return index;
  }

  return null;
}

function getConfigPath(remote, packageDir) {
  const index = remote.parseJSONFile(packageDir + "/index.json");
  const manifest = getPackageManifest(remote, packageDir, index);

  if (manifest) {
    return getPath(packageDir, manifest.config);
  }

  return null;
}

function getLayerInfo(remote, packageDir) {
  const index = remote.parseJSONFile(packageDir + "/index.json");
  const layer = getPackageManifest(remote, packageDir, index).layers[0];

  if (layer.mediaType === "application/vnd.rdk.package.content.layer.v1.erofs+dmverity") {
    return {
      path: getPath(packageDir, layer),
      size: layer.size,
      roothash: layer.annotations["org.rdk.package.content.dmverity.roothash"],
      offset: layer.annotations["org.rdk.package.content.dmverity.offset"],
    };
  }

  return null;
}

function mountIfNeeded(remote, pkg) {
  const mountDir = remote.getPkgMountDir(pkg);
  if (!remote.isMounted(mountDir)) {
    remote.mkdir(mountDir);
    const packageDir = remote.getPkgDir(pkg);
    const layerInfo = getLayerInfo(remote, packageDir);
    if (layerInfo) {
      if (layerInfo.roothash) {
        if (remote.fileExists("/usr/sbin/veritysetup") && remote.fileExists("/usr/sbin/dmsetup")) {
          remote.mountWithDMVerity(pkg, layerInfo, mountDir);
        } else {
          console.warn('\x1b[33mWarning: /usr/sbin/veritysetup and/or /usr/sbin/dmsetup not found! Cannot enable dm-verity!\x1b[0m');
          remote.mount(layerInfo.path, mountDir);
        }
      } else {
        remote.mount(layerInfo.path, mountDir);
      }
    }
  }
  return mountDir;
}

function getWaylandSocketName(pkg) {
  return pkg + "-wayland";
}

function getWaylandSocketPath(pkg) {
  return "/tmp/" + getWaylandSocketName(pkg);
}

function getRialtoSocketName(pkg) {
  return pkg + "-rialto";
}

function getRialtoSocketPath(pkg) {
  return "/tmp/" + getRialtoSocketName(pkg);
}

function prepareDisplay(remote, pkg) {

  let createDisplayMethod = "org.rdk.RDKShell.1.createDisplay";
  let createDisplayParams = {
    client: pkg,
    displayName: getWaylandSocketName(pkg),
    rialtoSocket: getRialtoSocketName(pkg),
  };
  let setFocusMethod = "org.rdk.RDKShell.1.setFocus";

  if (remote.fileExists(config.AI2_MANAGERS_ENABLED_FILE)) {
    createDisplayMethod = "org.rdk.RDKWindowManager.createDisplay";
    createDisplayParams = {
      displayParams: JSON.stringify(
        {
          client: pkg,
          displayName: getWaylandSocketName(pkg),
        }
      )
    };
    setFocusMethod = "org.rdk.RDKWindowManager.setFocus";
  }

  const createDisplay = {
    method: createDisplayMethod,
    params: createDisplayParams
  };

  try {
    remote.makeThunderRequest(createDisplay);
  } catch (err) {
    console.log(`${createDisplayMethod} failed ${err}`);
  }

  const setFocus = {
    method: setFocusMethod,
    params: {
      client: pkg
    }
  };

  try {
    remote.makeThunderRequest(setFocus);
  } catch (err) {
    console.log(`${setFocusMethod} failed ${err}`);
  }
}

function setupResources(remote, pkg) {
  if (!remote.socketExists(getWaylandSocketPath(pkg))) {
    prepareDisplay(remote, pkg);
  }
}

function prepareBundle(remote, pkg, bundleConfig, layers, options) {
  const bundleDir = remote.getPkgBundleDir(pkg);
  const bundleRootfsDir = bundleDir + "/rootfs";
  const rwOverlay = options.rwOverlay ?? true;
  let upperDirMount = "";
  let rwDirs;

  if (remote.isMounted(bundleRootfsDir)) {
    remote.unmount(bundleRootfsDir);
  }

  if (options.clearStorage) {
    remote.rmdir(`${bundleDir}`);
  }

  bundleConfig.process.env.push('HOME=' + config.PROCESS_HOME_DIR);

  if (rwOverlay) {
    rwDirs = `${bundleDir}/rw/work ${bundleDir}/rw/upper ${bundleDir}/rw/upper${config.PROCESS_HOME_DIR}`;
    upperDirMount = `,upperdir=${bundleDir}/rw/upper,workdir=${bundleDir}/rw/work`;
  } else {
    rwDirs = `${bundleDir}${config.PROCESS_HOME_DIR}`;
    bundleConfig.mounts.push({
      source: rwDirs,
      destination: config.PROCESS_HOME_DIR,
      type: "bind",
      options: [
        "rbind",
        "nosuid",
        "nodev",
        "rw"
      ]
    });
  }

  remote.mkdir([bundleRootfsDir, ...rwDirs.split(' ')]);
  remote.exec(`chown ${bundleConfig.process.user.uid}:${bundleConfig.process.user.gid} ${rwDirs}`);
  remote.exec(`chmod 700 ${rwDirs}`);

  remote.exec(`mount -t overlay overlay -o lowerdir=${layers.join(":")}${upperDirMount} ${bundleRootfsDir}`);
  remote.storeObject(`${bundleDir}/config.json`, bundleConfig);
}

function start(remote, pkg) {
  remote.exec(`crun run --bundle=${remote.getPkgBundleDir(pkg)} ${pkg}`, { stdio: 'inherit' });
}

function getConfig(remote, pkg) {
  const configPath = getConfigPath(remote, remote.getPkgDir(pkg));
  return remote.parseJSONFile(configPath);
}

function makePkgName(id, version) {
  return id + "+" + version;
}

function getConfigs(remote, pkg) {
  const configs = [];
  const pkgs = new Map();

  function gatherConfigs(name) {
    const config = getConfig(remote, name);
    const pkgName = makePkgName(config.id, config.version);

    if (name === pkgName) {
      const foundPkgVersion = pkgs.get(config.id);

      if (foundPkgVersion === undefined) {
        pkgs.set(config.id, config.version);

        for (const dependency in config.dependencies) {
          const depPkgName = makePkgName(dependency, config.dependencies[dependency]);
          gatherConfigs(depPkgName);
        }

        configs.push({ pkg: name, config });
      } else if (foundPkgVersion === config.version) {
        console.warn(`Multiple packages depend on the same package ${config.id} ${foundPkgVersion}!`);
      } else {
        throw new Error(`Multiple packages depend on different versions of the same package ${config.id} ${foundPkgVersion} vs ${config.version}!`);
      }
    } else {
      throw new Error(`Package name does not match package config ${name} vs ${pkgName}`);
    }
  }

  gatherConfigs(pkg);

  return configs;
}

function addDeviceGPULayer(remote, bundleConfig, layerDirs) {
  let result = false;

  if (remote.dirExists(config.REMOTE_GPU_LAYER_FS)) {
    layerDirs.push(config.REMOTE_GPU_LAYER_FS);
  }

  if (remote.fileExists(config.REMOTE_GPU_CONFIG)) {
    applyGPUConfig(remote, bundleConfig, remote.parseJSONFile(config.REMOTE_GPU_CONFIG));
    result = true;
  }

  return result;
}

function deployFromRemoteStoreIfNeeded(remote, store, id, version, pkgs) {
  if (pkgs.has(id)) return;
  pkgs.add(id);

  if (!remote.dirExists(remote.getPkgDir({ id, version }))) {
    const storePkgPath = store.getPackagePath(id, version);
    if (!storePkgPath) {
      throw new Error(`Package ${id}+${version} not found!`);
    }

    const pkg = makePkgName(id, version);
    remote.mkdir(config.REMOTE_PACKAGES_DIR);
    remote.exec([
      `cd '${config.REMOTE_PACKAGES_DIR}'`,
      `rm -rf '${pkg}'`,
      `unzip -o '${storePkgPath}' -d '${pkg}'`,
    ].join(' && '));

    console.log(`Deployed ${pkg}.`);
  }

  const pkgConfig = getConfig(remote, { id, version });
  for (const depId in pkgConfig.dependencies) {
    deployFromRemoteStoreIfNeeded(remote, store, depId, pkgConfig.dependencies[depId], pkgs);
  }
}

function runDirect(remote, pkg, options) {
  const configs = getConfigs(remote, pkg);
  const layerDirs = [];

  console.log(`Running ${pkg} using:`);
  console.log(`${JSON.stringify(configs, null, 2)}`);

  const bundleConfig = makeTemplate(options);
  for (const { pkg, config } of configs) {
    if (config.entryPoint) {
      bundleConfig.process.args.push(config.entryPoint);
    }
    layerDirs.push(mountIfNeeded(remote, pkg));
  }

  if (!addDeviceGPULayer(remote, bundleConfig, layerDirs)) {
    throw new Error(
      `GPU layer not found!\n` +
      `Please make sure the ${config.REMOTE_GPU_CONFIG} exists and contains valid information.\n` +
      `See https://github.com/rdkcentral/bolt-tools/tree/main/gpu-layer-poc for help.`
    );
  }

  setupResources(remote, pkg);
  const waylandAvailable = runtime.configureWaylandSocket(remote, bundleConfig, getWaylandSocketPath(pkg));
  const rialtoAvailable = runtime.configureRialtoSocket(remote, bundleConfig, getRialtoSocketPath(pkg));

  layerDirs.reverse();
  prepareBundle(remote, pkg, bundleConfig, layerDirs, options);

  if (!rialtoAvailable) {
    console.warn('\x1b[33mWarning: Rialto socket not available! Playback not supported!\x1b[0m');
  }

  if (!waylandAvailable) {
    console.warn('\x1b[31mWarning: Wayland socket not available! Graphics rendering not available!\x1b[0m');
  }

  start(remote, pkg);
}

function warnIfDirectOnlyOptions(options) {
  const active = Object.keys(directOnlyRunOptions)
    .filter(key => key in (options.rawOptions ?? {}))
    .map(key => `--${key}`);

  if (active.length > 0) {
    console.warn(`Warning: the following options are ignored when running via middleware: ${active.join(', ')}`);
  }
}

function pushAndRun(remoteName, pkg, options) {
  const workDir = makeWorkDir();
  try {
    return pushCommand(remoteName, pkg, workDir, options);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function run(remoteName, pkg, options) {
  const remote = new Remote(remoteName);

  if (Package.fromPath(pkg, null)) {
    pkg = pushAndRun(remoteName, pkg, options);
  }

  const [id, version] = Package.parsePackageFullName(pkg);

  if (!version && options.direct) {
    throw new Error('--direct cannot be used with a package ID (no version). Provide a full package name to run directly.');
  }

  const store = new RemoteMWPackageStore(remote);
  const pm = new RemotePackageManager(remote);
  const appManager = new RemoteAppManager(remote);

  if (!options.direct) {
    let isInstalled;
    if (version) {
      isInstalled = pm.isPackageInstalled(id, version);
      if (!isInstalled) {
        if (remote.dirExists(remote.getPkgDir({ id, version })) || store.getPackagePath(id, version)) {
          console.log(`Package ${pkg} not installed, trying to run directly...`);
        } else {
          throw new Error(`Package ${pkg} not installed!`);
        }
      }
    }

    if (!version || isInstalled) {
      warnIfDirectOnlyOptions(options);
      let launchFailed = false;
      try {
        console.log(`Trying to run ${pkg} via middleware...`);
        appManager.launch(pkg);
      } catch (err) {
        if (appManager.isActive() || !version) {
          if (version) {
            console.log(`Middleware launch failed; use --direct to skip middleware and run directly`);
          }
          throw err;
        }
        launchFailed = true;
      }
      if (!launchFailed) {
        if (appManager.focus(pkg)) {
          console.log(`Application is running and focused!`);
        } else {
          console.warn(`Warning: application is running but could not be focused!`);
        }
        return;
      }
    }
  }

  const pkgs = new Set();
  deployFromRemoteStoreIfNeeded(remote, store, id, version, pkgs);

  runDirect(remote, pkg, options);
}

exports.run = run;

exports.runOptions = {
  develop(params, result) {
    if (params.options.develop === "") {
      Object.assign(result, {
        uid: result.uid ?? 0,
        gid: result.gid ?? 0,
        userns: result.userns ?? false,
      });
      return true;
    }
    return false;
  },

  uid(params, result) {
    if (params.options.uid) {
      Object.assign(result, {
        uid: +params.options.uid,
      });
      return true;
    }
    return false;
  },

  gid(params, result) {
    if (params.options.gid) {
      Object.assign(result, {
        gid: +params.options.gid,
      });
      return true;
    }
    return false;
  },

  userns(params, result) {
    const userns = params.options.userns;
    let value;

    switch (userns) {
      case "true":
        value = true;
        break;
      case "false":
        value = false;
        break;
      default:
        return false;
    }

    Object.assign(result, {
      userns: value,
    });

    return true;
  },

  "clear-storage"(params, result) {
    if (params.options["clear-storage"] === "") {
      Object.assign(result, {
        clearStorage: true,
      });
      return true;
    }
    return false;
  },

  "rw-overlay"(params, result) {
    const paramValue = params.options["rw-overlay"];
    let rwOverlay;

    switch (paramValue) {
      case "true":
        rwOverlay = true;
        break;
      case "false":
        rwOverlay = false;
        break;
      default:
        return false;
    }

    Object.assign(result, {
      rwOverlay,
    });

    return true;
  },

  direct(params, result) {
    if (params.options.direct === "") {
      result.direct = true;
      return true;
    }
    return false;
  },
};
