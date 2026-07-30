async function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let isResolved = false;

    // Timeout to prevent hanging indefinitely (e.g., if blocked by other tabs)
    const timeout = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        console.error('IndexedDB open timed out after 30 seconds');
        reject(new Error('IndexedDB open timed out after 30 seconds'));
      }
    }, 15000);

    const cleanup = () => {
      clearTimeout(timeout);
    };

    const request: IDBOpenDBRequest = indexedDB.open('ScribeAudioChunksDB', 2);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event?.target as IDBOpenDBRequest).result || null;
      if (!db.objectStoreNames.contains('audio_chunks')) {
        const objectStore = db.createObjectStore('audio_chunks', {
          keyPath: 'id',
          autoIncrement: true,
        });

        objectStore.createIndex('by_txnID_and_filename', ['txnID', 'fileName'], {
          unique: false,
        });
      }
    };

    request.onsuccess = (event) => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      const db = (event?.target as IDBOpenDBRequest)?.result;
      resolve(db);
    };

    request.onerror = (event) => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      const error = (event.target as IDBRequest)?.error || 'Error in indexed db';
      console.error('IndexedDB error:', error);
      reject(error);
    };

    request.onblocked = () => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      console.warn('IndexedDB open blocked: existing connections must be closed.');
      reject(new Error('IndexedDB open blocked'));
    };
  });
}

const deleteChunksFromIDB = async (db: IDBDatabase) => {
  if (!db) {
    console.log('no db present');
    return;
  }
  return new Promise((resolve, reject) => {
    let isResolved = false;

    // Timeout to prevent hanging indefinitely
    const timeout = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        try {
          db.close();
        } catch (_) {
          // ignore close errors
        }
        reject(new Error('IndexedDB operation timed out after 30 seconds'));
      }
    }, 15000);

    const cleanup = () => {
      clearTimeout(timeout);
    };

    const transaction = db!.transaction(['audio_chunks'], 'readwrite');
    const objectStore = transaction.objectStore('audio_chunks');
    const request = objectStore.clear();

    request.onsuccess = () => {
      console.log(`Successfully deleted chunks`, db);
    };

    request.onerror = (event: Event) => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      const error = (event.target as IDBRequest).error;
      console.error(` Error deleting chunks for txnID`, error);
      try {
        db.close();
      } catch (_) {
        // ignore close errors
      }
      reject(error);
    };

    transaction.oncomplete = () => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      db.close();
      resolve(undefined); // Resolve the promise when the transaction is complete
    };

    // Handle transaction errors
    transaction.onerror = (event: Event) => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      console.error(
        'Transaction error in deleteChunksFromIDB:',
        (event.target as IDBRequest).error
      );
      try {
        db.close();
      } catch (_) {
        // ignore close errors
      }
      reject((event.target as IDBRequest).error || new Error('Transaction failed'));
    };

    // Handle transaction abort
    transaction.onabort = () => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      console.error('Transaction aborted in deleteChunksFromIDB');
      try {
        db.close();
      } catch (_) {
        // ignore close errors
      }
      reject(new Error('Transaction was aborted'));
    };
  });
};

async function getChunksFromIndexedDB(
  txnID: string,
  db: IDBDatabase | null
): Promise<{ chunks: Uint8Array[]; db: IDBDatabase }> {
  // Adjust return type based on concatenation

  const executeQuery = async () => {
    if (!db) {
      db = await openIndexedDB();
    }

    const transaction = db.transaction(['audio_chunks'], 'readonly');
    const objectStore = transaction.objectStore('audio_chunks');
    const index = objectStore.index('by_txnID_and_filename');

    const range = IDBKeyRange.bound([txnID, ''], [txnID, '\xFF']);
    const request: IDBRequest = index.getAll(range);

    return new Promise<{ chunks: Uint8Array[]; db: IDBDatabase }>((resolve, reject) => {
      let isResolved = false;

      // Timeout to prevent hanging indefinitely
      const timeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          reject(new Error('IndexedDB operation timed out after 30 seconds'));
        }
      }, 30000);

      const cleanup = () => {
        clearTimeout(timeout);
      };

      request.onsuccess = (event: Event) => {
        if (isResolved) return;
        isResolved = true;
        cleanup();

        const results: {
          id: number;
          txnID: string;
          chunkIndex: number;
          fileName: string;
          data: Int8Array[];
        }[] = (event.target as IDBRequest).result;

        const combinedBinaryData: Uint8Array[] = [];
        const sortedResults = results.sort((a, b) => {
          const numA = parseInt(a.fileName);
          const numB = parseInt(b.fileName);
          return numA - numB;
        });
        sortedResults.forEach((item) => {
          if (item.data && Array.isArray(item.data)) {
            combinedBinaryData.push(...item.data.map((arr) => new Uint8Array(arr?.buffer || arr)));
          }
        });
        resolve({ chunks: combinedBinaryData, db: db! });
      };

      request.onerror = (event: Event) => {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        reject((event.target as IDBRequest).error);
      };

      // Handle transaction errors
      transaction.onerror = (event: Event) => {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        console.error(
          'Transaction error in getChunksFromIndexedDB:',
          (event.target as IDBRequest).error
        );
        reject((event.target as IDBRequest).error || new Error('Transaction failed'));
      };

      // Handle transaction abort
      transaction.onabort = () => {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        console.error('Transaction aborted in getChunksFromIndexedDB');
        reject(new Error('Transaction was aborted'));
      };
    });
  };

  return executeQuery();
}

async function saveChunkToIndexedDB({
  txnID,
  fileName,
  chunkData,
  indexedDB,
}: {
  txnID: string;
  fileName: string;
  chunkData: (Int8Array | ArrayBuffer | Uint8Array)[];
  indexedDB: IDBDatabase;
}): Promise<{
  message: string;
  is_db_limit_exceeded: boolean;
}> {
  if (!indexedDB) {
    indexedDB = await openIndexedDB();
  }

  return new Promise((resolve, reject) => {
    let isResolved = false;

    // Timeout to prevent hanging indefinitely
    const timeout = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        reject({
          message: 'IndexedDB operation timed out after 30 seconds',
          is_db_limit_exceeded: false,
        });
      }
    }, 30000);

    const cleanup = () => {
      clearTimeout(timeout);
    };

    const transaction = indexedDB.transaction(['audio_chunks'], 'readwrite');
    const objectStore = transaction.objectStore('audio_chunks');

    const itemToStore = {
      txnID: txnID,
      fileName: fileName,
      data: chunkData,
    };

    const request: IDBRequest = objectStore.add(itemToStore); // Type the request

    request.onsuccess = () => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      resolve({
        message: 'Chunk added successfully',
        is_db_limit_exceeded: false,
      });
    };

    request.onerror = (event: Event) => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      // Type the event
      const error = (event.target as IDBRequest).error; // Assert and get error
      if (error?.name === 'QuotaExceededError') {
        // Use optional chaining for error
        console.error('IndexedDB QuotaExceededError:', error);
        reject({
          message: 'Storage limit reached. Please free up disk space.',
          is_db_limit_exceeded: true,
        });
      } else if (error?.name === 'ConstraintError') {
        console.warn(`Chunk already exists, not adding duplicate: ${fileName} for txnID: ${txnID}`);
        resolve({
          message: 'Chunk already exists, not adding duplicate',
          is_db_limit_exceeded: false,
        });
      } else {
        console.error('IndexedDB error:', error);
        reject({
          message: 'IndexedDB error',
          is_db_limit_exceeded: false,
        });
      }
    };

    // Handle transaction errors
    transaction.onerror = (event: Event) => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      console.error(
        'Transaction error in saveChunkToIndexedDB:',
        (event.target as IDBRequest).error
      );
      reject({
        message: 'Transaction failed',
        is_db_limit_exceeded: false,
      });
    };

    // Handle transaction abort
    transaction.onabort = () => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      console.error('Transaction aborted in saveChunkToIndexedDB');
      reject({
        message: 'Transaction was aborted',
        is_db_limit_exceeded: false,
      });
    };
  });
}

async function checkAudioChunksExist(
  txnID: string,
  db: IDBDatabase | null
): Promise<{ exists: boolean; db: IDBDatabase }> {
  if (!db) {
    db = await openIndexedDB();
  }

  return new Promise((resolve, reject) => {
    let isResolved = false;

    // Timeout to prevent hanging indefinitely
    const timeout = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        reject(new Error('IndexedDB operation timed out after 30 seconds'));
      }
    }, 30000);

    const cleanup = () => {
      clearTimeout(timeout);
    };

    const transaction = db!.transaction(['audio_chunks'], 'readonly');
    const objectStore = transaction.objectStore('audio_chunks');
    const index = objectStore.index('by_txnID_and_filename');

    const range = IDBKeyRange.bound([txnID, ''], [txnID, '\xFF']);
    const request = index.count(range);

    request.onsuccess = () => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      resolve({ exists: request.result > 0, db: db! });
    };

    request.onerror = (event: Event) => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      reject((event.target as IDBRequest).error);
    };

    // Handle transaction errors
    transaction.onerror = (event: Event) => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      console.error(
        'Transaction error in checkAudioChunksExist:',
        (event.target as IDBRequest).error
      );
      reject((event.target as IDBRequest).error || new Error('Transaction failed'));
    };

    // Handle transaction abort
    transaction.onabort = () => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      console.error('Transaction aborted in checkAudioChunksExist');
      reject(new Error('Transaction was aborted'));
    };
  });
}

export {
  openIndexedDB,
  deleteChunksFromIDB,
  getChunksFromIndexedDB,
  saveChunkToIndexedDB,
  checkAudioChunksExist,
};
