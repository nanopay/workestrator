-- Migration number: 0001 	 2023-10-24T18:26:40.798Z

DROP TABLE IF EXISTS works;

CREATE TABLE IF NOT EXISTS works (
    hash VARCHAR(64) PRIMARY KEY,
    work VARCHAR(16) NOT NULL,
    threshold VARCHAR(16) NOT NULL,
    worker INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    took INT NOT NULL,
    FOREIGN KEY (worker) REFERENCES workers(id)
);