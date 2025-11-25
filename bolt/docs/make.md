# bolt make Command Overview

## Purpose

The `bolt make` command streamlines the process of building [bolt packages](https://github.com/rdkcentral/oci-package-spec)
by using instructions defined in `bolt.json` configuration files.

## Usage

```
bolt make <target> [--install] [--force-install]
```

- `<target>` corresponds to a file named `<target>.bolt.json`. Example: `bolt make myapp` looks for `myapp.bolt.json`.
- This file must follow the format described in the [format of bolt.json files](#format-of-boltjson-files) section.
- The tool locates the file as described in the [locating bolt.json files](#locating-boltjson-files) section.
- Upon successful execution a [bolt package](https://github.com/rdkcentral/oci-package-spec) is created in the current working directory.
- The bolt package is named `<id>+<version>.bolt`, where [id](https://github.com/rdkcentral/oci-package-spec/blob/main/metadata.md#id) and
[version](https://github.com/rdkcentral/oci-package-spec/blob/main/metadata.md#version) are extracted from the package config file.

## Options

| Option          | Description                                                                          |
|-----------------|--------------------------------------------------------------------------------------|
| (none)          | Builds the package but does not install it.                                          |
| --install       | Installs the generated package into the [local package store](#local-package-store). |
| --force-install | Same as `--install`, but overwrites any existing package with the same name.         |

These options simplify sharing packages across multiple build environments, which is necessary for [dependency handling](#dependency-handling).

## Format of bolt.json Files

Each `bolt.json` file defines how a package is built.

Required properties:
- `config` - path to the [package config](https://github.com/rdkcentral/oci-package-spec/blob/main/metadata.md) file (relative to the `bolt.json` file).
- Exactly one build instruction property: [`direct`](#direct) or [`bitbake`](#bitbake).

Example:
```
{
  "config": "com.rdkcentral.myapp.json",
  "direct": {
    "empty": true
  }
}
```

If saved as `myapp.bolt.json`, this provides instructions for
```
bolt make myapp
```

## Build Instruction Properties

### direct

```
  "direct": {
    "empty": true
  }
```

- Creates a package containing only the referenced config file.
- No additional artifacts are included.

### bitbake

```
  "bitbake": {
    "image": "base-bolt-image"
  }
```

- Runs: `bitbake base-bolt-image`
- Searches for the resulting OCI image in:
  - `tmp-glibc/deploy/images/arm/base-bolt-image.tar`
  - `tmp-glibc/deploy/images/arm64/base-bolt-image.tar`
  - `tmp-glibc/deploy/images/amd64/base-bolt-image.tar`
- The first found OCI image is packaged into the [bolt package](https://github.com/rdkcentral/oci-package-spec).

## Dependency handling

If the package config declares [dependencies](https://github.com/rdkcentral/oci-package-spec/blob/main/metadata.md#dependencies),
they must be available in the [local package store](#local-package-store).
The tool uses these dependencies to eliminate redundant artifacts from the root filesystem (e.g. the OCI image contents).
Missing dependencies cause `bolt make` to fail.

## Local Package Store

- Directory name: `bolts`
- Recommended location: your home directory
- Created manually:
```
mkdir ${HOME}/bolts
```
- Located by traversing upward from:
  - The directory defined by [`BUILDDIR`](https://docs.yoctoproject.org/ref-manual/variables.html#term-BUILDDIR), or
  - The current directory (if `BUILDDIR` is undefined).

## Locating bolt.json Files

When running `bolt make <target>`, the tool searches for `<target>.bolt.json` by starting from either:
- The directory listed in the last line of `conf/setup.done` (under [`BUILDDIR`](https://docs.yoctoproject.org/ref-manual/variables.html#term-BUILDDIR)), or
- The current directory (if `conf/setup.done` is not found).

From the starting directory, the tool traverses upward toward the filesystem root, and at each level looks in:
- The current directory
- The `package-configs` subdirectory

## Examples

- Build a package named myapp:
```
bolt make myapp
```
- Build and install the package:
```
bolt make myapp --install
```
- Force install (overwrite existing):
```
bolt make myapp --force-install
```
