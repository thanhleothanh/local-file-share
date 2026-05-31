# File Sharing Context

## Purpose

The File Sharing context enables sending files between devices on the same local network without requiring internet access or external servers.

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **Connection** | A WebRTC peer-to-peer connection established between two devices via the 2-QR handshake process |
| **Connection Secret** | A randomly generated string included in QR codes to authenticate the connection between two devices |
| **Chunk** | A fixed-size (8KB) piece of file data transmitted over the WebRTC data channel |
| **Queue** | A FIFO (First-In-First-Out) ordered list of files waiting to be transferred over a connection |
| **File Transfer** | The process of sending a file from one device to another, broken into chunks and transmitted over WebRTC |
| **QR Handshake** | The two-QR code (ping-pong) process used to establish a WebRTC connection between devices |
| **Control Channel** | A WebRTC data channel dedicated to JSON signaling messages (file offers, accepts, etc.) |
| **Data Channel** | A WebRTC data channel dedicated to binary file chunk transmission |
