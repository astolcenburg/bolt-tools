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

  bolt run <remote> <package-name>
      Execute a bolt package on a remote device

Where:
  target        Basename of a file named <target>.bolt.json, which defines build instructions
                see https://github.com/rdkcentral/bolt-tools/blob/main/bolt/docs/make.md

  oci-image.tar An OCI-compliant image packaged as a tarball

  layer.tgz     A rootfs layer packaged as a gzip-compressed tarball

  config.json   A package config file compliant with
                https://github.com/rdkcentral/oci-package-spec/blob/main/metadata.md

  remote        Hostname or alias of a device accessible via SSH in non-interactive mode

  package-name  Name of a bolt package generated using the pack command
```

A detailed description of the `bolt make` command can be found in the [docs/make.md](docs/make.md) file.

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
