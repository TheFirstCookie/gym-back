import { isForeignKeyViolation } from "../../utils/db-errors.js";
import { badRequest, HttpError, notFound } from "../../utils/http-error.js";
import { slugify } from "../../utils/slugify.js";
import { adminBrandsRepository } from "./admin-brands.repository.js";
import type { CreateBrandInput, UpdateBrandInput } from "./admin-brands.schema.js";
import type { AdminBrand } from "./admin-brands.types.js";

function inUse(productCount?: number) {
  const what = productCount ? `its ${productCount} ${productCount === 1 ? "product" : "products"}` : "its products";
  return new HttpError(409, "in_use", `Move ${what} to another brand first`, { productCount });
}

export const adminBrandsService = {
  list(): Promise<AdminBrand[]> {
    return adminBrandsRepository.findAll();
  },

  async getById(id: string): Promise<AdminBrand> {
    const brand = await adminBrandsRepository.findById(id);
    if (!brand) throw notFound("Brand not found");
    return brand;
  },

  async create(input: CreateBrandInput): Promise<AdminBrand> {
    const slug = input.slug ?? slugify(input.name);
    if (!slug) throw badRequest("Add a slug, or a name with letters or numbers to build one from");

    const id = await adminBrandsRepository.insert({ name: input.name, slug });
    return adminBrandsService.getById(id);
  },

  async update(id: string, patch: UpdateBrandInput): Promise<AdminBrand> {
    const found = await adminBrandsRepository.update(id, { name: patch.name, slug: patch.slug });
    if (!found) throw notFound("Brand not found");
    return adminBrandsService.getById(id);
  },

  /** Only brands without products (hidden ones included) can be deleted. */
  async remove(id: string): Promise<void> {
    const brand = await adminBrandsService.getById(id);
    if (brand.productCount > 0) throw inUse(brand.productCount);

    try {
      await adminBrandsRepository.delete(id);
    } catch (error) {
      // A product was added between the check and the delete.
      if (isForeignKeyViolation(error)) throw inUse();
      throw error;
    }
  },
};
