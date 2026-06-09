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
const { extractCommand, extractOptions } = require('./extract.cjs');
const { pack, packOptions } = require('./pack.cjs');
const { push, pushOptions } = require('./push.cjs');
const { run, runOptions } = require('./run.cjs');
const { make, makeOptions } = require('./make.cjs');
const { edit, editOptions } = require('./edit.cjs');
const { fetch, fetchOptions } = require('./fetch.cjs');

function help() {
  console.log(`
Usage:
  bolt make <target|target.bolt.json> [--install] [--force-install] [--sbom[=full|with-gpl-sources|optimized]] [--no-sstate] [--key=<key.pem>] [--cert=<cert.pem>]
      Build a bolt package using <target>.bolt.json, or the given .bolt.json file
      --install           Also installs the package into the Local Package Store
      --force-install     Installs the package, overwriting any existing package with the same name
      --sbom[=MODE]       Generate SPDX SBOM (bitbake targets only). MODE is one of:
                          full (default) - archive sources for every recipe regardless of
                            license/role
                          with-gpl-sources - archive sources only for GPL-family recipes
                            whose binaries reach the image (skips native/nativesdk/cross
                            /crosssdk/cross-canadian recipes)
                          optimized - same bitbake configuration as with-gpl-sources,
                            but post-processes the result: inlines external SPDX
                            documents into a single image.spdx.json and copies only
                            source archives for packages that reach the image.
                            Requires SPDX 2.2 format; if problems arise, use
                            with-gpl-sources instead.
      --no-sstate         Disable sstate cache restoration; forces a full rebuild (bitbake targets only)
      --key=<key.pem>     Sign the package using the given private key (PEM format)
      --cert=<cert.pem>   Store the given certificate together with the signature (requires --key)

  bolt edit <package.bolt> [--config=<config.json>] [--set=<json>] [--key=<key.pem>] [--cert=<cert.pem>]
      Replace the package config in an existing bolt package, reusing its content layer
      The output package is renamed if the resulting config changes the id or version
      See https://github.com/rdkcentral/bolt-tools/blob/main/bolt/docs/edit.md
      --config=<config.json>  Package config to write into the package (defaults to the original)
      --set=<json>        JSON object whose properties override the base config
      --key=<key.pem>     Sign the package using the given private key (PEM format)
      --cert=<cert.pem>   Store the given certificate together with the signature (requires --key)

  bolt diff <bottom-oci-image.tar> <top-oci-image.tar> <layer.tgz>
      Create a diff layer that transforms the bottom image into the top image

  bolt extract <package.bolt> [--out=<dir>] [--package-config[=<path>]] [--manifest[=<path>]]
                              [--index[=<path>]] [--layer[=<path>]] [--signature[=<path>]]
                              [--signature-manifest[=<path>]] [--signature-config[=<path>]]
                              [--signature-layer[=<path>]] [--signature-certificate[=<path>]]
                              [--rootfs[=<dir>]] [--package[=<dir>]]
      Extract components from a bolt package. Components are written into the --out directory
      under a name formed from the component and its format. With no flags, all available
      components are extracted and --out defaults to a <id>+<version>/ directory; with at least
      one flag it defaults to the current directory. A flag may carry its own path, or "-" to
      write to stdout (single-file components only).
      See https://github.com/rdkcentral/bolt-tools/blob/main/bolt/docs/extract.md
      --out=<dir>             Directory to extract components into
      --package-config        The package config metadata (JSON)
      --manifest              The OCI image manifest (JSON)
      --index                 The OCI index.json
      --layer                 The content layer payload (erofs, tar, tar+gzip or zip); for erofs the dm-verity hash tree is stripped
      --signature             The raw cosign signature, if the package is signed
      --signature-manifest    The cosign signature manifest (JSON), if the package is signed
      --signature-config      The cosign signature manifest config blob (JSON), if the package is signed
      --signature-layer       The cosign simple signing payload (JSON), if the package is signed
      --signature-certificate The signing certificate, if present
      --rootfs                The unpacked filesystem contents (directory)
      --package               The complete OCI layout, including the raw layer blob (directory)

  bolt extract <oci-image.tar> <layer.tgz>
      [DEPRECATED] Extract the top filesystem layer from an OCI image

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
  target        Basename of a file named <target>.bolt.json, which defines build instructions,
                or a path to a .bolt.json file to build from directly
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
  extract: { args: [1, 2], handler: extractCommand, options: extractOptions },
  pack: { args: 2, handler: pack, options: packOptions },
  push: { args: 2, handler: push, options: pushOptions },
  run: { args: 2, handler: run, options: runOptions },
  make: { args: 1, handler: make, options: makeOptions },
  edit: { args: 1, handler: edit, options: editOptions },
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
const argCount = params.args.length - 1;
const argsAccepted = command &&
  (Array.isArray(command.args) ? command.args.includes(argCount) : command.args === argCount);
if (argsAccepted &&
  ((options = checkOptions(params.options, command.options ?? {})))) {
  options.rawOptions = params.options;
  new Promise(resolve => resolve(command.handler(...params.args.slice(1), options))).catch(e => {
    printError(e);
    process.exit(1);
  });
} else {
  help();
}
