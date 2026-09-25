/** A review as shoppers see it on the product page. */
export type Review = {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  /** "Ana B.": first name and last initial, never the email. */
  authorName: string;
  verifiedPurchase: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RatingSummary = {
  count: number;
  /** Average stars, rounded to one decimal; null with no reviews. */
  average: number | null;
  /** How many 1-, 2-, 3-, 4- and 5-star reviews, in that order. */
  distribution: [number, number, number, number, number];
};

/** A review in the admin moderation list. */
export type AdminReview = Review & {
  userId: string;
  product: { id: string; name: string; slug: string } | null;
};
