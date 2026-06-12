# bolt

This tool allows to generate **bolt** packages and run them on a compatible device.

The purpose of this tool is to demonstrate and test the concept of using **bolt** packages.
Future versions may introduce incompatible changes as the concept evolves and implementations
mature on compatible devices.

## Installation

Bolt is a Node.js script and requires no installation. To fully utilize it, you'll need to install the following command-line tools:
* node
* tar
* rsync
* umoci
* mkfs.erofs
* fsck.erofs
* veritysetup
* zip
* ssh
* scp

To use the tool from anywhere on your system, add the [bin](bin) directory to your `PATH` environment variable.

## Usage

Run `bolt` with one of the commands described below:

```
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
      The following options apply to direct mode only (ignored with a warning in middleware mode):
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
```

## Command Documentation

Detailed descriptions of the individual commands are available in the [docs](docs) directory:

| Command | Documentation | Description |
|---------|---------------|-------------|
| `bolt make` | [docs/make.md](docs/make.md) | Build a bolt package from instructions in a `.bolt.json` configuration file |
| `bolt edit` | [docs/edit.md](docs/edit.md) | Produce a new bolt package from an existing one with a replaced package config |
| `bolt extract` | [docs/extract.md](docs/extract.md) | Pull individual components out of an existing bolt package |
| `bolt fetch` | [docs/fetch.md](docs/fetch.md) | Download a bolt package from a remote package store |
| `bolt push` | [docs/push.md](docs/push.md) | Copy a bolt package to a remote device and optionally install it |
| `bolt run` | [docs/run.md](docs/run.md) | Execute a bolt package on a remote device |

The [docs/local-package-store.md](docs/local-package-store.md) file describes the local package
store — the directory on the developer's machine where bolt packages are kept and resolved from.
The [docs/global-configuration.md](docs/global-configuration.md) file describes the global
configuration file (`~/.bolt/config.json`).

## Package Signing

Both `bolt pack` and `bolt make` support optional package signing. When `--key=<key.pem>` is provided,
a [cosign-compatible](https://github.com/rdkcentral/oci-package-spec/blob/main/format.md#signature-manifest)
signature manifest is embedded in the bolt package alongside the regular package manifest.

Optionally, `--cert=<cert.pem>` embeds the matching X.509 certificate in the signature layer.
The certificate must correspond to the provided private key — a mismatch causes the command to abort.

Example:
```
$ bolt pack com.rdkcentral.myapp.json myapp.tgz --key=signing.key.pem --cert=signing.cert.pem
Prepared com.rdkcentral.myapp+0.0.1.bolt package from com.rdkcentral.myapp.json and myapp.tgz
```

## Global Configuration

Bolt reads a global configuration file from `~/.bolt/config.json`, which provides default values
for options such as the signing key and certificate or the package store settings, so they don't
need to be specified on every invocation. Options provided on the command line always take
precedence over the global configuration.

The supported options and example configurations are described in
[docs/global-configuration.md](docs/global-configuration.md).

## Example

```
$ bolt diff base-oci.tar wpe-oci.tar wpe-diff.tgz
Generated diff layer wpe-diff.tgz from base-oci.tar wpe-oci.tar

$ bolt extract base-oci.tar base.tgz
Extracted base.tgz from base-oci.tar

$ bolt pack com.rdkcentral.base.json base.tgz
Prepared com.rdkcentral.base+0.0.1.bolt package from com.rdkcentral.base.json and base.tgz

$ bolt pack com.rdkcentral.wpe.json wpe-diff.tgz
Prepared com.rdkcentral.wpe+0.0.1.bolt package from com.rdkcentral.wpe.json and wpe-diff.tgz

$ bolt pack com.rdkcentral.myapp.json myapp.tgz
Prepared com.rdkcentral.myapp+0.0.1.bolt package from com.rdkcentral.myapp.json and myapp.tgz

$ bolt push aml com.rdkcentral.base+0.0.1
Pushed com.rdkcentral.base+0.0.1.bolt to aml

$ bolt push aml com.rdkcentral.wpe+0.0.1
Pushed com.rdkcentral.wpe+0.0.1.bolt to aml

$ bolt push aml com.rdkcentral.myapp+0.0.1
Pushed com.rdkcentral.myapp+0.0.1.bolt to aml

$ bolt run aml com.rdkcentral.myapp+0.0.1
Running com.rdkcentral.myapp+0.0.1 using:
(...)
```
