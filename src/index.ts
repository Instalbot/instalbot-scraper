import { devices, chromium, Browser } from "playwright";
import { Pool } from "pg";
import amqp from "amqplib";
import dotenv from "dotenv";

import logger from "./logger";

dotenv.config();

export interface DatabaseUserRes {
    userid: number;
    email: string;
    username: string;
    password: string;
    instaling_user: string;
    instaling_pass: string;
};

const env = process.env as {
    DATABASE_USERNAME: string,
    DATABASE_PASSWORD: string,
    DATABASE_HOST: string,
    DATABASE_NAME: string,
    INSTALING_KEY: string,
    RABBITMQ_USERNAME: string,
    RABBITMQ_PASSWORD: string,
    RABBITMQ_HOST: string
};

const envKeys = Object.keys(env);
let requiredKeys = [
    "DATABASE_USERNAME",
    "DATABASE_PASSWORD",
    "DATABASE_HOST",
    "DATABASE_NAME",
    "INSTALING_KEY",
    "RABBITMQ_HOST",
    "RABBITMQ_USERNAME",
    "RABBITMQ_PASSWORD"
].filter(key => !envKeys.includes(key));

if (requiredKeys.length > 0) {
    logger.error(`.env file is missing the following keys: ${requiredKeys.join(", ")}`);
    process.exit(1);
};

const pool = new Pool({
    user: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    host: process.env.DATABASE_HOST,
    database: process.env.DATABASE_NAME
});

function xorEncryption(text: string, key: string): string {
    let encryptedText = "";

    for (let i = 0; i < text.length; i++) {
        encryptedText += String.fromCharCode(
            text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
        );
    }

    return encryptedText;
};

async function sleep(timeout: number) {
    return new Promise((resolve, _) => {
        setTimeout(() => {
            resolve(true);
        }, timeout);
    });
};

function random(min: number, max: number) {
    return Math.floor(Math.random() * (max - min) + min);
};

function replaceDomElement(text: string): string {
    const replaceWith = { "&amp;": '&', "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#039;": "'"};

    Object.keys(replaceWith).map(key => {
        // @ts-ignore
        text = text.replace(new RegExp(key, "g"), replaceWith[key]);
    });

    return text;
}

async function runBrowser(): Promise<Browser | false> {
    try {
        return await chromium.launch({
            headless: false,
            args: ["--mute-audio"],
        });
    } catch(err) {
        return logger.error(`runBrowser(): Cannot spawn browser: ${(err as Error).message}`);;
    }
}

async function scraper(userId: number, browser: Browser) {
    // --[ DATABASE LOGIC ]-----------------------------------------------------

    let userData: DatabaseUserRes;

    try {
        const result = await pool.query("SELECT instaling_user, instaling_pass FROM flags WHERE userid = $1", [ userId ]);
        userData = result.rows[0];
    } catch(err) {
        return logger.error(`scraper(): Cannot query database: ${(err as Error).message}`);
    }

    const password = xorEncryption(userData.instaling_pass, env.INSTALING_KEY);

    // --[ LOGIN LOGIC ]--------------------------------------------------------

    const context = await browser.newContext({
        ...devices["Desktop Chrome"],
    });

    context.setDefaultTimeout(10000);

    const page = await context.newPage();

    try {
        await page.goto("https://instaling.pl/teacher.php?page=login");
    } catch(err) {
        return logger.error("Cannot enter instaling.pl");
    }

    await page.waitForLoadState("domcontentloaded");

    await sleep(random(300, 10000));

    await page.locator("xpath=/html/body/div[2]/div[2]/div[1]/div[2]/div[2]/button[1]")
        .click()
        .catch(() => logger.warn("scraper(): Cannot find cookie button"));

    await sleep(random(300, 1000));

    try {
        await page.locator('//*[@id="log_email"]').pressSequentially(userData.instaling_user, { delay: random(250, 500) });
        await sleep(random(500, 1000));
        await page.locator('//*[@id="log_password"]').pressSequentially(password, { delay: random(230, 600) });
        await sleep(random(500, 1500));
        await page.locator('//*[@id="main-container"]/div[3]/form/div/div[3]/button').click();
        logger.log(`scraper(): Logged in for session ${userId}`);
    } catch(err) {
        await context.close();
        return logger.error(`scraper(): Cannot login: ${(err as Error).message}`);
    }

    await page.waitForLoadState("domcontentloaded");

    if (!page.url().startsWith("https://instaling.pl/student/pages/mainPage.php")) {
        await context.close();
        return logger.warn(`scraper(): Invalid login credentials for session ${userId}`);
    }

    // --[ SCRAPE LOGIC ]------------------------------------------------------

    await sleep(random(300, 1000));
    await page.waitForLoadState("domcontentloaded");

    await page.click('//*[@id="student_panel"]/p[5]/a');

    await sleep(random(300, 1000));
    await page.waitForLoadState("domcontentloaded");

    await page.click('//*[@id="account_page"]/div/a[1]/h4');

    await sleep(random(300, 1000));
    await page.waitForLoadState("domcontentloaded");

    await page.click('//*[@id="show_words"]');

    await sleep(random(300, 1000));
    await page.waitForLoadState("domcontentloaded");

    const data = [];
    let translationNumber = 1;

    while (true) {
        try {
            const selectorValue = `//*[@id="assigned_words"]/tr[${translationNumber}]/td[1]`;
            const selectorKey = `//*[@id="assigned_words"]/tr[${translationNumber}]/td[2]`;

            // Check if the elements are present
            const isValuePresent = await page.locator(selectorValue).isVisible();
            const isKeyPresent = await page.locator(selectorKey).isVisible();

            if (!isValuePresent || !isKeyPresent)
                break;

            const value = await page.innerText(selectorValue, { timeout: 500 });
            const key = await page.innerText(selectorKey, { timeout: 500 });

            data.push({ "key": replaceDomElement(key).trim(), "value": replaceDomElement(value).trim() });
            translationNumber += 1;
        } catch (error) {
            logger.error(`scraper(): ${error}`);
            break;
        }
    }

    context.close();

    const json_data = JSON.stringify(data);
    try {
        await pool.query("INSERT INTO words(userId, list) VALUES($1, $2) ON CONFLICT (userId) DO UPDATE SET list = EXCLUDED.list;", [userId, json_data]);
        logger.log(`scraper(): Data: ${json_data} pushed to database for session ${userId}`);
        return true;
    } catch(err) {
        return logger.error(`scraper(): Cannot push data to database: ${(err as Error).message}`);
    }
};

async function worker() {
    const browser = await runBrowser();

    if (!browser) {
        return logger.error("worker(): Cannot spawn main browser");
    }

    try {
        const connection = await amqp.connect(`amqp://${env.RABBITMQ_USERNAME}:${env.RABBITMQ_PASSWORD}@${env.RABBITMQ_HOST}`);
        const channel = await connection.createChannel();

        const queue = "scraper";

        channel.assertQueue(queue, { durable: true });

        channel.prefetch(1);
        logger.log(`scraper(): Waiting for tasks on channel ${queue}`);

        channel.consume(queue, async msg => {
            if (msg == null) return logger.warn("Received null message");

            const msgContent = msg.content.toString();
            const userId = parseInt(msgContent);

            logger.log(`scraper(): Received a task, starting scraping for user ${userId}`);
            const res = await scraper(userId, browser);
            
            if (!res) {
                logger.error("scraper(): Failed to scrape, requeuing task");
                return channel.nack(msg);
            }

            logger.log("scraper(): Finished scraping, waiting for next task");
            channel.ack(msg);
        });
    } catch (error) {
        logger.error("worker(): Global error: ", error);
    }
}

worker();