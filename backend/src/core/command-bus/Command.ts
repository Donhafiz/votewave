/**
 * Command Interface - Base command interface for CQRS
 * This is a temporary mock to fix import errors during build
 */

export interface Command {
  id: string;
  type: string;
  timestamp: number;
  metadata?: {
    causationId?: string;
    correlationId?: string;
    userId?: string;
    requestId?: string;
  };
}

export type CommandHandler<T extends Command> = (command: T) => Promise<any>;
