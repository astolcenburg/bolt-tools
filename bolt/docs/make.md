# bolt make Command Overview

## Purpose

The `bolt make` command streamlines the process of building [bolt packages](https://github.com/rdkcentral/oci-package-spec)
by using instructions defined in `bolt.json` configuration files.

## Usage

```
bolt make <target|target.bolt.json> [--install] [--force-install] [--sbom[=full|with-gpl-sources|optimized]] [--no-sstate] [--key=<key.pem>] [--cert=<cert.pem>]
```

- `<target>` corresponds to a file named `<target>.bolt.json`. Example: `bolt make myapp` looks for `myapp.bolt.json`, located as described in the [locating bolt.json files](#locating-boltjson-files) section.
- Alternatively, pass a `.bolt.json` file directly. Example: `bolt make ./configs/myapp.bolt.json` builds from exactly that file, with no tree search.
- This file must follow the format described in the [format of bolt.json files](#format-of-boltjson-files) section.
- Upon successful execution a [bolt package](https://github.com/rdkcentral/oci-package-spec) is created in the current working directory.
- The bolt package is named `<id>+<version>.bolt`, where [id](https://github.com/rdkcentral/oci-package-spec/blob/main/metadata.md#id) and
[version](https://github.com/rdkcentral/oci-package-spec/blob/main/metadata.md#version) are extracted from the package config file.

## Options

| Option                  | Description                                                                          |
|-------------------------|--------------------------------------------------------------------------------------|
| (none)                  | Builds the package but does not install it.                                          |
| --install               | Installs the generated package into the [local package store](#local-package-store). |
| --force-install         | Same as `--install`, but overwrites any existing package with the same name.         |
| --sbom\[=MODE\]         | Generates a SPDX SBOM during the bitbake build. `MODE` is one of `full` (default when no value is given), `with-gpl-sources`, or `optimized`. See [SBOM Generation](#sbom-generation). Only valid for [`bitbake`](#bitbake) targets; using it with a [`direct`](#direct) target causes `bolt make` to fail. |
| --no-sstate             | Passes `--no-setscene` to `bitbake`, disabling sstate cache restoration so every task is re-executed. Only valid for [`bitbake`](#bitbake) targets; using it with a [`direct`](#direct) target causes `bolt make` to fail. |
| --key=\<key.pem\>       | Signs the package using the specified RSA private key (PEM format). Produces a [cosign-compatible](https://github.com/rdkcentral/oci-package-spec/blob/main/format.md#signature-manifest) signature manifest inside the bolt package. |
| --cert=\<cert.pem\>     | Stores the given certificate together with the signature. The certificate must match the private key. Requires `--key`. |

The `--key` and `--cert` options can also be set globally in `~/.bolt/config.json` so they don't need
to be specified on every invocation. See the [Global Configuration](../README.md#global-configuration) section in the README.

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

The `direct` property supports two modes:

#### empty

```
  "direct": {
    "empty": true
  }
```

- Creates a package containing only the referenced config file.
- No additional artifacts are included.

#### archive

```
  "direct": {
    "archive": "rootfs.tar.gz"
  }
```

- Uses the specified gzip-compressed tar archive as the package rootfs content.
- The archive path is resolved relative to the bolt.json file.
- An optional `script` property can be specified to produce the archive before packaging:

```
  "direct": {
    "script": "./build-rootfs.sh",
    "archive": "output/rootfs.tar.gz"
  }
```

- The script path is resolved relative to the bolt.json file.
- The script runs with its working directory set to the directory in which the script is located.
- A non-zero exit code from the script fails the build.

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

## SBOM Generation

When `--sbom` is passed (bitbake targets only), `bolt make` writes a single `sbom.conf`
file into the per-build temp directory and invokes `bitbake -R <path>` so that the
configuration is layered on top of the regular config parse.

`sbom.conf` always contains:

```
INHERIT += "create-spdx"
SPDX_PRETTY = "1"
```

The `SPDX_INCLUDE_SOURCES` / `SPDX_ARCHIVE_SOURCES` block depends on the SBOM mode:

- **`full`** (default): both variables are set to `1` unconditionally, so sources are
  archived for every recipe regardless of license or role:

  ```
  SPDX_INCLUDE_SOURCES = "1"
  SPDX_ARCHIVE_SOURCES = "1"
  ```
- **`with-gpl-sources`**: both variables resolve to `1` only for recipes whose
  `LICENSE` contains `GPL` (covering GPL, LGPL, AGPL) **and** that are not host-side
  tooling. Recipes inheriting `native`, `nativesdk`, `cross`, `crosssdk`, or
  `cross-canadian` are excluded because their binaries never reach the image. The condition
  is a bitbake inline-python expression evaluated per recipe using `bb.data.inherits_class`:

  ```
  SPDX_INCLUDE_SOURCES = "${@'1' if 'GPL' in (d.getVar('LICENSE') or '') and not any(bb.data.inherits_class(c, d) for c in ('native','nativesdk','cross','crosssdk','cross-canadian')) else '0'}"
  SPDX_ARCHIVE_SOURCES = "${@'1' if 'GPL' in (d.getVar('LICENSE') or '') and not any(bb.data.inherits_class(c, d) for c in ('native','nativesdk','cross','crosssdk','cross-canadian')) else '0'}"
  ```
- **`optimized`**: uses the same bitbake configuration as `with-gpl-sources`,
  but applies post-processing to the generated SBOM: external SPDX documents are
  inlined into a single `image.spdx.json`, and only source archives for packages
  that reach the image (filtered via `CONTAINS` / `RUNTIME_DEPENDENCY_OF`
  traversal) are copied. This mode requires the SBOM to be in SPDX 2.2 format.
  In case of problems, `with-gpl-sources` is recommended as an alternative.

After the build, before the `.bolt` package is produced, `bolt make` locates the
Yocto-managed `<image>-<machine>.spdx.tar.zst` symlink in `DEPLOY_DIR_IMAGE` (the machine
name is taken from the deploy path that contains the built image) and the corresponding
`license.manifest` in `${DEPLOY_DIR}/licenses/<image>-<machine>/`, then builds the following
layout next to the `.bolt` package:

```
sbom/<machine>/<id>+<version>/
├── sbom/                  # extracted contents of <image>-<machine>.spdx.tar.zst
│                          # and per-recipe source archives (recipe-*.tar.zst)
│                          # copied from ${DEPLOY_DIR}/spdx/<machine>/recipes/
├── image.spdx.json        # only in `optimized` mode: a single SPDX document
│                          # with all external SPDX docs inlined
└── license.manifest       # copied from Yocto's per-image licenses directory
```

In `full` and `with-gpl-sources` modes, per-recipe source archives are copied
best-effort: if `${DEPLOY_DIR}/spdx/<machine>/recipes/` is missing or contains no
`recipe-*.tar.zst` entries, the SBOM tree is still generated, just without the
source archives.

In `optimized` mode, per-recipe source archives are copied selectively: only
archives for packages that actually reach the image (determined by walking
`CONTAINS` and `RUNTIME_DEPENDENCY_OF` relationships from the image package) and
whose license requires sources (GPL-family or `NOASSERTION`) are copied. Packages
with no `packageFileName` recorded in the SPDX document are reported via a
warning and skipped; if `packageFileName` is set but the archive is missing on
disk, `bolt make` fails.

The `<id>+<version>/` subtree is recreated on every run, but only for the machine being
built — SBOM trees for other machines are left untouched. `bolt make` fails (before the
`.bolt` package is (re)generated) if either the SBOM symlink or `license.manifest` is
missing, so the existing `.bolt` is left in place when SBOM generation cannot complete.

## Dependency handling

If the package config declares [dependencies](https://github.com/rdkcentral/oci-package-spec/blob/main/metadata.md#dependencies),
they must be available in the [local package store](#local-package-store).
The tool uses these dependencies to eliminate redundant artifacts from the root filesystem (e.g. the OCI image contents).
Missing dependencies cause `bolt make` to fail.

## Local Package Store

See [local-package-store.md](local-package-store.md).

## Locating bolt.json Files

When running `bolt make <target>`, the tool searches for `<target>.bolt.json` by starting from either:
- The directory listed in the last line of `conf/setup.done` (under [`BUILDDIR`](https://docs.yoctoproject.org/ref-manual/variables.html#term-BUILDDIR)), or
- The current directory (if `conf/setup.done` is not found).

From the starting directory, the tool traverses upward toward the filesystem root, and at each level looks in:
- The current directory
- The `package-configs` subdirectory

When the argument is itself a path ending in `.bolt.json` (for example `bolt make ./configs/myapp.bolt.json`),
no search is performed: the tool builds strictly from that file, and fails if it does not exist.

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
- Build with SBOM and source archives (bitbake targets only):
```
bolt make myapp --sbom
```
- Build and sign the package with a private key:
```
bolt make myapp --key=signing.key.pem
```
- Build, sign, and embed a certificate:
```
bolt make myapp --key=signing.key.pem --cert=signing.cert.pem
```
