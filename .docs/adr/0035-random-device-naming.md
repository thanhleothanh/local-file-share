# 35. Random Device Naming with Descriptive Names

**Status**: Accepted  
**Date**: 2026-06-04  
**Supersedes**: Device naming section of ADR-0031

## Context

ADR-0031 originally proposed auto-generating device names based on user agent type with sequential numbering ("Mobile #1", "Desktop #2", etc.). This approach requires server-side state to track device counts per type, or results in duplicate names if each device generates its name independently.

Numbered names also lack personality and may be confusing when multiple devices of the same type are present.

## Decision

**Use the `random-words` library to generate descriptive, memorable names** in the format: `{adjective} {animal}` (e.g., "Happy Fox", "Sleepy Tiger", "Angry Bear").

Each device generates its name independently when the page loads. The name is used for display in the device list UI and does not need to be unique (though collisions are unlikely with sufficient word diversity).

## Consequences

**Positive:**
- No server-side state required for name generation
- More memorable and user-friendly than sequential numbers
- Works identically in all environments
- Adds personality to the user experience

**Negative:**
- Small dependency on `random-words` library
- Non-unique names possible (though rare with good word lists)
- Less predictable for debugging

## Alternatives Considered

1. **Server-assigned numbered names**: Server tracks device counts per type. Pros: Guaranteed uniqueness. Cons: Requires server state, more complex, duplicates ADR-0031's original issue.
2. **UUID-based names**: Use full or partial UUID (e.g., "Mobile-abc123"). Pros: Guaranteed uniqueness, no dependencies. Cons: Not user-friendly, hard to remember.
3. **User-editable names**: Let users choose their own names. Pros: Maximum user control. Cons: Requires UI, users may choose confusing or duplicate names.
