# bolt extract Command Overview

## Purpose

The `bolt extract` command pulls individual components out of an existing bolt package, such
as the package config, the OCI manifest, the filesystem layer, or the unpacked rootfs. It is
the inverse of [`bolt pack`](../README.md): instead of combining a config and a layer into a
package, it takes a package apart.

## Usage

```
bolt extract <package.bolt> [--out=<dir>] [--package-config[=<path>]] [--manifest[=<path>]]
                            [--index[=<path>]] [--layer[=<path>]] [--signature[=<path>]]
                            [--signature-manifest[=<path>]] [--signature-config[=<path>]]
                            [--signature-layer[=<path>]] [--signature-certificate[=<path>]]
                            [--rootfs[=<dir>]] [--package[=<dir>]]
```

- `<package.bolt>` is an existing bolt package.
- Each component flag selects one part of the package to extract. Any number of flags can be
  combined in a single invocation; the package is unpacked once and every requested component
  is written in the same pass.
- `--out=<dir>` selects the directory the components are written into (see
  [Output destinations](#output-destinations)).
- When no component flag is given, all available components are extracted into a single
  `<id>+<version>/` directory (see [Default](#default)).

## Output destinations

Components are written into an output directory, one file or subdirectory per component, each
named after the component and its format (see [Default names](#default-names)).

- `--out=<dir>` selects the output directory; it must not already exist and is created for you.
  It cannot be `-` (stdout). When omitted, it defaults to `<id>+<version>/` for a flagless
  extraction (which likewise must not already exist), and to the current directory when at least
  one component flag is given.
- A component flag may carry its own value to override that component's destination, ignoring
  `--out`:
  - `--package-config=<path>` — write to the given file (single-file components) or directory
    (directory components).
  - `--package-config=-` — write the content to standard output. Only [single-file
    components](#components) support `-`; using it with a directory component is an error.

Single-file components overwrite an existing file at their destination. Directory components
(`--rootfs`, `--package`) refuse to overwrite and fail if the destination already exists.

More than one component may target standard output in the same invocation; their contents are
written in the order the flags are listed. Status messages are printed to standard error, so
they never mix with content written to standard output.

## Components

Single-file components:

| Flag                      | Content                                                                  |
|---------------------------|--------------------------------------------------------------------------|
| `--package-config`        | The package config metadata (JSON).                                      |
| `--manifest`              | The OCI image manifest (JSON).                                           |
| `--index`                 | The OCI `index.json`.                                                    |
| `--layer`                 | The content layer payload; for erofs layers the dm-verity hash tree is stripped. |
| `--signature`             | The raw cosign signature. Fails if the package is not signed.            |
| `--signature-manifest`    | The cosign signature manifest (JSON). Fails if the package is not signed.|
| `--signature-config`      | The config blob referenced by the signature manifest (JSON). Fails if the package is not signed. |
| `--signature-layer`       | The cosign simple signing payload referenced by the signature manifest (JSON). Fails if the package is not signed. |
| `--signature-certificate` | The signing certificate (PEM). Fails if the package carries none.        |

Directory components (cannot be written to standard output):

| Flag         | Content                                                                       |
|--------------|-------------------------------------------------------------------------------|
| `--rootfs`   | The unpacked filesystem contents of the layer (erofs, tar, tar+gzip, or zip).  |
| `--package`  | The complete OCI layout, including the raw layer blob (erofs + dm-verity).    |

For an erofs layer, `--layer` strips the dm-verity hash tree. To obtain the raw layer blob with
the hash tree appended, use `--package` and read it from the extracted `blobs/` directory.

## Default names

Unless a component flag carries an explicit value, each component is written into the
[output directory](#output-destinations) under a name formed from the component and its format:

| Component                 | Name                        |
|---------------------------|-----------------------------|
| `--package-config`        | `package-config.json`       |
| `--manifest`              | `manifest.json`             |
| `--index`                 | `index.json`                |
| `--layer`                 | `layer.<ext>`               |
| `--signature`             | `signature.sig`             |
| `--signature-manifest`    | `signature-manifest.json`   |
| `--signature-config`      | `signature-config.json`     |
| `--signature-layer`       | `signature-layer.json`      |
| `--signature-certificate` | `signature-certificate.pem` |
| `--rootfs`                | `rootfs/`                   |
| `--package`               | `package.oci/`              |

The `--layer` extension is derived from the layer's media type (for example
`application/vnd.rdk.package.content.layer.v1.erofs+dmverity` yields `erofs`), falling back to
`layer` when no format can be determined.

## Default

With no component flags, `bolt extract <package.bolt>` extracts every available component into a
single `<id>+<version>/` directory (created in the current working directory, or wherever
`--out` points). This directory must not already exist:

```
<id>+<version>/
├── package-config.json        # package config metadata
├── manifest.json              # OCI image manifest
├── index.json                 # OCI index.json
├── layer.<ext>                # content layer payload (e.g. layer.erofs), if the package has one
├── signature.sig              # raw cosign signature, if signed
├── signature-manifest.json    # cosign signature manifest, if signed
├── signature-config.json      # signature manifest config blob, if signed
├── signature-layer.json       # cosign simple signing payload, if signed
├── signature-certificate.pem  # signing certificate, if present
├── rootfs/                    # unpacked filesystem contents, if the package has a content layer
└── package.oci/               # complete OCI layout, including the raw layer blob
```

`package`, `package-config`, `manifest`, and `index` are always extracted. `layer` and `rootfs`
are included only when the package has a content layer; `signature`, `signature-manifest`,
`signature-config`, and `signature-layer` only when the package is signed; and
`signature-certificate` only when the signature carries a certificate. Passing any component flag switches the default output directory to the current
directory, writing the same names there instead; use `--out=<dir>` to collect them elsewhere.

## Examples

```
# Extract everything into a <id>+<version>/ directory
bolt extract app.bolt

# Extract everything into a chosen directory
bolt extract app.bolt --out=./app

# Config and manifest into ./meta, using their default names
bolt extract app.bolt --out=./meta --package-config --manifest

# Just the config, to a chosen path
bolt extract app.bolt --package-config=app-config.json

# Print the config to stdout and pipe it onward
bolt extract app.bolt --package-config=- | jq .version

# Config and manifest in one pass
bolt extract app.bolt --package-config --manifest

# Unpack the rootfs into a directory
bolt extract app.bolt --rootfs=./app-rootfs

# Get the raw layer blob via the full OCI layout
bolt extract app.bolt --package=./app-oci
```

## Deprecated: OCI image tar form

```
bolt extract <oci-image.tar> <layer.tgz>
```

The two-argument form extracts the top filesystem layer from an OCI image tarball and is
**deprecated**. It is retained for backward compatibility and is selected automatically when
two positional arguments are given. New usage should target a `.bolt` package with the
component flags described above.
