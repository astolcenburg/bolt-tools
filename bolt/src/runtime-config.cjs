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

const config = require('./config.cjs');

const template = {
  "ociVersion": "1.0.2",
  "process": {
    "terminal": true,
    "user": {
      "uid": config.DEFAULT_UID,
      "gid": config.DEFAULT_GID,
    },
    "args": [
    ],
    "env": [
      "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      "TERM=xterm",
    ],
    "cwd": "/",
    "capabilities": {
      "bounding": [
        "CAP_SETPCAP",
        "CAP_FSETID",
        "CAP_KILL",
        "CAP_AUDIT_WRITE",
        "CAP_NET_BIND_SERVICE",
        "CAP_SETUID",
        "CAP_NET_RAW",
        "CAP_SETGID",
        "CAP_CHOWN"
      ],
      "effective": [
        "CAP_SETPCAP",
        "CAP_FSETID",
        "CAP_KILL",
        "CAP_AUDIT_WRITE",
        "CAP_NET_BIND_SERVICE",
        "CAP_SETUID",
        "CAP_NET_RAW",
        "CAP_SETGID",
        "CAP_CHOWN"
      ],
      "inheritable": [
        "CAP_SETPCAP",
        "CAP_FSETID",
        "CAP_KILL",
        "CAP_AUDIT_WRITE",
        "CAP_NET_BIND_SERVICE",
        "CAP_SETUID",
        "CAP_NET_RAW",
        "CAP_SETGID",
        "CAP_CHOWN"
      ],
      "permitted": [
        "CAP_SETPCAP",
        "CAP_FSETID",
        "CAP_KILL",
        "CAP_AUDIT_WRITE",
        "CAP_NET_BIND_SERVICE",
        "CAP_SETUID",
        "CAP_NET_RAW",
        "CAP_SETGID",
        "CAP_CHOWN"
      ],
      "ambient": [
        "CAP_SETPCAP",
        "CAP_FSETID",
        "CAP_KILL",
        "CAP_AUDIT_WRITE",
        "CAP_NET_BIND_SERVICE",
        "CAP_SETUID",
        "CAP_NET_RAW",
        "CAP_SETGID",
        "CAP_CHOWN"
      ]
    },
    "rlimits": [
      {
        "type": "RLIMIT_NOFILE",
        "hard": 1024,
        "soft": 1024
      },
      {
        "type": "RLIMIT_NPROC",
        "hard": 300,
        "soft": 300
      },
      {
        "type": "RLIMIT_RTPRIO",
        "hard": 6,
        "soft": 6
      }
    ],
    "noNewPrivileges": true
  },
  "root": {
    "path": "rootfs"
  },
  "hostname": "default",
  "mounts": [
    {
      "destination": "/tmp",
      "type": "tmpfs",
      "source": "tmpfs",
      "options": [
        "nosuid",
        "noexec",
        "nodev"
      ]
    },
    {
      "destination": "/proc",
      "type": "proc",
      "source": "proc"
    },
    {
      "destination": "/dev",
      "type": "tmpfs",
      "source": "tmpfs",
      "options": [
        "nosuid",
        "strictatime",
        "mode=755",
        "size=65536k"
      ]
    },
    {
      "destination": "/dev/pts",
      "type": "devpts",
      "source": "devpts",
      "options": [
        "nosuid",
        "noexec",
        "newinstance",
        "ptmxmode=0666",
        "mode=0620"
      ]
    },
    {
      "destination": "/dev/shm",
      "type": "tmpfs",
      "source": "shm",
      "options": [
        "nosuid",
        "noexec",
        "nodev",
        "mode=1777",
        "size=65536k"
      ]
    },
    {
      "destination": "/dev/mqueue",
      "type": "mqueue",
      "source": "mqueue",
      "options": [
        "nosuid",
        "noexec",
        "nodev"
      ]
    },
    {
      "destination": "/sys",
      "type": "bind",
      "source": "/sys",
      "options": [
        "rbind",
        "nosuid",
        "noexec",
        "nodev",
        "ro"
      ]
    },
  ],
  "annotations": {
    "org.opencontainers.image.architecture": "arm",
    "org.opencontainers.image.exposedPorts": "",
    "org.opencontainers.image.os": "linux",
    "org.opencontainers.image.stopSignal": "",
    "run.oci.hooks.stderr": "/dev/stderr",
    "run.oci.hooks.stdout": "/dev/stdout"
  },
  "linux": {
    "uidMappings": [
    ],
    "gidMappings": [
    ],
    "namespaces": [
      {
        "type": "pid"
      },
      {
        "type": "ipc"
      },
      {
        "type": "uts"
      },
      {
        "type": "mount"
      }
    ],
    "maskedPaths": [
      "/proc/kcore",
      "/proc/latency_stats",
      "/proc/timer_list",
      "/proc/timer_stats",
      "/proc/sched_debug",
      "/sys/firmware",
      "/proc/scsi"
    ],
    "readonlyPaths": [
      "/proc/asound",
      "/proc/bus",
      "/proc/fs",
      "/proc/irq",
      "/proc/sys",
      "/proc/sysrq-trigger"
    ],
    "resources": {
      "devices": [
        {
          "allow": false,
          "access": "rwm"
        },
      ]
    },
    "devices": [
    ]
  }
};


function makeTemplate(options) {
  const result = JSON.parse(JSON.stringify(template));

  if (options.uid !== undefined || options.gid !== undefined) {
    result.process.user.uid = options.uid ?? config.DEFAULT_UID;
    result.process.user.gid = options.gid ?? config.DEFAULT_GID;
  }

  if (options.userns ?? true) {
    result.linux.namespaces.push({
      type: "user",
    });

    result.linux.uidMappings.push({
      containerID: result.process.user.uid,
      hostID: result.process.user.uid,
      size: 1,
    });

    result.linux.gidMappings.push({
      containerID: result.process.user.gid,
      hostID: result.process.user.gid,
      size: 1,
    });
  }

  return result;
}

function addDevice(config, path, type, major, minor) {
  config.linux.devices.push({
    path,
    type,
    major,
    minor
  });

  config.linux.resources.devices.push({
    allow: true,
    type,
    major,
    minor,
    access: "rw"
  });
}

function hexToNumber(str) {
  if (typeof str === "string") {
    const val = Number.parseInt(str, 16);
    if (!Number.isNaN(val)) {
      return val;
    }
  }
  throw new Error(`Cannot parse ${str} as hex number`);
}

function processDevNodeEntry(remote, config, devNode, groupIds) {
  try {
    const [perm, majorHex, minorHex, groupName] = remote.exec(`stat -c '%A:%t:%T:%G' ${devNode}`).trim().split(":");
    if (perm.length === 10 && (perm[0] === "c" || perm[0] === "b")) {
      addDevice(config, devNode, perm[0], hexToNumber(majorHex), hexToNumber(minorHex));
      if (perm[7] === "r" && perm[8] === "w") {
      } else if (groupIds.includes(groupName) && perm[4] === "r" && perm[5] === "w") {
      } else {
        console.warn(`Changing access rights for ${devNode}! (was ${perm}, group: ${groupName})`);
        remote.exec(`chmod a+rw ${devNode}`);
      }
    } else {
      throw new Error(`not a device (perm: ${perm})`);
    }
  } catch (e) {
    console.warn(`Ignoring devNode entry ${devNode}: ${e}`);
  }
}

function processGroupIdEntry(remote, config, groupId) {
  try {
    const gid = +remote.exec(`grep '^${groupId}:' /etc/group`).trim().split(":")[2];
    config.process.user.additionalGids.push(gid);
    config.linux.gidMappings.push({
      containerID: gid,
      hostID: gid,
      size: 1
    });
  } catch (e) {
    console.warn(`Ignoring groupId entry ${groupId}: ${e}`);
  }
}

function processFileEntry(config, fileEntry) {
  let source;
  let destination;

  switch (fileEntry?.type) {
    case "bind":
      source = fileEntry?.source;
      destination = fileEntry?.destination;
      break;
    case "symlink":
      source = fileEntry?.target;
      destination = fileEntry?.linkPath;
      break;
  }

  if (source && destination) {
    config.mounts.push({
      source,
      destination,
      type: "bind",
      options: [
        "rbind",
        "nosuid",
        "nodev",
        "ro"
      ]
    });
  } else {
    console.warn(`Ignoring unknown file entry: ${JSON.stringify(fileEntry, null, 2)}`);
  }
}

function applyGPUConfig(remote, config, gpuConfig) {
  const devNodes = gpuConfig?.vendorGpuSupport?.devNodes ?? [];
  const files = gpuConfig?.vendorGpuSupport?.files ?? [];
  const groupIds = gpuConfig?.vendorGpuSupport?.groupIds ?? [];

  for (let node of devNodes) {
    processDevNodeEntry(remote, config, node, groupIds);
  }
  for (let file of files) {
    processFileEntry(config, file);
  }
  if (groupIds.length && !Array.isArray(config.process.user.additionalGids)) {
    config.process.user.additionalGids = [];
  }
  for (let groupId of groupIds) {
    processGroupIdEntry(remote, config, groupId);
  }
}

exports.makeTemplate = makeTemplate;
exports.applyGPUConfig = applyGPUConfig;
