type LogLevel = "info" | "warn" | "error" | "debug";

function formatLog(level: LogLevel, message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const prefix = `[ShopMate][${timestamp}][${level.toUpperCase()}]`;
    if (data !== undefined) {
        return [prefix, message, data];
    }
    return [prefix, message];
}

export const logger = {
    info: (message: string, data?: any) => {
        console.log(...formatLog("info", message, data));
    },
    warn: (message: string, data?: any) => {
        console.warn(...formatLog("warn", message, data));
    },
    error: (message: string, data?: any) => {
        console.error(...formatLog("error", message, data));
    },
    debug: (message: string, data?: any) => {
        if (process.env.NODE_ENV !== "production") {
            console.debug(...formatLog("debug", message, data));
        }
    },
};
