# Local Package Store

The local package store is a directory on the developer's machine where bolt packages are stored.
It is a plain directory named `bolts` containing `<id>+<version>.bolt` files — there is no index
or any other metadata. The bolt tool never creates the store by itself; it has to be created
manually.

It is used by:

- `bolt make` — to resolve [package dependencies](make.md#dependency-handling) and to install
  built packages when `--install` or `--force-install` is used.
- `bolt fetch` — to [download packages](fetch.md) from a remote package store server.
- `bolt push` — to [locate packages by name](push.md#locating-the-package) when no file path is
  provided.

## Location and Discovery

- Directory name: `bolts`
- Recommended location: your home directory
- Created manually:
```
mkdir ${HOME}/bolts
```
- Located by traversing upward from:
  - The directory defined by [`BUILDDIR`](https://docs.yoctoproject.org/ref-manual/variables.html#term-BUILDDIR), or
  - The current directory (if `BUILDDIR` is undefined).

For example, when bolt runs in `~/work/myapp/build` (with `BUILDDIR` undefined), it checks the
following directories in order and uses the first one that exists:

```
~/work/myapp/build/bolts
~/work/myapp/bolts
~/work/bolts
~/bolts
/home/bolts
/bolts
```

Two consequences of this discovery scheme are worth noting:

- **The nearest store wins.** A `bolts` directory created inside a project shadows `~/bolts`,
  so independent projects can deliberately keep isolated package stores.
- **`BUILDDIR` takes precedence over the current directory.** Inside a sourced Yocto build
  environment the search starts from the build directory, so a different store may be found
  than when running the same command from the same shell location without the environment.

## Contents

The store holds bolt packages as files named `<id>+<version>.bolt`, in a single flat directory.
Because there is no additional metadata, the store can be managed with ordinary file operations:
copying a package file into the directory makes it available to dependency resolution and name
lookup, and deleting the file removes it.

## Example

The following session builds the base layer package from the `meta-bolt-distro` repository,
installs it into the store, and then builds an application package whose dependency on
`com.rdkcentral.base` is resolved from the store:

```
$ mkdir ~/bolts

$ cd ~/work/meta-bolt-distro
$ bolt make base --install
(...)
Installed com.rdkcentral.base+0.2.0.bolt in /home/user/bolts

$ cd ~/work/meta-bolt-myapp
$ bolt make myapp --install
(...)
Installed com.rdkcentral.myapp+1.0.0.bolt in /home/user/bolts

$ ls ~/bolts
com.rdkcentral.base+0.2.0.bolt
com.rdkcentral.myapp+1.0.0.bolt

$ bolt push stb com.rdkcentral.myapp+1.0.0
```

The final `bolt push` locates the package by name in the store, so it works from any directory
from which the store can be discovered.

Note that the example relies on the build directories being located below the home directory —
that is what makes `~/bolts` discoverable by the upward search. Running the same commands from a
directory outside the home directory would not find the store.

## When No Store Is Found

- `bolt make --install` aborts with an error.
- `bolt make` cannot resolve package dependencies, so building a package that declares
  dependencies fails.
- `bolt push <package-name>` cannot locate packages by name; only file paths and file names
  in the current directory keep working.
- `bolt fetch` aborts with an error, as there is nowhere to store the downloaded package.
