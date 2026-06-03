# 11. 16KB Chunk Size

**Status**: Accepted  
**Date**: 2026-06-03

## Context

WebRTC data channels have a message size limit of approximately 16KB. We need to chunk files for transfer. The original 8KB chunk size was chosen as a safe margin below this limit. With streaming and no file size limit, larger chunks reduce the total number of messages and overhead per chunk.

## Decision

Use **16KB (16384 bytes) chunk size** for all file transfers.

## Consequences

**Positive:**
- Uses the maximum safe message size — fewest possible messages
- Reduces header overhead (41-byte header per chunk is ~0.25% of 16KB, vs ~0.5% of 8KB)
- Fewer messages means less processing overhead on both sender and receiver
- `bufferedamountlow` threshold (1 MiB = 64 chunks) provides smooth backpressure

**Negative:**
- Closer to the browser message size limit — risk of hitting it if WebRTC implementation varies
- Slightly larger per-chunk memory allocation (16KB vs 8KB)

**Calculation for 1GB file:**
- 1GB = 1,073,741,824 bytes
- Chunks: ceil(1073741824 / 16384) = 65,536 chunks
- With 41-byte header: 65,536 × 41 = 2,686,976 bytes overhead (~0.25%)
- Total data: ~1.003GB

## Alternatives Considered

1. **8KB chunks**: Maximum safety margin. Cons: 2x more messages, higher overhead ratio.
2. **15KB chunks**: Slightly safer margin. Cons: Inconsistent with power-of-2 sizing, marginal benefit.
3. **Dynamic chunks**: Detect max safe size per browser. Cons: Complex, inconsistent behavior.
