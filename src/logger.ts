/* eslint-disable @typescript-eslint/no-explicit-any */
import winston from "winston";

// https://stackoverflow.com/questions/51012150/winston-3-0-colorize-whole-output-on-console
const logFormat = winston.format.combine(
    winston.format.colorize({
        all: true,
        colors: {
            info: "bold blue",
            warn: "italic yellow",
            error: "bold red",
        }
    }),
    winston.format.label({
        label: "[INSTALBOT-BOT]"
    }),
    winston.format.timestamp({
        format:"YY-MM-DD HH:mm:ss"
    }),
    winston.format.printf(
        info => ` ${info.label}  ${info.timestamp}  ${info.level} : ${info.message}`
    )
);

const logger = winston.createLogger({
    level: "info",
    transports: [
        new winston.transports.Console({ format: logFormat }),
        new winston.transports.File({ filename: "combined.log", format: winston.format.combine(winston.format.timestamp(), winston.format.json()) })
    ]
});

export const cT = (m: any): any => m.join("\t");

export default {
    error: (...message: any): false => {
        logger.error(cT(message));
        return false;
    },
    ready: (...message: any): void =>
        logger.log("info", cT(message)) as unknown as void,
    log: (...message: any): void =>
        logger.log("info", cT(message)) as unknown as void,
    warn: (...message: any): false => {
        logger.warn(cT(message));
        return false;
    }
};