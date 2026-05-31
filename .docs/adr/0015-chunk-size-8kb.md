# 15. 8KB Chunk Size

**Status**: Accepted  
**Date**: 2026-05-31

## Context

WebRTC data channels have a message size limit of approximately 16KB. We need to chunk files for transfer. The chunk size affects:
- Number of messages (smaller chunks = more messages)
- Memory usage (larger chunks = more per-message memory)
- Reliability (larger chunks = higher chance of message loss)

## Decision

Use **8KB (8192 bytes) chunk size** for all file transfers.

## Consequences

**Positive:**
- Safe margin below 16KB browser limit
- Works reliably across all browsers
- Good balance between message count and memory
- For 500MB file: ~64,000 chunks (manageable)

**Negative:**
- More messages than 16KB chunks (~2x)
- Slightly more overhead (41-byte header per chunk = ~0.5%)

**Calculation for 500MB file:**
- 500MB = 524,288,000 bytes
- Chunks: ceil(524288000 / 8192) = 64,000 chunks
- With 41-byte header: 64,000 × 41 = 2,624,000 bytes overhead (~0.5%)
- Total data: ~526.9MB

## Alternatives Considered

1. **16KB Chunks**: Maximum per message. Pros: Fewest messages. Cons: Risk of hitting browser limits.
2. **15KB Chunks**: Safe margin. Pros: Fewer messages. Cons: Still close to limit.
3. **4KB Chunks**: Very safe. Pros: Reliable. Cons: 2x more messages than 8KB.
4. **Dynamic Chunks**: Use max safe size per browser. Pros: Optimal. Cons: Complex, inconsistent.
