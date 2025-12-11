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

exports.verbose = false;
exports.REMOTE_PACKAGES_DIR = "/data/bolt/packages";
exports.REMOTE_MOUNTS_DIR = "/data/bolt/mounts";
exports.REMOTE_BUNDLES_DIR = "/data/bolt/bundles";
exports.REMOTE_GPU_LAYER_FS = "/usr/share/gpu-layer/rootfs";
exports.REMOTE_GPU_CONFIG = "/usr/share/gpu-layer/config.json";
exports.AI2_MANAGERS_ENABLED_FILE = "/opt/ai2managers";
// select random UID and GID (34567) to avoid conflicts with existing users/groups
exports.DEFAULT_UID = 34567;
exports.DEFAULT_GID = 34567;
