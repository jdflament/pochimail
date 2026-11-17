import { authorize } from "@pochimail/core/policies/authorize";
import { authorizeContract } from "./policy-contract.ts";

authorizeContract(authorize);
