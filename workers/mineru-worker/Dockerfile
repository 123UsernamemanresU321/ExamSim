FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MINERU_WORKDIR=/tmp/exam-vault-mineru

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip git poppler-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt \
  && pip3 install --no-cache-dir "mineru[core]"

COPY mineru_worker.py .

CMD ["python3", "mineru_worker.py"]
