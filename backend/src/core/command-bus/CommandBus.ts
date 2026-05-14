/**
 * Command Bus - Mock implementation for build
 * This is a temporary mock to fix import errors during build
 */

export class CommandBus {
  async execute(command: any): Promise<any> {
    return {
      success: true,
      commandId: command.id,
      timestamp: Date.now()
    };
  }

  register(_commandType: string, _handler: any): void {
    // Mock implementation
  }

  unregister(_commandType: string): void {
    // Mock implementation
  }
}

// Create and export a singleton instance
const commandBus = new CommandBus();
export default commandBus;
