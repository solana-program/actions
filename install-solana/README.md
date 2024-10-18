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
  - `base-url`: The base URL to download the Solana CLI. Defaults to `https://release.solana.com` for Solana versions below 1.18.19 and `https://release.anza.xyz` for versions 1.18.19 and above or symbolic channels.