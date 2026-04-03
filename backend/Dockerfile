FROM python:3.11-slim

# System dependencies for ODBC Driver 17 (SQL Server connector)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl gnupg unixodbc-dev \
    && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc \
       | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && curl -fsSL https://packages.microsoft.com/config/debian/12/prod.list \
       > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y --no-install-recommends msodbcsql17 \
    && rm -rf /var/lib/apt/lists/*

# CmdStan for Prophet forecasting
# Installed before app dependencies to maximise Docker layer cache reuse.
RUN pip install --no-cache-dir cmdstanpy \
    && python -m cmdstanpy.install_cmdstan --cores 2

WORKDIR /app

# Install Python dependencies as a separate layer so they are cached
# independently from the application source code.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
