type Level = 'info' | 'warn' | 'error'

export interface LogContext {
  requestId?: string
  userId?: string
  route?: string
  [key: string]: unknown
}

function emit(level: Level, msg: string, ctx: LogContext = {}): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...ctx,
  })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const log = {
  info: (msg: string, ctx?: LogContext) => emit('info', msg, ctx),
  warn: (msg: string, ctx?: LogContext) => emit('warn', msg, ctx),
  error: (msg: string, ctx?: LogContext) => emit('error', msg, ctx),
}
