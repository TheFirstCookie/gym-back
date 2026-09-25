import type { CustomerUser } from "../../middleware/require-user.js";
import { notFound } from "../../utils/http-error.js";
import { toLimitOffset, toPagination, type Pagination } from "../../utils/pagination.js";
import { reviewsRepository } from "./reviews.repository.js";
import type { AdminReviewListQuery, ReviewListQuery, UpsertReviewInput } from "./reviews.schema.js";
import type { AdminReview, RatingSummary, Review } from "./reviews.types.js";

/** "Ana Maria Buyer" -> "Ana B."; without a name, a neutral label (never the email). */
export function displayName(fullName: string | null): string {
  const parts = fullName?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return "ForgeFit customer";
  const first = parts[0]!.slice(0, 40);
  const last = parts.length > 1 ? ` ${parts[parts.length - 1]![0]!.toUpperCase()}.` : "";
  return `${first}${last}`;
}

async function requireProductId(slug: string): Promise<string> {
  const productId = await reviewsRepository.productIdBySlug(slug);
  if (!productId) throw notFound("Product not found");
  return productId;
}

export const reviewsService = {
  async list(
    slug: string,
    query: ReviewListQuery,
  ): Promise<{ data: Review[]; meta: { pagination: Pagination; summary: RatingSummary } }> {
    const productId = await requireProductId(slug);
    const { limit, offset } = toLimitOffset(query);
    const [summary, reviews] = await Promise.all([
      reviewsRepository.summary(productId),
      reviewsRepository.list(productId, limit, offset),
    ]);
    return { data: reviews, meta: { pagination: toPagination(query, summary.count), summary } };
  },

  async summary(slug: string): Promise<RatingSummary> {
    return reviewsRepository.summary(await requireProductId(slug));
  },

  async mine(slug: string, user: CustomerUser): Promise<Review | null> {
    return reviewsRepository.findByAuthor(await requireProductId(slug), user.id);
  },

  /**
   * Creates the customer's review, or replaces it if they already wrote one. The author name
   * and "verified purchase" badge are worked out here, never taken from the request.
   */
  async upsert(slug: string, user: CustomerUser, input: UpsertReviewInput): Promise<Review> {
    const productId = await requireProductId(slug);
    const [existing, verified] = await Promise.all([
      reviewsRepository.findByAuthor(productId, user.id),
      reviewsRepository.hasPurchased(user.id, productId),
    ]);

    const fields = {
      author_name: displayName(user.fullName),
      rating: input.rating,
      title: input.title,
      body: input.body,
      verified_purchase: verified,
    };

    if (existing) {
      await reviewsRepository.update(productId, user.id, fields);
    } else {
      await reviewsRepository.insert({ ...fields, product_id: productId, user_id: user.id });
    }

    return (await reviewsRepository.findByAuthor(productId, user.id))!;
  },

  async remove(slug: string, user: CustomerUser): Promise<void> {
    await reviewsRepository.deleteByAuthor(await requireProductId(slug), user.id);
  },

  async listForAdmin(
    query: AdminReviewListQuery,
  ): Promise<{ data: AdminReview[]; meta: { pagination: Pagination } }> {
    const { limit, offset } = toLimitOffset(query);
    const [reviews, total] = await Promise.all([reviewsRepository.listAll(limit, offset), reviewsRepository.countAll()]);
    return { data: reviews, meta: { pagination: toPagination(query, total) } };
  },

  async removeAsAdmin(id: string): Promise<void> {
    const found = await reviewsRepository.deleteById(id);
    if (!found) throw notFound("Review not found");
  },
};
