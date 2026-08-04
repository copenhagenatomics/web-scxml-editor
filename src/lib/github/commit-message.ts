/**
 * Builds the default commit message offered when pushing an SCXML file to GitHub.
 * Deliberately does not embed a timestamp — git already records commit time,
 * so keeping this stable/deterministic keeps it simple and easy to test.
 */
export function generateDefaultCommitMessage(fileName: string): string {
  return `Update ${fileName} via SCXML Editor`;
}
