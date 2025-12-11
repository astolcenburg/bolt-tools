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

const params = require('./params.cjs');
const { diff } = require('./diff.cjs');
const { extract } = require('./extract.cjs');
const { pack } = require('./pack.cjs');
const { push } = require('./push.cjs');
const { run, runOptions } = require('./run.cjs');
const { make, makeOptions } = require('./make.cjs');

function help() {
  console.log(`
Usage:
  bolt make <target> [--install] [--force-install]
      Build a bolt package using <target>.bolt.json
      --install       Also installs the package into the Local Package Store
      --force-install Installs the package, overwriting any existing package with the same name

  bolt diff <bottom-oci-image.tar> <top-oci-image.tar> <layer.tgz>
      Create a diff layer that transforms the bottom image into the top image

  bolt extract <oci-image.tar> <layer.tgz>
      Extract the top filesystem layer from an OCI image

  bolt pack <config.json> <layer.tgz>
      Combine a package config and a rootfs layer into a bolt package

  bolt push <remote> <package-name>
      Copy a bolt package to a remote device via SSH

  bolt run <remote> <package-name> [option]
      Execute a bolt package on a remote device
      --develop              Run with elevated privileges to simplify debugging
      --clear-storage        Clear persistent storage before running the package
      --rw-overlay=<true/false>
          Enable/disable read/write layer over the package rootfs
      --uid=<uid>            Run with the specified user ID
      --gid=<gid>            Run with the specified group ID
      --userns=<true/false>  Enable/disable user namespace

Where:
  target        Basename of a file named <target>.bolt.json, which defines build instructions
                see https://github.com/rdkcentral/bolt-tools/blob/main/bolt/docs/make.md

  oci-image.tar An OCI-compliant image packaged as a tarball

  layer.tgz     A rootfs layer packaged as a gzip-compressed tarball

  config.json   A package config file compliant with
                https://github.com/rdkcentral/oci-package-spec/blob/main/metadata.md

  remote        Hostname or alias of a device accessible via SSH in non-interactive mode

  package-name  Name of a bolt package generated using the pack command
`);

  process.exit(-1);
}

const commands = {
  diff: { args: 3, handler: diff },
  extract: { args: 2, handler: extract },
  pack: { args: 2, handler: pack },
  push: { args: 2, handler: push },
  run: { args: 2, handler: run, options: runOptions },
  make: { args: 1, handler: make, options: makeOptions },
};

function checkOptions(provided, allowed) {
  const result = {};
  for (let option in provided) {
    if (!(allowed[option]?.(params, result))) {
      return null;
    }
  }
  return result;
}

const command = commands[params.args[0]];
let options;
if (command && command.args === params.args.length - 1 &&
  ((options = checkOptions(params.options, command.options ?? {})))) {
  command.handler(...params.args.slice(1), options);
} else {
  help();
}
