# Local Package Store

The local package store is a directory on the developer's machine where bolt packages are stored.
It is used by:

- `bolt make` — to resolve [package dependencies](make.md#dependency-handling) and to install
  built packages when `--install` or `--force-install` is used.
- `bolt fetch` — to [download packages](fetch.md) from a remote package store server.
- `bolt push` — to [locate packages by name](push.md#locating-the-package) when no file path is
  provided.

## Location

- Directory name: `bolts`
- Recommended location: your home directory
- Created manually:
```
mkdir ${HOME}/bolts
```
- Located by traversing upward from:
  - The directory defined by [`BUILDDIR`](https://docs.yoctoproject.org/ref-manual/variables.html#term-BUILDDIR), or
  - The current directory (if `BUILDDIR` is undefined).
