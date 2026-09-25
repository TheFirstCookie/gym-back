import { isForeignKeyViolation } from "../../utils/db-errors.js";
import { badRequest, HttpError, notFound } from "../../utils/http-error.js";
import { slugify } from "../../utils/slugify.js";
import { adminCategoriesRepository } from "./admin-categories.repository.js";
import type { CreateCategoryInput, UpdateCategoryInput } from "./admin-categories.schema.js";
import type { AdminCategory, CategoryUpdateRow } from "./admin-categories.types.js";

function toUpdateRow(patch: UpdateCategoryInput): CategoryUpdateRow {
  return {
    name: patch.name,
    slug: patch.slug,
    accent_color: patch.accent,
    sort_order: patch.sortOrder,
  };
}

function inUse(productCount?: number) {
  const what = productCount ? `its ${productCount} ${productCount === 1 ? "product" : "products"}` : "its products";
  return new HttpError(409, "in_use", `Move ${what} to another category first`, { productCount });
}

export const adminCategoriesService = {
  list(): Promise<AdminCategory[]> {
    return adminCategoriesRepository.findAll();
  },

  async getById(id: string): Promise<AdminCategory> {
    const category = await adminCategoriesRepository.findById(id);
    if (!category) throw notFound("Category not found");
    return category;
  },

  async create(input: CreateCategoryInput): Promise<AdminCategory> {
    const slug = input.slug ?? slugify(input.name);
    if (!slug) throw badRequest("Add a slug, or a name with letters or numbers to build one from");

    const id = await adminCategoriesRepository.insert({
      name: input.name,
      slug,
      accent_color: input.accent,
      sort_order: input.sortOrder,
    });
    return adminCategoriesService.getById(id);
  },

  async update(id: string, patch: UpdateCategoryInput): Promise<AdminCategory> {
    // undefined fields are dropped from the JSON body, so they stay untouched.
    const found = await adminCategoriesRepository.update(id, toUpdateRow(patch));
    if (!found) throw notFound("Category not found");
    return adminCategoriesService.getById(id);
  },

  /**
   * Only empty categories can be deleted: products must always belong to one. Hidden
   * products count too, since they can be shown again.
   */
  async remove(id: string): Promise<void> {
    const category = await adminCategoriesService.getById(id);
    if (category.productCount > 0) throw inUse(category.productCount);

    try {
      await adminCategoriesRepository.delete(id);
    } catch (error) {
      // A product was added between the check and the delete.
      if (isForeignKeyViolation(error)) throw inUse();
      throw error;
    }
  },
};
