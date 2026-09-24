import { transport } from '../../shared/transport';
import type { NPCReplyPayload } from '../../shared/ipc.types';

export async function sendNPCMessage(payload: NPCReplyPayload): Promise<void> {
  const result = await transport.npcReply(payload);
  if (!result.success) {
    throw new Error(`Failed to send NPC message: ${result.error.message}`);
  }
}
