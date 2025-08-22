# Setup Ubuntu runner

Install requirements for running program repo CI jobs.

```yaml
- uses: solana-program/actions/setup-ubuntu@v1
  with:
    cargo-cache-key: my-cache-key-specific
    cargo-cache-fallback-key: my-cache-key
    cargo-cache-local-key: my-local-cache-key
    pnpm: true
    stable-toolchain: true
    nightly-toolchain: "nightly-2025-02-16"
    clippy: true
    rustfmt: true
    solana: "2.3.4"
    cli: true
    purge: true
```

- Inputs:
  - `cargo-cache-key`: The key to cache cargo dependencies. Skips cargo caching if not provided.
  - `cargo-cache-fallback-key`: The fallback key to use when caching cargo dependencies. Default to not using a fallback key.
  - `cargo-cache-local-key`: The key to cache local cargo dependencies. Skips local cargo caching if not provided.
  - `pnpm`: Install pnpm if `true`. Defaults to `false`.
  - `stable-toolchain`: Install stable toolchain specified in `rust-toolchain.toml` if `true`. Defaults to `false`.
  - `nightly-toolchain`: Install nightly toolchain specified as cargo invocations, e.g. `"nightly-2025-02-16"`.
  - `clippy`: Install Clippy with the nightly toolchain specified in `nightly-toolchain` if `true`. Defaults to `false`. Requires `nightly-toolchain`.
  - `rustfmt`: Install Rustfmt with the nightly toolchain specified in `nightly-toolchain` if `true`. Defaults to `false`. Requires `nightly-toolchain`.
  - `solana`: Install Solana specified as a major-minor-patch version, e.g. `"2.3.4"`.
  - `cli`: Install CLI dependencies if `true`. Defaults to `false`.
  - `purge`: Purge unused ubuntu runner directories if `true`. Defaults to `false`.
