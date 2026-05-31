# ISSUE-011: Bidirectional Transfer

## Parent
PRD-002: File Transfer Protocol

## What to build
Ensure file transfers work bidirectionally - both devices in a connection can send and receive files simultaneously. This includes both devices being able to offer files, accept offers from each other, and handle concurrent transfers.

## Acceptance criteria
- [x] Device A can send files to Device B while Device B is also sending files to Device A
- [x] Both directions use the same queue management (FIFO)
- [x] Files from both directions are tracked separately in the transfer list
- [x] Direction indicator clearly shows which device is sending and which is receiving (← for receiving, → for sending)
- [x] Control messages from both directions are handled correctly
- [x] Data channel handles chunks from both directions without conflict (WebRTC data channels are bidirectional)
- [x] Connection state shows TRANSFERRING when files are moving in either direction
- [x] Queue limits apply to total queued files from both directions
- [x] Both devices can offer files simultaneously
- [x] Both devices can accept/reject files independently
- [x] Progress tracking works for both directions
- [x] Download functionality works for files received from either direction

## Blocked by
- ISSUE-002 (File Offer and Accept Protocol)
- ISSUE-003 (File Chunking and Transfer)
- ISSUE-004 (Queue Management and Limits)

## User stories covered
13. As a user, I want to send files from either device (bidirectional) so that both parties can share files
14. As a user, I want to see which direction files are being sent (sending vs receiving) so that I can track the flow

## Notes
- Data channel is bidirectional by default in WebRTC
- Control channel messages need to distinguish between directions
- File IDs should be unique per connection (UUID per file)
- Queue should handle files from both directions
- Progress tracking should be per-file, not per-direction
