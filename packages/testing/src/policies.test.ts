import { authorize } from "@pochimail/actions/policies/authorize";
import { authorizeContract } from "@pochimail/actions/testing/policy-contract";
import { CATEGORIES, PROTECTED_CATEGORIES } from "@pochimail/classification/model/category";

// The safety matrix over classification's real categories, so the two domains cannot drift apart.
authorizeContract(authorize, { categories: CATEGORIES, protectedCategories: PROTECTED_CATEGORIES });
