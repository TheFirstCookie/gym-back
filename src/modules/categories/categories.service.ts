import { notFound } from "../../utils/http-error.js";
import { categoriesRepository } from "./categories.repository.js";
import type { Category } from "./categories.types.js";

export const categoriesService = {
  list(): Promise<Category[]> {
    return categoriesRepository.findAll();
  },

  async getBySlug(slug: string): Promise<Category> {
    const category = await categoriesRepository.findBySlug(slug);
    if (!category) throw notFound(`Category "${slug}" not found`);
    return category;
  },
};
