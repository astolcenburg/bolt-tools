#!/bin/bash

# If not stated otherwise in this file or this component's LICENSE file the
# following copyright and licenses apply:
#
# Copyright 2025 RDK Management
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

set -eu

if [[ "$#" -ne 1 ]]; then
  echo "This script tries to configure the GPU layer on the remote device"
  echo
  echo "Usage:"
  echo "${0} <remote>"
  echo
  echo "Where:"
  echo "remote        - name of the device accessible via SSH in non-interactive mode"
  exit 22
fi

REMOTE_ADDRESS=${1}
MODE=${MODE:-link} # link, bind, copy

GPU_LAYER_DIR=/usr/share/gpu-layer
GPU_LAYER_FS="${GPU_LAYER_DIR}/rootfs"
GPU_LAYER_CONFIG="${GPU_LAYER_DIR}/config.json"

LIBS+=(/usr/lib/libEGL.so)
LIBS+=(/usr/lib/libEGL.so.1)
LIBS+=(/usr/lib/libGLESv1_CM.so)
LIBS+=(/usr/lib/libGLESv1_CM.so.1)
LIBS+=(/usr/lib/libGLESv2.so)
LIBS+=(/usr/lib/libGLESv2.so.2)
LIBS+=(/usr/lib/libwayland-egl.so.1)

declare -A FILE_INFO_FALLBACK

FILE_INFO_FALLBACK[/usr/lib/libEGL.so]="'libEGL.so' -> 'libEGL.so.1'"
FILE_INFO_FALLBACK[/usr/lib/libGLESv1_CM.so]="'libGLESv1_CM.so' -> 'libGLESv1_CM.so.1'"
FILE_INFO_FALLBACK[/usr/lib/libGLESv2.so]="'libGLESv2.so' -> 'libGLESv2.so.2'"

BASE_LIBS+=(libwayland-server.so)
BASE_LIBS+=(libwayland-client.so)
BASE_LIBS+=(libdl.so)
BASE_LIBS+=(libpthread.so)
BASE_LIBS+=(librt.so)
BASE_LIBS+=(libstdc++.so)
BASE_LIBS+=(libm.so)
BASE_LIBS+=(libc.so)
BASE_LIBS+=(ld-linux-armhf.so)
BASE_LIBS+=(libgcc_s.so)

declare -A PROCESSED_LIBS_SET
declare -A BASE_LIBS_SET

for LIB in "${BASE_LIBS[@]}"; do
  BASE_LIBS_SET[${LIB%.so*}]=1
done

function remote {
  ssh "${REMOTE_ADDRESS}" "$@"
}

function to_remote {
  scp -O "${1}" "${REMOTE_ADDRESS}:${2}"
}

function from_remote {
  scp -O "${REMOTE_ADDRESS}:${1}" "${2}"
}

function get_platform {
  remote cat /version.txt | grep imagename | awk -F- '{print $(NF - 1)}'
}


function get_version {
  remote cat /version.txt | grep BRANCH | awk -F= '{print $2}' | awk -F- '{print $1}'
}

function test_and_add {
  local dir=${1}
  local lib=${2}
  local path=${dir}/${lib}

  if [[ $(remote test -e "${path}"; echo $?) == "0" ]]; then
    LIBS+=("${path}")
  fi
}

function add_deps {
  local remote_lib=${1}
  local temp lib
  local libs

  temp=$(mktemp -p .)
  from_remote "${remote_lib}" "${temp}"
  libs="$(readelf -d "${temp}" | grep -e '(NEEDED)\|(FILTER)' | sed -nE 's/.*\[(.*)\].*/\1/p' | tr '\n' ' ')"

  for lib in ${libs}; do
    if [[ -z ${BASE_LIBS_SET[${lib%.so*}]:-} ]]; then
      test_and_add /lib "${lib}"
      test_and_add /usr/lib "${lib}"
    fi
  done
  rm "${temp}"
}

function main {
  local config_name
  local tmp_config

  config_name=$(get_platform)-$(get_version).json

  if [[ ! -f "${config_name}" ]]; then
    echo "File ${config_name} not found, platform not supported."
    exit 2
  fi

  remote mkdir -p "${GPU_LAYER_CONFIG%/*}"

  tmp_config=$(mktemp -p .)
  cp "${config_name}" "${tmp_config}"

  while [ ${#LIBS[@]} -gt 0 ]; do
    local lib=${LIBS[0]}
    LIBS=("${LIBS[@]:1}")

    if [[ -n ${PROCESSED_LIBS_SET[${lib}]:-} ]]; then
      continue
    fi
    PROCESSED_LIBS_SET[${lib}]=1

    local file_info
    file_info=$(remote stat -c '%N' "${lib}" 2> /dev/null || echo "${FILE_INFO_FALLBACK[${lib}]}")

    echo "Processing ${lib}..."

    if [[ "${lib}" == "${file_info}" ]]; then
      remote mkdir -p "${GPU_LAYER_FS}${lib%/*}"
      remote "rm -rf ${GPU_LAYER_FS}${lib}"
      case $MODE in
        link)
          remote "ln -f ${lib} ${GPU_LAYER_FS}${lib}"
        ;;
        copy)
          remote "cp -f ${lib} ${GPU_LAYER_FS}${lib}"
        ;;
        bind)
          remote "touch ${GPU_LAYER_FS}${lib}"
          jq ".vendorGpuSupport.files += [{ \
            \"type\": \"bind\", \
            \"source\": \"${lib}\", \
            \"destination\": \"${lib}\"\
          }]" "${tmp_config}" > "${tmp_config}.tmp" && mv "${tmp_config}.tmp" "${tmp_config}"
        ;;
      esac
      add_deps "${lib}"
    else
      local link_target
      local layer_symlink=${GPU_LAYER_FS}${lib}

      link_target=$(echo "${file_info}" | awk -F\' '{print $4}')
      remote mkdir -p "${layer_symlink%/*}"
      remote ln -sf "${link_target}" "${layer_symlink}"

      if [[ "${link_target}" == /* ]]; then
        LIBS+=("${link_target}")
      else
        LIBS+=("${lib%/*}/${link_target}")
      fi
    fi
  done

  to_remote "${tmp_config}" "${GPU_LAYER_CONFIG}"
  rm -rf "${tmp_config}"
}

main
