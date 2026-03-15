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

const { homedir } = require('node:os');
const { join } = require('node:path');

exports.verbose = false;
exports.GLOBAL_CONFIG_PATH = join(homedir(), '.bolt', 'config.json');
exports.READ_CHUNK_SIZE = 64 * 1024;
exports.REMOTE_MW_PACKAGE_STORE_DIR = "/mnt/media/apps/dac_apps/apps";
exports.REMOTE_DATA_DIR = "/data/bolt";
exports.REMOTE_PACKAGES_DIR = exports.REMOTE_DATA_DIR + "/packages";
exports.REMOTE_MOUNTS_DIR = exports.REMOTE_DATA_DIR + "/mounts";
exports.REMOTE_BUNDLES_DIR = exports.REMOTE_DATA_DIR + "/bundles";
exports.REMOTE_GPU_LAYER_FS = "/usr/share/gpu-layer/rootfs";
exports.REMOTE_GPU_CONFIG = "/usr/share/gpu-layer/config.json";
exports.AI2_MANAGERS_ENABLED_FILE = "/opt/ai2managers";
// select random UID and GID (34567) to avoid conflicts with existing users/groups
exports.DEFAULT_UID = 34567;
exports.DEFAULT_GID = 34567;
exports.PROCESS_HOME_DIR = "/home";
exports.PACKAGE_MANAGER_CALLSIGN = "org.rdk.PackageManagerRDKEMS";
exports.APP_MANAGER_CALLSIGN = "org.rdk.AppManager";
