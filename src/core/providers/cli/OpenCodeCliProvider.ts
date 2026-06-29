import { AcpCliProvider } from './AcpCliProvider';

/**
 * OpenCode CLI provider — extends AcpCliProvider with the 'opencode-cli' provider ID.
 *
 * OpenCode supports the ACP protocol, so it reuses all ACP logic.
 * Only the CLI binary name, provider ID, and display name differ.
 */
export class OpenCodeCliProvider extends AcpCliProvider {
  constructor(cliPath: string, model: string, maxTokens: number) {
    super(cliPath, model, maxTokens, 'opencode-cli', 'OpenCode CLI (Local)');
  }
}
