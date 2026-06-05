# bolt edit Command Overview

## Purpose

The `bolt edit` command produces a new bolt package from an existing one with a replaced
package config. Every layer and its blob is copied from the original package byte-for-byte
and only the package config is swapped, so the result is identical in quality to a package
produced by [`bolt make`](make.md), only faster and without rebuilding the rootfs.

## Usage

```
bolt edit <package.bolt> [--config=<config.json>] [--set=<json>] [--key=<key.pem>] [--cert=<cert.pem>]
```

- `<package.bolt>` is an existing bolt package whose layers are copied unchanged.
- The base config is `--config=<config.json>` when given, otherwise the config already in the
  package. It must follow the
  [oci-package-spec metadata format](https://github.com/rdkcentral/oci-package-spec/blob/main/metadata.md).
- `--set=<json>` is a JSON object whose properties override the base config (see
  [set](#set) below). At least one of `--config` or `--set` is required.
- The resulting config is written as provided except for `versionName`, which is derived to
  record the edit (see [versionName](#versionname) below), and `urn:rdk:config:platform`, which
  is inherited from the original package (see [platform](#platform) below).
- The output package is named `<id>+<version>.bolt` from the resulting config and is written to
  the current working directory. Changing `id` or `version` renames the output accordingly.

## set

`--set=<json>` overrides individual top-level properties of the base config without restating
the whole config. The value is a JSON object that is shallow-merged over the base, so each
property it lists replaces the base property of the same name as a whole (nested objects are
not merged field by field):

```
bolt edit app.bolt --set='{"version":"2.0","name":"My App"}'
```

`versionName` listed in `--set` is ignored, as it is always derived (see
[versionName](#versionname)). An invalid `--set` value (not valid JSON, or not a JSON object)
is reported and the command aborts.

## versionName

`bolt edit` does not keep the `versionName` from `--config`. Instead it derives one from the
original package so the result records that it was produced by editing:

```
edit/<original-id>+<original-versionName>
```

For example, editing `com.example.app` with `versionName`
`1.0-3-gabc123/com.example.lib+2.1-5-gdef456` yields:

```
edit/com.example.app+1.0-3-gabc123/com.example.lib+2.1-5-gdef456
```

If the edited package's `versionName` already starts with `edit/`, it is kept unchanged, so
editing an already-edited package does not nest the marker further.

## platform

The `urn:rdk:config:platform` entry under `configuration` is inherited from the original
package, so the edited package keeps targeting the same platform without restating it. To
change it, provide `configuration` in the base config or via `--set`; when the resulting config
already carries a platform it is used as provided and the original package's platform is
ignored.

## Options

| Option                  | Description                                                                          |
|-------------------------|--------------------------------------------------------------------------------------|
| --config=<config.json>  | Base package config. Defaults to the config already in the package.                  |
| --set=<json>            | JSON object whose properties override the base config. Required if `--config` is not given. |
| --key=<key.pem>         | Sign the new package using the given private key (PEM format).                       |
| --cert=<cert.pem>       | Store the given certificate together with the signature. Requires `--key`.           |

## Signatures

A package signature covers the package manifest, and replacing the config changes the
manifest. Any signature on the input package is therefore not carried over. Pass `--key`
(and optionally `--cert`) to sign the edited package, exactly as with `bolt make` and
`bolt pack`.
