import { type LogLevel, Logger, type LoggerSink } from '@lfs/shared';
import { describe, expect, it } from 'vitest';

class CapturingSink implements LoggerSink {
  public entries: Array<{ level: LogLevel; module: string; message: string; context?: unknown }> = [];
  log(level: LogLevel, module: string, message: string, context?: unknown): void {
    this.entries.push(
      context === undefined ? { level, module, message } : { level, module, message, context },
    );
  }
}

describe('Logger', () => {
  it('routes messages to sink with level and module', () => {
    const sink = new CapturingSink();
    const log = new Logger('Test', { sink });
    log.info('hello');
    expect(sink.entries).toEqual([{ level: 'info', module: 'Test', message: 'hello' }]);
  });

  it('forwards context object to sink', () => {
    const sink = new CapturingSink();
    const log = new Logger('Test', { sink });
    log.warn('careful', { reason: 'unknown' });
    expect(sink.entries).toEqual([
      { level: 'warn', module: 'Test', message: 'careful', context: { reason: 'unknown' } },
    ]);
  });

  it('respects minLevel — debug is dropped when minLevel=info', () => {
    const sink = new CapturingSink();
    const log = new Logger('Test', { sink, minLevel: 'info' });
    log.debug('a');
    log.info('b');
    log.error('c');
    expect(sink.entries.map((e) => e.message)).toEqual(['b', 'c']);
  });

  it('child loggers prefix the module name', () => {
    const sink = new CapturingSink();
    const parent = new Logger('Parent', { sink });
    const child = parent.child('Sub');
    child.info('hi');
    expect(sink.entries[0]?.module).toBe('Parent:Sub');
  });

  it('emits all four levels in order', () => {
    const sink = new CapturingSink();
    const log = new Logger('Test', { sink, minLevel: 'debug' });
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(sink.entries.map((e) => e.level)).toEqual(['debug', 'info', 'warn', 'error']);
  });
});
