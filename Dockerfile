FROM python:3.10-slim

# Cài đặt các thư viện hệ thống cần thiết cho OpenCV
RUN apt-get update && apt-get install -y \
    libglib2.0-0 libsm6 libxext6 libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

# Thiết lập user không phải root (Yêu cầu bắt buộc của Hugging Face Spaces)
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH"

WORKDIR /app

# Copy file requirements và cài đặt
COPY --chown=user:user BE/requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy mã nguồn Backend và mô hình AI
COPY --chown=user:user BE/ /app/BE/
COPY --chown=user:user brain_tumor_unet.keras /app/

# Chạy server FastAPI trên port 7860 (Port mặc định của Hugging Face Spaces)
CMD ["uvicorn", "BE.main:app", "--host", "0.0.0.0", "--port", "7860"]
