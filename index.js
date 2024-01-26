const { chromium } = require("playwright");

const instaling_user = "";
const instaling_password = "";

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto("https://instaling.pl/teacher.php?page=login");

  //do naprawy pokonuje nas dodanie przez instaling prośby o zaakcepowanie ciasteczek

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
}
)();