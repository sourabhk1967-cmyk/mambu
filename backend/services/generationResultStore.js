const { createHash } = require('crypto');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

const DEFAULT_TTL_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 250;

class GenerationResultStore {
  constructor(options = {}) {
    this.ttlMs =
      Number.isInteger(options.ttlMs) && options.ttlMs > 0 ? options.ttlMs : DEFAULT_TTL_MS;
    this.maxEntries =
      Number.isInteger(options.maxEntries) && options.maxEntries > 0
        ? options.maxEntries
        : DEFAULT_MAX_ENTRIES;
    this.storageDir =
      typeof options.storageDir === 'string' && options.storageDir.trim()
        ? path.resolve(options.storageDir)
        : '';
    this.entries = new Map();
    this.events = new EventEmitter();
    this.events.setMaxListeners(0);

    if (this.storageDir) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  start(requestId, owner) {
    this.cleanup();
    const entry = {
      requestId,
      owner,
      status: 'pending',
      payload: null,
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.entries.set(requestId, entry);
    this.persist(entry);
    this.trim();
  }

  complete(requestId, owner, payload) {
    this.settle(requestId, owner, {
      status: 'completed',
      payload,
      error: null
    });
  }

  fail(requestId, owner, error) {
    this.settle(requestId, owner, {
      status: 'failed',
      payload: null,
      error
    });
  }

  get(requestId, owner) {
    this.cleanup();
    const entry = this.entries.get(requestId) || this.readPersisted(requestId);

    if (!entry || entry.owner !== owner) {
      return null;
    }

    this.entries.set(requestId, entry);
    return {
      ...entry
    };
  }

  settle(requestId, owner, changes) {
    if (!requestId) {
      return;
    }

    const current = this.entries.get(requestId);
    const entry = {
      requestId,
      owner,
      status: changes.status,
      payload: changes.payload,
      error: changes.error,
      updatedAt: Date.now(),
      createdAt: current?.createdAt || Date.now()
    };
    this.entries.set(requestId, entry);
    this.persist(entry);
    this.events.emit(this.eventName(requestId), {
      ...entry
    });
    this.cleanup();
    this.trim();
  }

  waitFor(requestId, owner, options = {}) {
    const timeoutMs =
      Number.isInteger(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 0;
    const current = this.get(requestId, owner);

    if (!timeoutMs || (current && current.status !== 'pending')) {
      return Promise.resolve(current);
    }

    return new Promise((resolve) => {
      let settled = false;
      const eventName = this.eventName(requestId);
      const finish = (entry) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeoutId);
        this.events.off(eventName, onSettled);
        resolve(entry && entry.owner === owner ? { ...entry } : null);
      };
      const onSettled = (entry) => finish(entry);
      const timeoutId = setTimeout(() => finish(this.get(requestId, owner)), timeoutMs);

      this.events.on(eventName, onSettled);
      const latest = this.get(requestId, owner);
      if (latest && latest.status !== 'pending') {
        finish(latest);
      }
    });
  }

  cleanup(now = Date.now()) {
    for (const [requestId, entry] of this.entries) {
      if (now - entry.updatedAt > this.ttlMs) {
        this.entries.delete(requestId);
        this.removePersisted(requestId);
      }
    }

    this.cleanupPersisted(now);
  }

  trim() {
    if (this.entries.size <= this.maxEntries) {
      return;
    }

    const oldest = [...this.entries.values()]
      .sort((left, right) => left.updatedAt - right.updatedAt)
      .slice(0, this.entries.size - this.maxEntries);

    for (const entry of oldest) {
      this.entries.delete(entry.requestId);
      this.removePersisted(entry.requestId);
    }
  }

  storagePath(requestId) {
    if (!this.storageDir || !requestId) {
      return '';
    }

    const filename = `${createHash('sha256').update(String(requestId)).digest('hex')}.json`;
    return path.join(this.storageDir, filename);
  }

  eventName(requestId) {
    return `generation:${String(requestId || '')}`;
  }

  persist(entry) {
    const targetPath = this.storagePath(entry?.requestId);

    if (!targetPath) {
      return;
    }

    const temporaryPath = `${targetPath}.${process.pid}.tmp`;

    try {
      fs.writeFileSync(temporaryPath, JSON.stringify(entry), 'utf8');
      fs.renameSync(temporaryPath, targetPath);
    } catch (_error) {
      try {
        fs.rmSync(temporaryPath, { force: true });
      } catch (_cleanupError) {
        // Reply delivery should continue even if disk recovery is unavailable.
      }
    }
  }

  readPersisted(requestId) {
    const targetPath = this.storagePath(requestId);

    if (!targetPath) {
      return null;
    }

    try {
      const entry = JSON.parse(fs.readFileSync(targetPath, 'utf8'));

      if (!entry || entry.requestId !== requestId) {
        return null;
      }

      if (Date.now() - entry.updatedAt > this.ttlMs) {
        this.removePersisted(requestId);
        return null;
      }

      return entry;
    } catch (_error) {
      return null;
    }
  }

  removePersisted(requestId) {
    const targetPath = this.storagePath(requestId);

    if (!targetPath) {
      return;
    }

    try {
      fs.rmSync(targetPath, { force: true });
    } catch (_error) {
      // Expired recovery files are harmless and can be retried later.
    }
  }

  cleanupPersisted(now) {
    if (!this.storageDir) {
      return;
    }

    let files;

    try {
      files = fs.readdirSync(this.storageDir, { withFileTypes: true });
    } catch (_error) {
      return;
    }

    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.json')) {
        continue;
      }

      const filePath = path.join(this.storageDir, file.name);

      try {
        const entry = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!entry?.updatedAt || now - entry.updatedAt > this.ttlMs) {
          fs.rmSync(filePath, { force: true });
        }
      } catch (_error) {
        try {
          fs.rmSync(filePath, { force: true });
        } catch (_cleanupError) {
          // Ignore unreadable stale recovery files.
        }
      }
    }
  }
}

module.exports = GenerationResultStore;
