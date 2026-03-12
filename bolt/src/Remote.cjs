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

const { exec, execNoOutput } = require('./utils.cjs');
const config = require('./config.cjs');
const { writeFileSync, rmSync } = require('node:fs');

class Remote {
  static useScpLegacy = true;

  constructor(name) {
    this.name = name;
    this.thunderRequestId = 100;
  }

  exec(command, params) {
    let execFunc;
    let sshParam;
    if (!params || params.stdio !== 'inherit') {
      execFunc = exec;
      sshParam = "";
    } else {
      execFunc = execNoOutput;
      sshParam = "-tt";
    }
    return execFunc(`ssh ${sshParam} ${this.name} '${command}'`, params);
  }

  isMounted(dir) {
    return exec(`ssh ${this.name} "mountpoint ${dir} > /dev/null 2>&1"; echo $?`).trim() === "0";
  }

  mount(from, to) {
    exec(`ssh ${this.name} mount ${from} ${to}`);
  }

  unmount(dir) {
    exec(`ssh ${this.name} umount ${dir}`);
  }

  mountWithDMVerity(pkg, layerInfo, mountDir) {
    const loop = exec(`ssh ${this.name} /sbin/losetup -f --show ${layerInfo.path}`).trim();
    exec(`ssh ${this.name} /usr/sbin/veritysetup open ${loop} ${pkg} ${loop} --hash-offset ${layerInfo.offset} ${layerInfo.roothash}`);
    exec(`ssh ${this.name} mount /dev/mapper/${pkg} ${mountDir}`);
  }

  isDMVerityDevice(name) {
    return exec(`ssh ${this.name} "/usr/sbin/dmsetup status ${name} > /dev/null 2>&1"; echo $?`).trim() === "0";
  }

  mkdir(dir) {
    exec(`ssh ${this.name} mkdir -p ${dir}`);
  }

  rmdir(dir) {
    exec(`ssh ${this.name} rm -rf ${dir}`);
  }

  copyFile(localFile, remoteFile) {
    try {
      exec(`scp ${Remote.useScpLegacy ? '-O ' : ''}${localFile} ${this.name}:${remoteFile}`);
    } catch (e) {
      if (Remote.useScpLegacy && e.message.includes('unknown option -- O')) {
        exec(`scp ${localFile} ${this.name}:${remoteFile}`);
        Remote.useScpLegacy = false;
      } else {
        throw e;
      }
    }
  }

  fileExists(path) {
    return exec(`ssh ${this.name} "test -f ${path}"; echo $?`).trim() === "0";
  }

  dirExists(path) {
    return exec(`ssh ${this.name} "test -d ${path}"; echo $?`).trim() === "0";
  }

  socketExists(path) {
    return exec(`ssh ${this.name} "test -S ${path}"; echo $?`).trim() === "0";
  }

  storeObject(path, object) {
    if (config.verbose) {
      console.log(JSON.stringify(object, null, 2));
    }
    const tmpFile = exec(`mktemp -p .`).trim();
    try {
      writeFileSync(tmpFile, JSON.stringify(object, null, 2));
      this.copyFile(tmpFile, path);
    } finally {
      rmSync(tmpFile);
    }
  }

  parseJSONFile(path) {
    return JSON.parse(this.getTextFile(path));
  }

  getTextFile(path) {
    return exec(`ssh ${this.name} cat ${path}`);
  }

  getPkgDir(pkg) {
    return config.REMOTE_PACKAGES_DIR + "/" + pkg;
  }

  getPkgBundleDir(pkg) {
    return config.REMOTE_BUNDLES_DIR + "/" + pkg;
  }

  getPkgMountDir(pkg) {
    return config.REMOTE_MOUNTS_DIR + "/" + pkg;
  }

  isPkgMounted(pkg) {
    return this.isMounted(this.getPkgMountDir(pkg));
  }

  unmountPkg(pkg) {
    this.unmount(this.getPkgMountDir(pkg));
    if (this.isDMVerityDevice(pkg)) {
      exec(`ssh ${this.name} /usr/sbin/dmsetup remove ${pkg}`);
      exec(`ssh ${this.name} /sbin/losetup -D`);
    }
  }

  unmountPkgWithDeps(pkg) {
    if (this.isPkgMounted(pkg)) {
      this.unmountBundles();
      this.unmountPkg(pkg);
    }
  }

  unmountBundles() {
    exec(`ssh ${this.name} 'df | awk {"print \\$6"} | grep ${config.REMOTE_BUNDLES_DIR} | while read DIR; do umount $DIR; done'`);
  }

  makeThunderRequest(request) {
    request.jsonrpc = "2.0";
    if (!request.id) {
      request.id = ++this.thunderRequestId;
    }
    return exec(`ssh ${this.name} curl http://127.0.0.1:9998/jsonrpc -d '${JSON.stringify(JSON.stringify(request))}'`);
  }
}

exports.Remote = Remote;
