# Global Configuration

Bolt reads a global configuration file from `~/.bolt/config.json`. This allows you to set default
values for options so you don't need to specify them on every invocation. Options provided on the
command line always take precedence over the global configuration.

## Supported Options

| Option | Description                                      |
|--------|--------------------------------------------------|
| `key`  | Default path to the RSA private key (PEM format) |
| `cert` | Default path to the X.509 certificate (PEM format) |
| `packageStore*` | Package store settings used by `bolt fetch` (`packageStoreURL`, `packageStoreType`, etc.). See [fetch.md](fetch.md) |

## Examples

Example `~/.bolt/config.json`:
```json
{
  "key": "/home/user/.bolt/signing.key.pem",
  "cert": "/home/user/.bolt/signing.cert.pem"
}
```

Relative paths are resolved relative to the directory containing the config file (`~/.bolt/`),
so the example above can be simplified to:
```json
{
  "key": "signing.key.pem",
  "cert": "signing.cert.pem",
  "packageStoreURL": "https://packages.example.com/bolts"
}
```

With this configuration in place, `bolt make` and `bolt pack` will sign packages automatically
without requiring `--key` and `--cert` on every invocation.
