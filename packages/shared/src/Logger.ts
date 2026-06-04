export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LogContext {
  [key: string]: unknown;
}

export interface LoggerSink {
  log(level: LogLevel, module: string, message: string, context?: LogContext): void;
}

export interface LoggerOptions {
  minLevel?: LogLevel;
  sink?: LoggerSink;
  now?: () => Date;
}

const defaultSink: LoggerSink = {
  log(level, module, message, context) {
    const args: unknown[] = [message];
    if (context !== undefined) args.push(context);
    const fn =
      level === 'debug'
        ? console.debug
        : level === 'info'
          ? console.info
          : level === 'warn'
            ? console.warn
            : console.error;
    fn(`[${module}]`, ...args);
  },
};

export class Logger {
  private readonly module: string;
  private readonly minLevel: LogLevel;
  private readonly sink: LoggerSink;
  private readonly now: () => Date;

  constructor(module: string, options: LoggerOptions = {}) {
    this.module = module;
    this.minLevel = options.minLevel ?? 'info';
    this.sink = options.sink ?? defaultSink;
    this.now = options.now ?? (() => new Date());
  }

  child(subModule: string): Logger {
    return new Logger(`${this.module}:${subModule}`, {
      minLevel: this.minLevel,
      sink: this.sink,
      now: this.now,
    });
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) {
      return;
    }
    if (context !== undefined) {
      this.sink.log(level, this.module, message, context);
    } else {
      this.sink.log(level, this.module, message);
    }
  }
}
