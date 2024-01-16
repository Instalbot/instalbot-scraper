import json
import os
import threading
import time

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
from sqlalchemy import literal
from sqlalchemy.dialects.postgresql import JSONB
import redis

load_dotenv()

from db import db, models

#TODO: odszyfrowanie hasła i pobiernie hasła i użytkownika z bazy

r = redis.StrictRedis(
    host=os.getenv("REDIS_HOST"),
    port=os.getenv("REDIS_PORT"),
    password=os.getenv("REDIS_PASSWORD"),
    decode_responses=True,
    db=0
)

workers = 0
username = ""
password = ""


def xor_encryption(text, key):
    encrypted_text = ""

    for i in range(len(text)):
        encrypted_text += chr(ord(text[i]) ^ ord(key[i % len(key)]))

    return encrypted_text


def scrape_words(user_id, requester):
    try:
        global workers

        with db.Session() as session:
            try:
                flag = session.query(models.Flag).filter_by(userid=user_id).first()
                global username, password
                username = flag.instaling_user
                password = xor_encryption(flag.instaling_pass, os.getenv('INSTALING_KEY'))
            except Exception as e:
                print(f'Exception thrown while getting flags: {requester}-{user_id}, {e}')
                session.rollback()
                workers = workers - 1
                r.publish('workers_finished', f"SCRAPER-FAILED-{requester}-{user_id}")
                return

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto("https://instaling.pl/teacher.php?page=login")

            page.locator('//*[@id="log_email"]').fill(username)
            page.locator('//*[@id="log_password"]').fill(password)
            page.locator('//*[@id="main-container"]/div[3]/form/div/div[3]/button').click()

            if page.url == "https://instaling.pl/teacher.php?page=login":
                print(f'Wrong credentials: {requester}-{user_id}')
                workers = workers - 1
                r.publish('workers_finished', f"SCRAPER-FAILED-{requester}-{user_id}")
                return

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
                data.append({"key": word_pl, "value": word_de})
                tr += 1

            browser.close()

            json_data = json.dumps(data, ensure_ascii=False)

            with db.Session() as session:
                try:
                    session.query(models.Word).filter_by(userid=user_id).update({models.Word.list: literal(json_data).cast(JSONB)}, synchronize_session=False)
                    session.commit()
                    r.publish('workers_finished', f"SCRAPER-FINISHED-{requester}-{user_id}")
                except Exception as e:
                    print(f"ERROR: {requester}-{user_id}, database session cannot commit; {e}")
                    session.rollback()
                    r.publish('workers_finished', f"SCRAPER-FAILED-{requester}-{user_id}")
            workers = workers - 1
    except Exception as e:
        print(f'Global error thrown: {requester}-{user_id}, {e}')
        workers = workers - 1
        return r.publish('workers_finished', f"SCRAPER-FAILED-{requester}-{user_id}")


if __name__ == "__main__":
    while True:
        if workers >= 3:
            continue

        _, element = r.blpop(['task_queue'], timeout=0)

        # EXAMPLE: SCRAPER-REQUEST-53-1
        splitted = str(element).split("-")

        workerId = splitted[2]
        suser_id = splitted[3]

        if splitted[0] == "SCRAPER" and splitted[1] == "REQUEST":
            thread = threading.Thread(target=scrape_words, args=[int(suser_id), workerId])
            thread.start()
            workers = workers + 1
