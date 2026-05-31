# 5. 500MB Universal File Size Limit

**Status**: Accepted  
**Date**: 2026-05-31

## Context

Mobile browsers (particularly iOS Safari) have memory limitations that prevent handling very large files. We need to support both desktop and mobile users with a consistent experience. Large files can cause browser crashes or excessive memory usage.

## Decision

Impose a **500MB universal file size limit** for all platforms. Files larger than 500MB are rejected before transfer begins.

**Implementation:**
- Sender: Check file.size ≤ 500MB before offering
- Receiver: Check file.size ≤ 500MB before accepting

## Consequences

**Positive:**
- Predictable behavior across all devices
- Prevents browser crashes on mobile
- Simple to implement and validate
- Users know the limit upfront

**Negative:**
- Cannot transfer files >500MB
- Desktop Chrome/Edge could theoretically handle larger files (2-5GB)
- Users with large files must use alternative methods

## Alternatives Considered

1. **Per-Platform Limits**: 500MB mobile, 2GB desktop. Pros: Maximizes each platform. Cons: Complex, inconsistent UX.
2. **No Limit**: Let browser handle it. Pros: Maximum flexibility. Cons: Unpredictable crashes on mobile.
3. **Dynamic Limit**: Detect available memory. Pros: Optimal. Cons: Complex, unreliable across browsers.
4. **Streaming with File System API**: Use Chrome's File System Access API for unlimited desktop. Pros: No limit on desktop. Cons: Not supported on iOS/mobile, complex fallbacks.
