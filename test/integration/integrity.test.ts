import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite();
const q = async <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await db.query<T>(sql, args)).rows;
let category: string;
let brand: string;
beforeAll(async () => {
  for (const file of ["0001_initial_schema", "0002_product_search", "0004_checkout", "0005_admin_orders", "0007_admin_catalog_and_dashboard", "0008_refunds_and_order_emails", "0009_customer_accounts", "0010_product_variants", "0011_integrity_and_recovery"]) {
    await db.exec(await readFile(new URL(`../../supabase/migrations/${file}.sql`, import.meta.url), "utf8"));
  }
  category = String((await q("insert into categories(name,slug,accent_color) values('Strength','strength','#abcdef') returning id"))[0]!.id);
  brand = String((await q("insert into brands(name,slug) values('Brand','brand') returning id"))[0]!.id);
}, 30_000);
afterAll(async () => db.close());
async function product(variants?: object[]) {
  const slug = `p-${randomUUID()}`;
  const patch = { name: slug, slug, category_id: category, brand_id: brand, price_cents: 1000, stock: 10 };
  const id = String((await q("select admin_write_product(null,$1::jsonb,$2::jsonb) id", [JSON.stringify(patch), variants ? JSON.stringify(variants) : null]))[0]!.id);
  const row = (await q("select id,stock,updated_at::text version from products where id=$1", [id]))[0]!;
  const options = await q("select id,name,stock,price_cents,is_active from product_variants where product_id=$1 order by name", [id]);
  return { id, slug, version: String(row.version), options };
}
async function order(p: Awaited<ReturnType<typeof product>>, quantity = 2, variant?: string) {
  const result = await q("select create_pending_order($1::jsonb) o", [JSON.stringify([{ slug: p.slug, quantity, ...(variant ? { variant } : {}) }])]);
  return (result[0]!.o as { order_id: string }).order_id;
}
const stock = async (id: string) => (await q("select stock from products where id=$1", [id]))[0]!.stock;
const variant = { name: "20 kg", stock: 10, price_cents: 1000, is_active: true };

describe("real PostgreSQL inventory transactions", () => {
  it("rejects a stale variant edit after a checkout reservation", async () => {
    const p = await product([variant]);
    await order(p, 2, String(p.options[0]!.id));
    await expect(q("select admin_write_product($1,'{}',$2::jsonb,$3::timestamptz)", [p.id, JSON.stringify(p.options), p.version])).rejects.toMatchObject({ code: "FF008" });
    expect(await stock(p.id)).toBe(8);
  });
  it("rejects stale plain stock writes and writes without an expected version", async () => {
    const p = await product(); await order(p);
    await expect(q("select admin_write_product($1,'{\"stock\":10}',null,$2::timestamptz)", [p.id, p.version])).rejects.toMatchObject({ code: "FF008" });
    await expect(q("select admin_write_product($1,'{\"stock\":10}')", [p.id])).rejects.toMatchObject({ code: "FF008" });
    expect(await stock(p.id)).toBe(8);
  });
  it("rolls back the entire product when a variant save fails", async () => {
    const slug = `bad-${randomUUID()}`;
    const patch = { name: slug, slug, category_id: category, brand_id: brand, price_cents: 1000 };
    await expect(q("select admin_write_product(null,$1::jsonb,$2::jsonb)", [JSON.stringify(patch), JSON.stringify([variant, variant])])).rejects.toMatchObject({ code: "23505" });
    expect(await q("select id from products where slug=$1", [slug])).toEqual([]);
  });
  it("publishes the final variant totals in one transaction", async () => {
    const p = await product([variant, { ...variant, name: "10 kg", price_cents: 500, stock: 3 }]);
    expect(await stock(p.id)).toBe(13);
    expect((await q("select price_cents from products where id=$1", [p.id]))[0]!.price_cents).toBe(500);
  });
  it("preserves ordered variants instead of detaching their order history", async () => {
    const p = await product([variant]);
    const id = await order(p, 2, String(p.options[0]!.id));
    await expect(q("select admin_save_variants($1,'[]')", [p.id])).rejects.toMatchObject({ code: "FF006" });
    await q("select cancel_pending_order($1)", [id]);
    expect(await stock(p.id)).toBe(10);
  });
  it("blocks ambiguous plain-to-variant inventory conversions after orders", async () => {
    const p = await product(); await order(p);
    await expect(q("select admin_save_variants($1,$2::jsonb)", [p.id, JSON.stringify([variant])])).rejects.toMatchObject({ code: "FF006" });
  });
  it("aggregates multiple historical plain lines when restoring stock", async () => {
    const p = await product();
    const id = await order(p, 2);
    await q("insert into order_items(order_id,product_id,product_name,unit_price_cents,quantity) values($1,$2,'same',1000,3)", [id,p.id]);
    await q("update products set stock=5 where id=$1", [p.id]);
    await q("select cancel_pending_order($1)", [id]);
    expect(await stock(p.id)).toBe(10);
    await q("select cancel_pending_order($1)", [id]);
    expect(await stock(p.id)).toBe(10);
  });
  it("rejects oversized totals before integer arithmetic overflows and rolls back stock", async () => {
    const p = await product();
    await q("update products set price_cents=100000000,stock=99 where id=$1", [p.id]);
    await expect(order(p,99)).rejects.toMatchObject({ code: "FF007" });
    expect(await stock(p.id)).toBe(99);
  });
  it("enforces the quantity cap after merging duplicate cart lines", async () => {
    const p = await product();
    await expect(q("select create_pending_order($1::jsonb)", [JSON.stringify([{slug:p.slug,quantity:60},{slug:p.slug,quantity:60}])])).rejects.toMatchObject({ code: "FF004" });
  });
  it("does not release linked or ambiguous Stripe sessions in SQL cleanup", async () => {
    const p = await product(); const id = await order(p);
    await q("update orders set created_at=now()-interval '3 hours',checkout_started_at=now()-interval '3 hours' where id=$1", [id]);
    await q("select release_stale_orders()");
    expect((await q("select status from orders where id=$1", [id]))[0]!.status).toBe("pending");
    expect(await stock(p.id)).toBe(8);
  });
  it("requires an active parent for public variant reads", async () => {
    const p = await product([variant]);
    await db.exec("create role integrity_anon; grant usage on schema public to integrity_anon; grant select on products,product_variants to integrity_anon;");
    await q("update products set is_active=false where id=$1", [p.id]);
    await db.exec("set role integrity_anon");
    try { expect(await q("select id from product_variants where product_id=$1", [p.id])).toEqual([]); }
    finally { await db.exec("reset role"); }
  });
});

describe("refund and email durability", () => {
  async function paidOrder() {
    const p = await product(); const id = await order(p);
    await q("update orders set status='paid',paid_at=now() where id=$1", [id]);
    return { p, id };
  }
  it("keeps pending refunds paid and restocks only on success, once", async () => {
    const {p,id} = await paidOrder();
    await q("select begin_order_refund($1,true)", [id]);
    await q("select record_order_refund($1,'re_1','pending',(select refund_attempt from orders where id=$1))", [id]);
    expect((await q("select status from orders where id=$1", [id]))[0]!.status).toBe("paid");
    expect(await stock(p.id)).toBe(8);
    await q("select record_order_refund($1,'re_1','succeeded',(select refund_attempt from orders where id=$1))", [id]);
    await q("select record_order_refund($1,'re_1','succeeded',(select refund_attempt from orders where id=$1))", [id]);
    expect(await stock(p.id)).toBe(10);
    expect((await q("select status from orders where id=$1", [id]))[0]!.status).toBe("refunded");
  });
  it("uses a stable attempt while pending and a new one after a definitive failure", async () => {
    const {id} = await paidOrder();
    const a = (await q("select begin_order_refund($1,false) id", [id]))[0]!.id;
    expect((await q("select begin_order_refund($1,true) id", [id]))[0]!.id).toBe(a);
    await q("select record_order_refund($1,'re_failed','failed',(select refund_attempt from orders where id=$1))", [id]);
    expect((await q("select begin_order_refund($1,true) id", [id]))[0]!.id).not.toBe(a);
  });
  it("claims email once and marks it sent only after delivery", async () => {
    const {id} = await paidOrder();
    const token = (await q("select claim_order_email($1) token", [id]))[0]!.token;
    expect(token).toBeTruthy();
    expect((await q("select claim_order_email($1) token", [id]))[0]!.token).toBeNull();
    expect((await q("select confirmation_email_sent_at from orders where id=$1", [id]))[0]!.confirmation_email_sent_at).toBeNull();
    await q("select finish_order_email($1,$2,true)", [id, token]);
    expect((await q("select confirmation_email_sent_at from orders where id=$1", [id]))[0]!.confirmation_email_sent_at).not.toBeNull();
  });
  it("ignores a late event from an older refund attempt", async () => {
    const {id} = await paidOrder();
    const first = (await q("select begin_order_refund($1,false) id", [id]))[0]!.id;
    await q("select record_order_refund($1,'old_refund','failed',$2)", [id,first]);
    const second = (await q("select begin_order_refund($1,false) id", [id]))[0]!.id;
    await q("select record_order_refund($1,'old_refund','pending',$2)", [id,first]);
    expect((await q("select stripe_refund_id from orders where id=$1", [id]))[0]!.stripe_refund_id).toBeNull();
    await q("select record_order_refund($1,'new_refund','succeeded',$2)", [id,second]);
    expect((await q("select status from orders where id=$1", [id]))[0]!.status).toBe("refunded");
  });
  it("reclaims a crashed email attempt and rejects its obsolete completion token", async () => {
    const {id} = await paidOrder();
    const a = (await q("select claim_order_email($1) token", [id]))[0]!.token;
    await q("update order_email_jobs set claimed_at=now()-interval '6 minutes' where order_id=$1", [id]);
    const b = (await q("select claim_order_email($1) token", [id]))[0]!.token;
    expect(b).not.toBe(a);
    await q("select finish_order_email($1,$2,true)", [id,a]);
    expect((await q("select sent_at from order_email_jobs where order_id=$1", [id]))[0]!.sent_at).toBeNull();
    await q("select finish_order_email($1,$2,false)", [id,b]);
    expect((await q("select next_attempt_at>now() scheduled from order_email_jobs where order_id=$1", [id]))[0]!.scheduled).toBe(true);
  });
});
