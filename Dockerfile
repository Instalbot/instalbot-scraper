FROM python:3.12-slim

COPY . /app

WORKDIR /app

RUN pip install -r requirements.txt
RUN sudo apt-get clean
RUN sudo apt-get update
RUN apt-get install -y gconf-service libasound2 libatk1.0-0 libcairo2 libcups2 libfontconfig1 libgdk-pixbuf2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libxss1 fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils
RUN playwright install --with-deps firefox

CMD python -u main.py