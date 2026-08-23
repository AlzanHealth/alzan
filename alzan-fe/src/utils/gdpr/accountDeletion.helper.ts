export async function revokeWearableConnectionsBeforeAccountDeletion(
  disconnectCoros: () => Promise<unknown>,
): Promise<void> {
  await disconnectCoros();
}
