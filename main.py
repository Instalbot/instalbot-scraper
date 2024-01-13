from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import text, literal
from dotenv import load_dotenv
import time, sys, json

load_dotenv()

from db import db, models

#TODO: odszyfrowanie hasła i pobiernie hasła i użytkownika z bazy

userId = 6
instaling_user = ""
instaling_password = ""

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("https://instaling.pl/teacher.php?page=login")

    page.locator('//*[@id="log_email"]').fill(instaling_user)
    page.locator('//*[@id="log_password"]').fill(instaling_password)
    page.locator('//*[@id="main-container"]/div[3]/form/div/div[3]/button').click()
    if page.url == "https://instaling.pl/teacher.php?page=login":
        print("Wrong password")
        sys.exit()

    page.locator('//*[@id="student_panel"]/p[5]/a').click()
    page.locator('//*[@id="account_page"]/div/a[1]/h4').click()
    page.locator('//*[@id="show_words"]').click()
    time.sleep(1)

    page.set_default_navigation_timeout(0)
    page.wait_for_load_state("networkidle")
    time.sleep(1)

    data = []
    tr = 1
    while True:
        try:
            word_de = page.locator(f'//*[@id="assigned_words"]/tr[{tr}]/td[1]').inner_text(timeout=100)
            word_pl = page.locator(f'//*[@id="assigned_words"]/tr[{tr}]/td[2]').inner_text(timeout=100)
        except PlaywrightTimeoutError:
            break
        print(f"{word_pl} : {word_de}")
        data.append({"key": word_pl, "value": word_de})
        tr += 1

    json_data = json.dumps(data, ensure_ascii=False)
    with db.Session() as session:
        session.query(models.Word).filter_by(userid=userId).update({models.Word.list: literal(json_data).cast(JSONB)}, synchronize_session=False)
        session.commit()

    browser.close()