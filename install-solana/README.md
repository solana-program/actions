# Install Solana

Install Solana CLI tool with optional caching and verify the installed version.

```yaml
- uses: solana-program/actions/install-solana@v1
  with:
    release: stable
    cache: true
```

- Inputs:
  - `release`: The Solana CLI release to install, either as a version number (e.g., `v2.0.3`) or symbolic channel (`stable`, `beta` or `edge`). When specifying a version number, the version must be prefixed with a `v` (e.g., `v2.0.3`). Default to `stable`.
  - `cache`: Whether the downloaded Solana CLI release should be cached. Defaults to `true`.
  - `base-url`: The base URL to download the Solana CLI release from. Defaults to `https://release.solana.com` for Solana versions below 1.18.19 and `https://release.anza.xyz` for versions 1.18.19 and above or symbolic channels.