# Local File Share

A peer-to-peer file sharing application that allows direct file transfers between devices on the same local network.

## Features

- Direct device-to-device file transfers using WebRTC
- No cloud storage or intermediate servers for file data
- Multi-file batch transfers with queue management
- Progress tracking for ongoing transfers
- Support for both File System Access API and IndexedDB storage backends
- Automatic reconnection and retry mechanisms
- Idle timeout detection

## Quick Start

### Development

```bash
# Start both server and client in development mode
npm run dev

# The server will run on port 3000
# The client dev server will run on port 5173
# Open http://localhost:5173 in your browser
```

### Production

```bash
# Build the application
npm run build

# Start the production server
npm start

# The server will run on port 3000
# Open http://localhost:3000 in your browser
```

## Docker

### Build and Run

```bash
# Build the Docker image
docker build -t local-file-share .

# Run the container
docker run -p 3000:3000 local-file-share

# Open http://localhost:3000 in your browser
```

### Docker Compose

```bash
docker-compose up -d

# Open http://localhost:3000 in your browser
```

## Environment Variables

- `PORT`: Server port (default: 3000)
- `HOST`: Server host (default: 0.0.0.0)
- `NODE_ENV`: Set to "production" for production mode
- `STATIC_DIR`: Path to client static files (default: auto-detected)

## Project Structure

- `packages/server/`: Signaling server using WebSocket
- `packages/client/`: Web application using Lit and TypeScript
- `packages/shared/`: Shared utilities and types

## Testing

```bash
# Run unit tests
npm run test

# Run with watch mode
npm run test:watch

# Run E2E tests (requires Playwright)
npm run test:e2e
```

## Linting and Formatting

```bash
# Check for lint errors
npm run lint

# Format all files
npm run format
```

## Architecture

The application uses a peer-to-peer architecture with WebRTC for direct data transfer:

1. **Signaling Server**: Manages device discovery and connection handshakes via WebSocket
2. **WebRTC Connection**: Establishes direct peer connections for file transfers
3. **File Transfer Protocol**: Chunk-based transfer with ACK/NACK for reliability
4. **Storage Backends**: Supports both File System Access API (Chrome/Edge) and IndexedDB (Safari/Firefox)

## Browser Support

- Chrome (recommended)
- Edge
- Safari (with IndexedDB fallback)
- Firefox (with IndexedDB fallback)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

MIT
