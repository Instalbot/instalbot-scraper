FROM python:3.12-slim

COPY . /app

WORKDIR /app

RUN pip install -r requirements.txt
RUN playwright install firefox

CMD python app.py