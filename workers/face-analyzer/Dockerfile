FROM python:3.12-slim-bookworm
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1
WORKDIR /app
COPY supabase-root-2021.crt /usr/local/share/ca-certificates/supabase-root-2021.crt
RUN update-ca-certificates
COPY requirements-azure.txt ./
RUN pip install --no-cache-dir --require-hashes --only-binary=:all: -r requirements-azure.txt
COPY download_models.py ./
RUN python download_models.py
COPY face_analyzer ./face_analyzer
COPY config.example.json cloud_entry.py ./
RUN mkdir -p /data /references /media && python cloud_entry.py --self-test \
    && rm /tmp/face-config.json && chown -R 1001:1001 /data /references /media
USER 1001:1001
ENTRYPOINT ["python", "cloud_entry.py"]
