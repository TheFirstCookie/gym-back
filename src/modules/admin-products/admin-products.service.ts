import { badRequest, notFound } from "../../utils/http-error.js";
import { toLimitOffset, toPagination } from "../../utils/pagination.js";
import { slugify } from "../../utils/slugify.js";
import { productsRepository } from "../products/products.repository.js";
import { variantsRepository } from "../variants/variants.repository.js";
import { toAdminProduct, toInsertRow, toUpdateRow } from "./admin-products.mapper.js";
import { adminProductsRepository } from "./admin-products.repository.js";
import type {
  AdminProductListQuery,
  CreateProductInput,
  SaveVariantsInput,
  UpdateProductInput,
} from "./admin-products.schema.js";
import type { AdminProduct, AdminProductListResponse } from "./admin-products.types.js";

export const adminProductsService = {
  async list(query: AdminProductListQuery): Promise<AdminProductListResponse> {
    const filters = { category: query.category, query: query.q };

    const [result, brandFacets] = await Promise.all([
      productsRepository.search({
        ...filters,
        brands: query.brand,
        sort: query.sort,
        status: query.status,
        ...toLimitOffset(query),
      }),
      productsRepository.brandFacets(filters),
    ]);

    const variants = await variantsRepository.listByProduct(result.items.map((row) => row.id));

    return {
      data: result.items.map((row) => toAdminProduct(row, variants.get(row.id))),
      meta: {
        pagination: toPagination(query, result.total),
        facets: { brands: brandFacets },
      },
    };
  },

  async getById(id: string): Promise<AdminProduct> {
    const row = await adminProductsRepository.findById(id);
    if (!row) throw notFound("Product not found");
    const variants = await variantsRepository.listByProduct([id]);
    return toAdminProduct(row, variants.get(id));
  },

  async create(input: CreateProductInput): Promise<AdminProduct> {
    const slug = input.slug ?? slugify(input.name);
    if (!slug) throw badRequest("Add a slug, or a name with letters or numbers to build one from");

    const id = await adminProductsRepository.insert(toInsertRow({ ...input, slug }));
    return adminProductsService.getById(id);
  },

  async update(id: string, patch: UpdateProductInput): Promise<AdminProduct> {
    const found = await adminProductsRepository.update(id, toUpdateRow(patch));
    if (!found) throw notFound("Product not found");
    return adminProductsService.getById(id);
  },

  /**
   * Replaces the product's variants. With any, its price becomes the cheapest one's and its
   * stock their total (the database keeps both in step from then on).
   */
  async saveVariants(id: string, input: SaveVariantsInput): Promise<AdminProduct> {
    // A clear 404 rather than a foreign-key error for a missing product.
    await adminProductsService.getById(id);
    await variantsRepository.save(id, input.variants);
    return adminProductsService.getById(id);
  },

  /**
   * Hides the product instead of deleting it: past orders keep pointing at it, and it can
   * be restored with a PATCH { isActive: true }.
   */
  async archive(id: string): Promise<void> {
    const found = await adminProductsRepository.update(id, { is_active: false });
    if (!found) throw notFound("Product not found");
  },
};
