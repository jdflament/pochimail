import { blobStoreContract } from "@pochimail/testing/blob-store-contract";
import { createInMemoryBlobStore } from "@pochimail/testing/in-memory-blob-store";
import { createInMemoryUnitOfWork } from "@pochimail/testing/in-memory-store";
import { repositoriesContract } from "@pochimail/testing/repositories-contract";
import { unitOfWorkContract } from "@pochimail/testing/unit-of-work-contract";

// Consumer check: a package other than `testing` can run the exported contract suites through
// the public entry points only. M2's SQLite adapter will replace the factories below.
unitOfWorkContract(createInMemoryUnitOfWork);
repositoriesContract(createInMemoryUnitOfWork);
blobStoreContract(createInMemoryBlobStore);
