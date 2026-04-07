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
const { loadGlobalConfig } = require('./globalConfig.cjs');
const { globalOptions } = require('./globalOptions.cjs');
const { printError } = require('./utils.cjs');
const { diff } = require('./diff.cjs');
const { extract } = require('./extract.cjs');
const { pack, packOptions } = require('./pack.cjs');
const { push, pushOptions } = require('./push.cjs');
const { run, runOptions } = require('./run.cjs');
const { make, makeOptions } = require('./make.cjs');
const { fetch, fetchOptions } = require('./fetch.cjs');

function help() {
  console.log(`
Usage:
  bolt make <target> [--install] [--force-install] [--key=<key.pem>] [--cert=<cert.pem>]
      Build a bolt package using <target>.bolt.json
      --install           Also installs the package into the Local Package Store
      --force-install     Installs the package, overwriting any existing package with the same name
      --key=<key.pem>     Sign the package using the given private key (PEM format)
      --cert=<cert.pem>   Store the given certificate together with the signature (requires --key)

  bolt diff <bottom-oci-image.tar> <top-oci-image.tar> <layer.tgz>
      Create a diff layer that transforms the bottom image into the top image

  bolt extract <oci-image.tar> <layer.tgz>
      Extract the top filesystem layer from an OCI image

  bolt pack <config.json> <layer.tgz> [--key=<key.pem>] [--cert=<cert.pem>]
      Combine a package config and a rootfs layer into a bolt package
      --key=<key.pem>     Sign the package using the given private key (PEM format)
      --cert=<cert.pem>   Store the given certificate together with the signature (requires --key)

  bolt push <remote> <package> [--direct]
      Copy a bolt package to a remote device via SSH and optionally install it via middleware
      --direct            Skip middleware installation and deploy directly to the bolt packages directory

  bolt fetch <package> [--force]
      Download a bolt package from the configured package store server into the local package store
      <package> can be a package name (id+version) or file name (id+version.bolt)
      --force             Replace the package if it already exists in the local package store
      Package store URL, type and credentials are configured in ~/.bolt/config.json
      See https://github.com/rdkcentral/bolt-tools/blob/main/bolt/docs/fetch.md

  bolt run <remote> <package-name|package-id|package.bolt> [options]
      Execute a bolt package on a remote device.
      If a package ID is provided (without version), the package is always launched via middleware.
      If a package name is provided, middleware installation is auto-detected; if found, the package
      is launched via middleware, otherwise it is run directly using crun.
      Use --direct to skip middleware detection and always run directly.
      If a .bolt file is provided, it is pushed to the device first and then run.
      --direct               Skip middleware detection and run the package directly using crun
      The following options apply to direct mode only:
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

  package       A bolt package identified by file path, file name, or package name
                see https://github.com/rdkcentral/bolt-tools/blob/main/bolt/docs/push.md

  package-name  Name of a bolt package generated using the pack command

Global options (can be used with any command):
  --verbose     Print detailed output during execution
`);

  process.exit(-1);
}

const commands = {
  diff: { args: 3, handler: diff },
  extract: { args: 2, handler: extract },
  pack: { args: 2, handler: pack, options: packOptions },
  push: { args: 2, handler: push, options: pushOptions },
  run: { args: 2, handler: run, options: runOptions },
  make: { args: 1, handler: make, options: makeOptions },
  fetch: { args: 1, handler: fetch, options: fetchOptions },
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

const globalConfig = loadGlobalConfig();
for (const key in globalConfig) {
  if (params.options[key] === undefined && command?.options?.[key]) {
    params.options[key] = globalConfig[key];
  }
}

for (const key in globalOptions) {
  if (key in params.options) {
    if (!globalOptions[key](params)) {
      help();
    }
    delete params.options[key];
  }
}

let options;
if (command && command.args === params.args.length - 1 &&
  ((options = checkOptions(params.options, command.options ?? {})))) {
  options.rawOptions = params.options;
  new Promise(resolve => resolve(command.handler(...params.args.slice(1), options))).catch(e => {
    printError(e);
    process.exit(1);
  });
} else {
  help();
}
