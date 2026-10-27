# Install Solana

Install Solana CLI tool with optional caching and verify the installed version.

```yaml
- uses: solana-program/actions/install-solana@v1
  with:
    version: stable
    cache: true
```

- Inputs:
  - `version`: The Solana CLI version to install, either as a version number (e.g., `2.0.3`) or symbolic channel (`stable`, `beta` or `edge`). Default to `stable`.
  - `cache`: Whether the downloaded Solana CLI binary should be cached. Defaults to `true`.
  - `base_url`: The base URL to download the Solana CLI release tarball from. Defaults to `https://release.anza.xyz`.
  - `sha256`: Expected SHA-256 of the release tarball. Defaults to the digest of the matching asset on the `anza-xyz/agave` GitHub release. Channels and older releases have none; those install with a warning.