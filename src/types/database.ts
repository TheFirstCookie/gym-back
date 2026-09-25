// Typed schema for the Supabase client, mirroring supabase/migrations.
//
// Written in the same shape `supabase gen types typescript` produces, so it can be
// swapped for generated output later. One deliberate difference: view columns are
// non-null here (the generator marks every view column nullable) because the views
// derive them from NOT NULL columns.

type OrderStatus = "pending" | "paid" | "cancelled" | "fulfilled";

type ProductListingRow = {
  id: string;
  name: string;
  slug: string;
  price_cents: number;
  currency: string;
  stock: number;
  tag: string | null;
  image_url: string | null;
  description: string;
  specs: string[];
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category_id: string;
  category_name: string;
  category_slug: string;
  brand_id: string;
  brand_name: string;
  brand_slug: string;
};

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          accent_color: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          accent_color: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          accent_color?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      brands: {
        Row: {
          id: string;
          name: string;
          slug: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          name: string;
          slug: string;
          category_id: string;
          brand_id: string;
          price_cents: number;
          currency: string;
          stock: number;
          tag: string | null;
          image_url: string | null;
          description: string;
          specs: string[];
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          category_id: string;
          brand_id: string;
          price_cents: number;
          currency?: string;
          stock?: number;
          tag?: string | null;
          image_url?: string | null;
          description?: string;
          specs?: string[];
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          category_id?: string;
          brand_id?: string;
          price_cents?: number;
          currency?: string;
          stock?: number;
          tag?: string | null;
          image_url?: string | null;
          description?: string;
          specs?: string[];
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          id: string;
          status: OrderStatus;
          customer_email: string | null;
          currency: string;
          subtotal_cents: number;
          total_cents: number;
          stripe_checkout_session_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          status?: OrderStatus;
          customer_email?: string | null;
          currency?: string;
          subtotal_cents: number;
          total_cents: number;
          stripe_checkout_session_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          status?: OrderStatus;
          customer_email?: string | null;
          currency?: string;
          subtotal_cents?: number;
          total_cents?: number;
          stripe_checkout_session_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string | null;
          product_name: string;
          unit_price_cents: number;
          quantity: number;
          line_total_cents: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id?: string | null;
          product_name: string;
          unit_price_cents: number;
          quantity: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string | null;
          product_name?: string;
          unit_price_cents?: number;
          quantity?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      categories_with_counts: {
        Row: {
          id: string;
          name: string;
          slug: string;
          accent_color: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
          product_count: number;
        };
        Relationships: [];
      };
      product_listings: {
        // search_document is a tsvector; PostgREST serialises it as text.
        Row: ProductListingRow & { search_document: string };
        Relationships: [];
      };
    };
    Functions: {
      product_search_query: {
        Args: { p_query: string };
        Returns: string | null;
      };
      search_products: {
        Args: {
          p_category?: string | null;
          p_brands?: string[] | null;
          p_query?: string | null;
          p_sort?: string;
          p_status?: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: (ProductListingRow & { total_count: number })[];
      };
      product_brand_facets: {
        Args: {
          p_category?: string | null;
          p_query?: string | null;
        };
        Returns: {
          id: string;
          name: string;
          slug: string;
          product_count: number;
        }[];
      };
      related_products: {
        Args: { p_slug: string; p_limit?: number };
        Returns: (ProductListingRow & { search_document: string })[];
      };
    };
    Enums: {
      order_status: OrderStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
