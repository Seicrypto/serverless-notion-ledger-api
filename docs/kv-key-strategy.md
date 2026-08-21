# KV Key Strategy

This project uses Cloudflare KV as a TTL-first storage layer for short-lived data and snapshots.

## Naming Strategy

Use colon-separated prefixes:

- first segment = bounded domain
- second segment = purpose
- later segments = lookup identity

Example shape:

```text
domain:purpose:subjectId:tokenId
```

This keeps keys easy to scan, grep, and extend without requiring a central registry document to list every concrete key.

## Design Rules

- Prefer one logical record per key.
- Prefer keys that can be addressed directly without listing or searching.
- Prefer TTL at write time for expiring data.
- Avoid read-modify-write JSON blobs for unrelated temporary fields under the same key.

## Why

- KV is strongest when the key itself describes the lookup path.
- TTL automatically removes expired temporary records, so most auth-style flows do not need scheduled cleanup logic.
- Splitting temporary records into separate keys avoids unnecessary coupling, reduces write contention, and keeps future feature work simpler.
