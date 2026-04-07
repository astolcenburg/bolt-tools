# bolt run Command Overview

## Purpose

The `bolt run` command executes a bolt package on a remote device.

## Usage

```
bolt run <remote> <package> [options]
```

- `<remote>` is a hostname or SSH alias of the target device, accessible in non-interactive mode.
- `<package>` identifies the package to run. See [Package argument](#package-argument).

## Package argument

The `<package>` argument is interpreted as follows:

- **Package ID** (`id` only, e.g. `com.rdkcentral.myapp`) — always launched via middleware.
  `--direct` cannot be combined with a bare package ID.

- **Package name** (`id+version`, e.g. `com.rdkcentral.myapp+0.0.1`) — auto-detects whether the
  package is installed via middleware and branches accordingly. See [Execution modes](#execution-modes).

- **File path** (e.g. `./build/com.rdkcentral.myapp+0.0.1.bolt`) — the package is pushed to the
  device first using the same logic as `bolt push`, then run. See [push.md](push.md) for details
  on how the push behaves.

## Execution modes

### Middleware launch (default when package is installed)

When the package is installed on the device, it is launched via middleware.
The middleware manages the runtime environment.

### Direct execution (fallback or `--direct`)

When the package is not installed, or `--direct` is specified, the package is executed directly
using `crun`. This involves:

1. Mounting the erofs layer with optional dm-verity verification.
2. Building an OCI bundle with overlay filesystem.
3. Launching the process via `crun`.

## Options

| Option                    | Description                                                                            |
|---------------------------|----------------------------------------------------------------------------------------|
| --direct                  | Skip middleware detection and always run directly using crun.                          |

The following options apply to **direct mode only**. A warning is printed and they are ignored when
the package is launched via middleware:

| Option                    | Description                                                                            |
|---------------------------|----------------------------------------------------------------------------------------|
| --develop                 | Run with elevated privileges (uid=0, gid=0, userns disabled) to simplify debugging.    |
| --clear-storage           | Clear persistent storage before running the package.                                   |
| --rw-overlay=\<true/false\> | Enable/disable read/write overlay layer over the package rootfs (default: enabled).  |
| --uid=\<uid\>             | Run with the specified user ID.                                                        |
| --gid=\<gid\>             | Run with the specified group ID.                                                       |
| --userns=\<true/false\>   | Enable/disable user namespace.                                                         |

## Examples

- Run a package by ID via middleware:
```
bolt run mydevice com.rdkcentral.myapp
```
- Run a package by name (auto-detects middleware vs direct):
```
bolt run mydevice com.rdkcentral.myapp+0.0.1
```
- Push a .bolt file and run it:
```
bolt run mydevice ./build/com.rdkcentral.myapp+0.0.1.bolt
```
- Force direct execution, bypassing middleware:
```
bolt run mydevice com.rdkcentral.myapp+0.0.1 --direct
```
- Run with elevated privileges for debugging:
```
bolt run mydevice com.rdkcentral.myapp+0.0.1 --direct --develop
```
