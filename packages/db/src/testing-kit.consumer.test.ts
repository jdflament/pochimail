import { blobStoreContract } from "@pochimail/documents/testing/blob-store-contract";
import { createInMemoryBlobStore } from "@pochimail/documents/testing/in-memory-blob-store";
import { createInMemoryUnitOfWork } from "@pochimail/testing/in-memory-store";
import { repositoriesContract } from "@pochimail/testing/repositories-contract";
import { unitOfWorkContract } from "@pochimail/testing/unit-of-work-contract";

// Consumer check: a package other than `testing` can run the exported contract suites through
// the public entry points only. The SQLite runs live in sqlite-storage.test.ts; repositories and the blob store stay in-memory until M2-03.
unitOfWorkContract(createInMemoryUnitOfWork);
repositoriesContract(createInMemoryUnitOfWork);
blobStoreContract(createInMemoryBlobStore);
