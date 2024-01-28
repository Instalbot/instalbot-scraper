const { chromium } = require("playwright");
const { Client } = require('pg');

require('dotenv').config();

const client = new Client({
  user: process.env.DATABASE_USERNAME,
  host: process.env.DATABASE_HOST,
  database: process.env.DATABASE_NAME,
  password: process.env.DATABASE_PASSWORD,
  port: 5432,
});

const instaling_user = "";
const instaling_password = "";
const userId = 2;

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto("https://instaling.pl/teacher.php?page=login");

  await page.waitForLoadState("networkidle");

  try {
    page.locator('xpath=/html/body/div[2]/div[2]/div[1]/div[2]/div[2]/button[1]').click(timeout = 5000);
  } catch {
    //pass
  }

  await page.fill('//*[@id="log_email"]', instaling_user);
  await page.fill('//*[@id="log_password"]', instaling_password);
  await page.click('//*[@id="main-container"]/div[3]/form/div/div[3]/button');
  if (page.url() === "https://instaling.pl/teacher.php?page=login") {
    console.log("Wrong password");
    process.exit();
  }

  await page.click('//*[@id="student_panel"]/p[5]/a');
  await page.click('//*[@id="account_page"]/div/a[1]/h4');
  await page.click('//*[@id="show_words"]');
  await page.waitForTimeout(1000);

  await page.waitForLoadState("networkidle");

  await client.connect();

  const data = [];
  let tr = 1;
  while (true) {
    try {
      const word_de = await page.innerText(`//*[@id="assigned_words"]/tr[${tr}]/td[1]`, { timeout: 100 });
      const word_pl = await page.innerText(`//*[@id="assigned_words"]/tr[${tr}]/td[2]`, { timeout: 100 });
      console.log(`${word_pl} : ${word_de}`);
      data.push({ "key": word_pl, "value": word_de });
      tr += 1;
    } catch (error) {
      break;
    }
  }

  await browser.close();

  json_data = JSON.stringify(data);
  await client.query("INSERT INTO words(userId, list) VALUES($1, $2) ON CONFLICT (userId) DO UPDATE SET list = EXCLUDED.list;", [userId, json_data]);
  await client.end();
}
)();