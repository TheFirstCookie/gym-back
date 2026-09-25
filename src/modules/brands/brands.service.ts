import { brandsRepository } from "./brands.repository.js";
import type { Brand } from "./brands.types.js";

export const brandsService = {
  list(): Promise<Brand[]> {
    return brandsRepository.findAll();
  },
};
