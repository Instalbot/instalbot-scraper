import { devices, chromium, Browser } from "playwright";
import { Pool } from "pg";
import { createClient } from "redis";
import dotenv from "dotenv";

import logger from "./logger";

dotenv.config();

export interface DatabaseUserRes {
  userid:         number;
  email:          string;
  username:       string;
  password:       string;
  instaling_user: string;
  instaling_pass: string;
  host          : string;
};

const redis = createClient({
    url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
    password: process.env.REDIS_PASSWORD
});
redis.connect();

const pool = new Pool({
    user: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    host: process.env.DATABASE_HOST,
    database: process.env.DATABASE_NAME
});

const userId = 2;

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

async function scraper(userId: number) {
  if (!process.env.INSTALING_KEY)
  return logger.error(`scraper(): Master key not set, killing`);

    // --[ DATABASE LOGIC ]-----------------------------------------------------

    let client;

    try {
        client = await pool.connect()
    } catch(err) {
        return logger.error(`scraper(): Cannot connect to database: ${(err as Error).message}`)
    }

    let userData: DatabaseUserRes;

    try {
        const result = await client.query('SELECT instaling_user, instaling_pass FROM flags WHERE userid = $1', [userId]);
        userData = result.rows[0];
    } catch(err) {
        return logger.error(`scraper(): Cannot query database: ${(err as Error).message}`);
    }

    const password = xorEncryption(userData.instaling_pass, process.env.INSTALING_KEY);
    
    // --[ LOGIN LOGIC ]--------------------------------------------------------

    let browser: Browser;

    try {
        browser = await chromium.launch({
            headless: false,
            args: ["--mute-audio"]
        });
    } catch(err) {
        return logger.error(`scraper(): Cannot spawn browser: ${(err as Error).message}`);
    }

    const context = await browser.newContext({
        ...devices["Desktop Chrome"],
    });

    context.setDefaultTimeout(2000);

    const page = await context.newPage();

    try {
        await page.goto("https://instaling.pl/teacher.php?page=login", { timeout: 60000 });
    } catch(err) {
        return logger.error("Cannot enter instaling.pl");
    }

    await page.waitForLoadState("domcontentloaded");

    await sleep(random(300, 1000));

    await page.locator("xpath=/html/body/div[2]/div[2]/div[1]/div[2]/div[2]/button[1]")
        .click()
        .catch(() => logger.warn(`scraper(): Cannot find cookie button for session ${userId}`));

    await sleep(random(300, 1000));

    try {
        await page.locator('//*[@id="log_email"]').pressSequentially(userData.instaling_user, { timeout: 20000, delay: random(250, 500) });
        await sleep(random(500, 1000));
        await page.locator('//*[@id="log_password"]').pressSequentially(password, { timeout: 20000, delay: random(230, 600) });
        await sleep(random(500, 1500));
        await page.locator('//*[@id="main-container"]/div[3]/form/div/div[3]/button').click();
        logger.log(`scraper(): Logged in for session ${userId}`);
    } catch(err) {
        await context.close();
        await browser.close();
        return logger.error(`scraper(): Cannot login: ${(err as Error).message}`);
    }

    await page.waitForLoadState("domcontentloaded");

    if (!page.url().startsWith("https://instaling.pl/student/pages/mainPage.php")) {
        await context.close();
        await browser.close();
        return logger.log(`scraper(): Invalid login credentials for session ${userId}`);
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
    let tr = 1;
    while (true) {
      try {
        const value = await page.innerText(`//*[@id="assigned_words"]/tr[${tr}]/td[1]`, { timeout: 100 });
        const key = await page.innerText(`//*[@id="assigned_words"]/tr[${tr}]/td[2]`, { timeout: 100 });
        // console.log(`${word_pl} : ${word_de}`);
        data.push({ "key": key, "value": value });
        tr += 1;
      } catch (error) {
        logger.error(`scraper(): ${error}`);
        break;
      }
    }

    await browser.close();

    let json_data = JSON.stringify(data);
    try {
        await client.query("INSERT INTO words(userId, list) VALUES($1, $2) ON CONFLICT (userId) DO UPDATE SET list = EXCLUDED.list;", [userId, json_data]);
        logger.log(`scraper(): Data: ${json_data} pushed to database for session ${userId}`);
    } catch(err) {
        return logger.error(`scraper(): Cannot push data to database: ${(err as Error).message}`);
    }
}


scraper(userId);
 