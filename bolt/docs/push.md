# bolt push Command Overview

## Purpose

The `bolt push` command copies a bolt package to a remote device via SSH and optionally installs
it through the device middleware.

## Usage

```
bolt push <remote> <package> [--direct]
```

- `<remote>` is a hostname or SSH alias of the target device, accessible in non-interactive mode.
- `<package>` identifies the package to push. See [Locating the package](#locating-the-package).

## Options

| Option   | Description                                                                                              |
|----------|----------------------------------------------------------------------------------------------------------|
| --direct | Skip middleware installation and deploy the package directly to the bolt packages directory on the device. |

## Locating the package

The `<package>` argument is resolved in the following order:

1. **File path** — if the argument contains a path separator, it is used as a file path directly
   (relative or absolute). The file must exist.

2. **Bare file name** — if the argument has no path separator and ends in `.bolt`, it is looked up
   as a file in the current directory.

3. **Package name** — if the argument has no path separator and no `.bolt` extension, the extension
   is appended and the resulting file is looked up first in the current directory, then in the
   [local package store](local-package-store.md).

## Installation behaviour

By default, `bolt push` attempts to install the package through the device middleware after copying
it to the device:

1. The `.bolt` file is copied to the remote device's bolt packages directory.
2. A `PackageManager.install` request is sent via Thunder on the device.
3. If installation succeeds and the package appears in the middleware package store, the `.bolt`
   file is removed from the device and the command exits.
4. If installation fails:
   - If the `PackageManager` plugin is **not active**, the command falls back to
     [direct deployment](#direct-deployment).
   - If the `PackageManager` plugin **is active**, an error is logged and the command exits without
     performing direct deployment.

Use `--direct` to skip steps 2–4 and always deploy directly.

## Direct deployment

Direct deployment unpacks the `.bolt` archive into the bolt packages directory on the device.
Any previously mounted or deployed instance of the same package is removed first.

## Examples

- Push a package by name:
```
bolt push mydevice com.rdkcentral.myapp+0.0.1
```
- Push a package by file path:
```
bolt push mydevice /home/user/build/com.rdkcentral.myapp+0.0.1.bolt
```
- Push and deploy directly, bypassing middleware:
```
bolt push mydevice com.rdkcentral.myapp+0.0.1 --direct
```
