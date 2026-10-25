-- Run once as the postgres superuser. Creates a dedicated least-privilege role + db.
CREATE ROLE stakra LOGIN PASSWORD 'Stakra_Dev_2026';
CREATE DATABASE stakra OWNER stakra;
GRANT ALL PRIVILEGES ON DATABASE stakra TO stakra;
