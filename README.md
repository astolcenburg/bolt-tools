# bolt-tools

Tools for packaging build artifacts into OCI-compliant **bolt** packages and for deploying and
running them on compatible devices.

## Tools

* [bolt](bolt/README.md) — command-line tool for working with **bolt** packages: OCI-compliant
  application bundles (`.bolt` files) following the
  [oci-package-spec](https://github.com/rdkcentral/oci-package-spec). It builds packages from
  build artifacts (directly or via bitbake), optionally signs them, manages them in a local
  package store, and deploys, runs and controls them on a compatible device over SSH.
  It can also fetch packages from a remote store and inspect, extract and diff their contents.
  Detailed documentation of the individual commands is available in [bolt/docs](bolt/docs).
* [gpu-layer-poc](gpu-layer-poc) — proof of concept script and device configurations for setting up
  the GPU layer on a remote device over SSH.
