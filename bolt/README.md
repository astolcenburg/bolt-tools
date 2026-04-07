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
      The following options apply to direct mode only (a warning is printed if used in MW mode):
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
```

A detailed description of the `bolt fetch` command can be found in the [docs/fetch.md](docs/fetch.md) file.
A detailed description of the `bolt make` command can be found in the [docs/make.md](docs/make.md) file.
A detailed description of the `bolt push` command can be found in the [docs/push.md](docs/push.md) file.
A detailed description of the `bolt run` command can be found in the [docs/run.md](docs/run.md) file.
A description of the local package store can be found in the [docs/local-package-store.md](docs/local-package-store.md) file.

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

Bolt reads a global configuration file from `~/.bolt/config.json`. This allows you to set default
values for options so you don't need to specify them on every invocation. Options provided on the
command line always take precedence over the global configuration.

Supported options:

| Option | Description                                      |
|--------|--------------------------------------------------|
| `key`  | Default path to the RSA private key (PEM format) |
| `cert` | Default path to the X.509 certificate (PEM format) |
| `packageStore*` | Package store settings used by `bolt fetch` (`packageStoreURL`, `packageStoreType`, etc.). See [docs/fetch.md](docs/fetch.md) |

Example `~/.bolt/config.json`:
```json
{
  "key": "/home/user/.bolt/signing.key.pem",
  "cert": "/home/user/.bolt/signing.cert.pem"
}
```

Relative paths are resolved relative to the directory containing the config file (`~/.bolt/`),
so the example above can be simplified to:
```json
{
  "key": "signing.key.pem",
  "cert": "signing.cert.pem",
  "packageStoreURL": "https://packages.example.com/bolts"
}
```

With this configuration in place, `bolt make` and `bolt pack` will sign packages automatically
without requiring `--key` and `--cert` on every invocation.

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
