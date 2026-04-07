# bolt fetch Command Overview

## Purpose

The `bolt fetch` command downloads a bolt package from a remote package store server into the
[local package store](local-package-store.md).

## Usage

```
bolt fetch <package> [--force]
```

- `<package>` is the package name (`id+version`) or file name (`id+version.bolt`).
  It may be prefixed with a sub-directory path (for example an architecture, `arm/<package>`),
  which is appended to the server URL when downloading.

## Options

| Option      | Description                                                                          |
|-------------|--------------------------------------------------------------------------------------|
| --force     | Replace the package if it already exists in the local package store.                 |

## Configuration

The remote server URL and package store type are configured in `~/.bolt/config.json`:

```json
{
  "packageStoreURL": "https://packages.example.com/bolts"
}
```

| Key                | Description                                                        |
|--------------------|--------------------------------------------------------------------|
| `packageStoreURL`  | URL of the remote package store server (required)                  |
| `packageStoreType` | Package store type: `"basic"` (default) or `"rdk"` (see below)     |
| `packageStoreUser` | Username for authentication (prompted via stdin if not configured) |

## Package Store Types

### basic (default)

Downloads packages directly from `<packageStoreURL>/<id+version>.bolt` with no authentication.
The server can be a plain static file server — no special API is required.

### rdk

Downloads packages from an RDK package store server, authenticating with a username and password.
The password is prompted via stdin on first use and never stored. If `packageStoreUser` is not set
in the config, the username is also prompted. The session is preserved between invocations; when it
expires, credentials are prompted again automatically.

Example configuration:
```json
{
  "packageStoreURL": "https://rdk.example.com",
  "packageStoreType": "rdk",
  "packageStoreUser": "myuser"
}
```

## Custom Package Store Types

Custom types can be implemented as modules placed in `~/.bolt/plugins/`. The module file must be
named `fetch-<type>.cjs` (e.g., `~/.bolt/plugins/fetch-custom.cjs` for type `"custom"`).

The module exports a factory function that receives a context object and returns an async fetch
handler:

```js
module.exports = function(ctx) {
  return async function(packageStoreURL, packageFileName, options) {
    await ctx.downloadPackage(`${packageStoreURL}/${packageFileName}`);
  };
};
```

Available helpers on the `ctx` object:

| Method                                      | Description                                               |
|---------------------------------------------|-----------------------------------------------------------|
| `ctx.downloadPackage(url, requestOptions?)` | Download a file with progress indicator                   |
| `ctx.postJSON(url, body)`                   | HTTP POST with JSON body, returns `{statusCode, headers, body}` |
| `ctx.promptCredentials(username?)`          | Prompt for username/password via stdin                    |
| `ctx.loadData()`                            | Load saved data. Return `null` if no data                 |
| `ctx.saveData(data)`                        | Save data                                                 |

## Examples

- Download a package into the local package store:
```
bolt fetch com.rdkcentral.base+0.2.0
```
- Same, using the file name form:
```
bolt fetch com.rdkcentral.base+0.2.0.bolt
```
- Download an architecture-specific package from a subdirectory on the server:
```
bolt fetch arm/com.rdkcentral.base+0.2.0
```
- Re-download, replacing an existing copy:
```
bolt fetch com.rdkcentral.base+0.2.0 --force
```
