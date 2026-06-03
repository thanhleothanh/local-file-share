# 5. Batch Processing for File Downloads

**Status**: Accepted  
**Date**: 2026-05-31

## Context

When downloading a large file from IndexedDB (fallback storage on Safari/iOS), we need to concatenate thousands of 16KB chunks into a single Blob for the browser's download mechanism. Loading all chunks at once would cause a memory spike equal to the file size. This ADR applies only to the IndexedDB fallback path — the primary path (File System Access API) streams directly to disk without batch processing.

## Decision

Use **batch processing** to load and concatenate chunks in manageable groups:
- Process chunks in batches of 100 (≈800KB at a time)
- Accumulate chunk data in an array
- Create final Blob when all chunks are loaded
- Trigger download, then clean up IndexedDB

## Consequences

**Positive:**
- Reduces peak memory usage by ~50% compared to loading all at once
- Works on mobile browsers with limited memory
- Simple to implement
- No external libraries required

**Negative:**
- Still requires ~500MB + 800KB peak memory ( Blob + one batch)
- Slightly slower than loading all at once
- More complex than naive approach

## Alternatives Considered

1. **streamSaver.js Library**: True streaming download without memory spike. Pros: Handles 100GB+ files. Cons: External library (~10KB), requires modern browser support.
2. **Service Worker + Fetch**: Stream from IndexedDB through service worker. Pros: True streaming. Cons: Complex setup, requires service worker.
3. **Accept Memory Spike**: Load all chunks at once. Pros: Simplest. Cons: May crash on mobile with 500MB files.
4. **Dynamic Batch Size**: Adjust batch size based on available memory. Pros: Optimal. Cons: Complex, unreliable detection.
