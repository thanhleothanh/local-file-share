export { WebSocketClient } from './WebSocketClient.js';
export type { WebSocketClientOptions, WebSocketEvent, WebSocketFactory } from './WebSocketClient.js';
export { WebSocketAutoReconnect } from './WebSocketAutoReconnect.js';
export { ReconnectTimer } from './ReconnectTimer.js';
export { parseClientMessage, MessageParseError } from './MessageParser.js';
export { DeviceIdentity } from '../identity/DeviceIdentity.js';
export type { DeviceIdentityOptions, DeviceIdentityState } from '../identity/DeviceIdentity.js';
export { DeviceNamer, detectKind, getOrdinal, getStoredKind, setKind } from '../identity/DeviceNamer.js';
export type { DeviceKind, DeviceNamerOptions, DeviceNamerResult } from '../identity/DeviceNamer.js';
