import { DataChannelFactory } from '../../../packages/client/src/webrtc/DataChannelFactory.js';
import { describe, expect, it, vi } from 'vitest';

describe('DataChannelFactory', () => {
  it('createDataChannel creates a channel with the given name', () => {
    if (typeof RTCPeerConnection === 'undefined') {
      return;
    }

    const peer = new RTCPeerConnection();
    const channel = DataChannelFactory.createDataChannel(peer, {
      name: 'test-channel',
      ordered: true,
      bufferedAmountLowThreshold: 1024,
    });

    expect(channel.label).toBe('test-channel');
    expect(channel.ordered).toBe(true);
    expect(channel.bufferedAmountLowThreshold).toBe(1024);
  });

  it('createStandardChannels creates control and data channels', () => {
    if (typeof RTCPeerConnection === 'undefined') {
      return;
    }

    const peer = new RTCPeerConnection();
    const channels = DataChannelFactory.createStandardChannels(peer);

    expect(channels.control.label).toBe('control');
    expect(channels.data.label).toBe('data');
    expect(channels.control.bufferedAmountLowThreshold).toBe(0);
    expect(channels.data.bufferedAmountLowThreshold).toBe(1048576); // 1 MiB
  });

  it('createDataChannel uses default values for optional parameters', () => {
    if (typeof RTCPeerConnection === 'undefined') {
      return;
    }

    const peer = new RTCPeerConnection();
    const channel = DataChannelFactory.createDataChannel(peer, {
      name: 'default-channel',
    });

    expect(channel.label).toBe('default-channel');
    expect(channel.ordered).toBe(true);
    expect(channel.bufferedAmountLowThreshold).toBe(1048576); // default from Constants
  });
});
