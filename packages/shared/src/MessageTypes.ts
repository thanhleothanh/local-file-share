/**
 * WebSocket signaling message types — JSON envelope shared between server and client.
 */

export type SignalingMessageType =
  | 'register'
  | 'device-list'
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'connect-request'
  | 'connect-accepted'
  | 'connect-rejected'
  | 'accept-connect'
  | 'reject-connect'
  | 'disconnect'
  | 'device-disconnected'
  | 'ping'
  | 'pong'
  | 'error';

export interface RegisterData {
  name: string;
}

export interface DeviceListData {
  devices: DeviceDescriptor[];
}

export interface DeviceDescriptor {
  deviceId: string;
  deviceName: string;
  connectedTo: string | null;
  registeredAt: number;
}

export interface SdpData {
  sdp: string;
  type: 'offer' | 'answer';
}

export interface IceCandidateData {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

export interface ConnectRequestData {
  targetDeviceId: string;
  requesterName: string;
}

export interface AcceptConnectData {
  requesterDeviceId: string;
}

export interface RejectConnectData {
  requesterDeviceId: string;
  reason?: string;
}

export interface DisconnectData {
  targetDeviceId: string;
  reason?: string;
}

export interface ErrorData {
  code: string;
  message: string;
}

export interface SignalingEnvelope<T = unknown> {
  type: SignalingMessageType;
  from: string;
  to?: string;
  data?: T;
  timestamp: number;
}

export type RegisterMessage = SignalingEnvelope<RegisterData> & { type: 'register' };
export type DeviceListMessage = SignalingEnvelope<DeviceListData> & { type: 'device-list' };
export type OfferMessage = SignalingEnvelope<SdpData> & { type: 'offer'; to: string };
export type AnswerMessage = SignalingEnvelope<SdpData> & { type: 'answer'; to: string };
export type IceCandidateMessage = SignalingEnvelope<IceCandidateData> & { type: 'ice-candidate'; to: string };
export type ConnectRequestMessage = SignalingEnvelope<ConnectRequestData> & {
  type: 'connect-request';
  to: string;
};
export type ConnectAcceptedMessage = SignalingEnvelope<AcceptConnectData> & {
  type: 'connect-accepted';
  to: string;
};
export type ConnectRejectedMessage = SignalingEnvelope<RejectConnectData> & {
  type: 'connect-rejected';
  to: string;
};
export type AcceptConnectMessage = SignalingEnvelope<AcceptConnectData> & {
  type: 'accept-connect';
  to: string;
};
export type RejectConnectMessage = SignalingEnvelope<RejectConnectData> & {
  type: 'reject-connect';
  to: string;
};
export type DisconnectMessage = SignalingEnvelope<DisconnectData> & { type: 'disconnect' };
export type DeviceDisconnectedMessage = SignalingEnvelope<DisconnectData> & {
  type: 'device-disconnected';
};
export type PingMessage = SignalingEnvelope & { type: 'ping' };
export type PongMessage = SignalingEnvelope & { type: 'pong' };
export type ErrorMessage = SignalingEnvelope<ErrorData> & { type: 'error' };

export type AnySignalingMessage =
  | RegisterMessage
  | DeviceListMessage
  | OfferMessage
  | AnswerMessage
  | IceCandidateMessage
  | ConnectRequestMessage
  | ConnectAcceptedMessage
  | ConnectRejectedMessage
  | AcceptConnectMessage
  | RejectConnectMessage
  | DisconnectMessage
  | DeviceDisconnectedMessage
  | PingMessage
  | PongMessage
  | ErrorMessage;
