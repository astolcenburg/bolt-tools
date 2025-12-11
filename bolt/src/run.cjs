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
const { makeTemplate, applyGPUConfig } = require('./runtime-config.cjs');
const config = require('./config.cjs');

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
          console.warn('\n\n\x1b[31mFile /usr/sbin/veritysetup and/or /usr/sbin/dmsetup not found! Cannot enable dm-verity!\x1b[0m\n\n');
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
    console.log(`Running ${pkg} using new AppManagers environment`);
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
    jsonrpc: "2.0",
    id: 4,
    method: createDisplayMethod,
    params: createDisplayParams
  };
  remote.makeThunderRequest(createDisplay);

  const setFocus = {
    jsonrpc: "2.0",
    id: 5,
    method: setFocusMethod,
    params: {
      client: pkg
    }
  };
  remote.makeThunderRequest(setFocus);

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
    rwDirs = `${bundleDir}/rw/work ${bundleDir}/rw/upper${config.PROCESS_HOME_DIR}`;
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

  remote.mkdir(`${bundleRootfsDir} ${rwDirs}`);
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
    try {
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
    } catch (e) {
      console.error(`${e}`);
      process.exit(-1);
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

function run(remoteName, pkg, options) {
  const remote = new Remote(remoteName);

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
    console.error(`GPU layer not found!`);
    console.error(`Please make sure the ${config.REMOTE_GPU_CONFIG} exists and contains valid information.`);
    console.error(`See https://github.com/rdkcentral/bolt-tools/tree/main/gpu-layer-poc for help.`);
    process.exit(-1);
  }

  setupResources(remote, pkg);

  const waylandSocketPath = getWaylandSocketPath(pkg);
  if (remote.socketExists(waylandSocketPath)) {
    bundleConfig.mounts.push({
      source: waylandSocketPath,
      destination: waylandSocketPath,
      type: "bind",
      options: [
        "rbind",
        "rw"
      ]
    });
    const pathArray = waylandSocketPath.split("/");
    bundleConfig.process.env.push(`WAYLAND_DISPLAY=${pathArray.pop()}`);
    bundleConfig.process.env.push(`XDG_RUNTIME_DIR=${pathArray.join("/")}`);
  }

  const rialtoSocketPath = getRialtoSocketPath(pkg);
  if (remote.socketExists(rialtoSocketPath)) {
    bundleConfig.mounts.push({
      source: rialtoSocketPath,
      destination: rialtoSocketPath,
      type: "bind",
      options: [
        "rbind",
        "rw"
      ]
    });
    bundleConfig.process.env.push(`RIALTO_SOCKET_PATH=${rialtoSocketPath}`);
  }

  layerDirs.reverse();
  prepareBundle(remote, pkg, bundleConfig, layerDirs, options);

  if (!remote.socketExists(rialtoSocketPath)) {
    console.warn('\n\n\x1b[31mRialto socket not available! Playback not supported!\x1b[0m\n\n');
  }

  if (!remote.socketExists(waylandSocketPath)) {
    console.warn('\n\n\x1b[31mWayland socket not available! Graphics rendering not available!\x1b[0m\n\n');
  }

  start(remote, pkg);
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
};
