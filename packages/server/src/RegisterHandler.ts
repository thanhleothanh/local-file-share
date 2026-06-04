import type { AnySignalingMessage, DeviceDescriptor, DeviceListMessage, RegisterMessage } from '@lfs/shared';
import { Logger } from '@lfs/shared';
import type { Device } from './DeviceRegistry.js';
import type { MessageHandler, MessageHandlerContext } from './SignalingRouter.js';

export class RegisterHandler implements MessageHandler {
  readonly type = 'register' as const;
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? new Logger('RegisterHandler');
  }

  handle(ctx: MessageHandlerContext): void {
    const { client, message, registry } = ctx;
    const data = (message as RegisterMessage).data;
    const name = typeof data?.name === 'string' ? data.name : 'Unknown';

    const existing = registry.getById(message.from);
    if (existing !== null && existing.socket !== client) {
      existing.socket = client;
    }

    const device: Device = {
      deviceId: message.from,
      deviceName: name,
      socket: client,
      connectedTo: existing?.connectedTo ?? null,
      registeredAt: existing?.registeredAt ?? Date.now(),
    };
    registry.register(device);
    this.logger.info(`device registered: ${device.deviceId} ${device.deviceName}`);
  }
}

export function buildDeviceListMessage(devices: readonly DeviceDescriptor[]): DeviceListMessage {
  return {
    type: 'device-list',
    from: 'server',
    data: { devices: devices.slice() },
    timestamp: Date.now(),
  };
}

export function broadcastDeviceList(
  ctx: { broadcast: (payload: AnySignalingMessage, except?: unknown) => void },
  devices: readonly DeviceDescriptor[],
  logger?: Logger,
): void {
  const message = buildDeviceListMessage(devices);
  ctx.broadcast(message);
  (logger ?? new Logger('DeviceList')).info(`device-list broadcast (${devices.length} devices)`);
}
