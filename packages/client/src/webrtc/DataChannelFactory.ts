import { BUFFERED_AMOUNT_LOW_THRESHOLD } from '@lfs/shared';

/**
 * Factory for creating WebRTC data channels with consistent configuration.
 */
export interface DataChannelConfig {
  name: string;
  ordered?: boolean;
  maxRetransmits?: number;
  maxRetransmitTime?: number;
  bufferedAmountLowThreshold?: number;
}

export interface DataChannelPair {
  control: RTCDataChannel;
  data: RTCDataChannel;
}

/**
 * Creates a single RTCDataChannel with the given configuration.
 *
 * @param peer - The RTCPeerConnection to create the channel on
 * @param config - The channel configuration
 * @returns The created RTCDataChannel
 */
function createDataChannel(peer: RTCPeerConnection, config: DataChannelConfig): RTCDataChannel {
  const channel = peer.createDataChannel(config.name, {
    ordered: config.ordered ?? true,
    maxRetransmits: config.maxRetransmits ?? 0, // 0 = unlimited
    protocol: config.name,
  });

  // Set the buffered amount low threshold for backpressure
  channel.bufferedAmountLowThreshold = config.bufferedAmountLowThreshold ?? BUFFERED_AMOUNT_LOW_THRESHOLD;

  return channel;
}

/**
 * Creates the standard pair of data channels (control and data).
 * Both channels are reliable (ordered with unlimited retransmits).
 *
 * @param peer - The RTCPeerConnection to create the channels on
 * @returns An object with control and data channels
 */
function createStandardChannels(peer: RTCPeerConnection): DataChannelPair {
  const control = createDataChannel(peer, {
    name: 'control',
    ordered: true,
    bufferedAmountLowThreshold: 0, // Control messages are small, no backpressure needed
  });

  const data = createDataChannel(peer, {
    name: 'data',
    ordered: true,
    bufferedAmountLowThreshold: BUFFERED_AMOUNT_LOW_THRESHOLD,
  });

  return { control, data };
}

export const DataChannelFactory = {
  createDataChannel,
  createStandardChannels,
};
