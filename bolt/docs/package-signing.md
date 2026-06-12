# Package Signing

Both `bolt pack` and `bolt make` support optional package signing. When `--key=<key.pem>` is provided,
a [cosign-compatible](https://github.com/rdkcentral/oci-package-spec/blob/main/format.md#signature-manifest)
signature manifest is embedded in the bolt package alongside the regular package manifest.

Optionally, `--cert=<cert.pem>` embeds the matching X.509 certificate in the signature layer.
The certificate must correspond to the provided private key — a mismatch causes the command to abort.

The `--key` and `--cert` options can also be set in the [global configuration](global-configuration.md)
so that packages are signed automatically on every invocation.

## Example

```
$ bolt pack com.rdkcentral.myapp.json myapp.tgz --key=signing.key.pem --cert=signing.cert.pem
Prepared com.rdkcentral.myapp+0.0.1.bolt package from com.rdkcentral.myapp.json and myapp.tgz
```
