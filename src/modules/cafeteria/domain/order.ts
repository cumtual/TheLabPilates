import type { Temperature } from './category-tree';
import { invalid, CafeteriaError } from './errors';
import { sumCents, type Cents } from './money';

/** Pedido de la barra (SPEC-CAFETERIA §4.3). El servidor recalcula todo desde el menú. */

export type PaymentMethod = 'cash' | 'transfer';

export const MAX_ORDER_LINES = 30;
export const MAX_LINE_QUANTITY = 20;
export const CUSTOMER_NAME_MAX = 100;

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { cash: 'Efectivo', transfer: 'Transferencia' };

export interface OrderLineInput {
  productId: string;
  quantity: number;
  /** Una línea de cortesía es siempre de 1 unidad. */
  courtesy: boolean;
}

/** Producto tal como lo ve la caja al cobrar (precio y nombres vigentes). */
export interface SellableProduct {
  id: string;
  name: string;
  priceCents: Cents;
  temperature: Temperature | null;
  categoryId: string;
  rootCategoryId: string;
  /** Subcategoría, o la categoría donde está el producto. */
  categoryName: string;
  /** Categoría padre; `null` si el producto cuelga directo del padre. */
  parentCategoryName: string | null;
  sellable: boolean;
}

export interface OrderLine {
  productId: string;
  productName: string;
  categoryName: string;
  parentCategoryName: string | null;
  temperature: Temperature | null;
  unitPriceCents: Cents;
  quantity: number;
  isCourtesy: boolean;
  lineTotalCents: Cents;
  /** Para el reparto de cortesías. */
  categoryId: string;
  rootCategoryId: string;
}

/**
 * Arma las líneas con los datos del servidor (ignora cualquier precio del cliente) y valida
 * límites: 1–30 líneas, cantidad 1–20, cortesía de 1 unidad, producto vendible.
 */
export function buildOrderLines(inputs: readonly OrderLineInput[], products: ReadonlyMap<string, SellableProduct>): OrderLine[] {
  if (inputs.length === 0) throw invalid('Agrega al menos un artículo.', 'items');
  if (inputs.length > MAX_ORDER_LINES) throw invalid(`Máximo ${MAX_ORDER_LINES} líneas por pedido.`, 'items');
  return inputs.map((input) => {
    if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > MAX_LINE_QUANTITY) {
      throw invalid(`La cantidad va de 1 a ${MAX_LINE_QUANTITY}.`, 'items');
    }
    if (input.courtesy && input.quantity !== 1) throw invalid('Una cortesía es de 1 unidad.', 'items');
    const product = products.get(input.productId);
    if (!product || !product.sellable) {
      throw new CafeteriaError(
        'PRODUCT_UNAVAILABLE',
        product ? `${product.name} no está disponible.` : 'Un artículo ya no existe en el menú.',
        'items',
        { productId: input.productId }
      );
    }
    return {
      productId: product.id,
      productName: product.name,
      categoryName: product.categoryName,
      parentCategoryName: product.parentCategoryName,
      temperature: product.temperature,
      unitPriceCents: product.priceCents,
      quantity: input.quantity,
      isCourtesy: input.courtesy,
      lineTotalCents: input.courtesy ? 0 : product.priceCents * input.quantity,
      categoryId: product.categoryId,
      rootCategoryId: product.rootCategoryId,
    };
  });
}

/** `total = Σ unit × qty` de las líneas que no son cortesía. */
export function orderTotal(lines: readonly Pick<OrderLine, 'lineTotalCents'>[]): Cents {
  return sumCents(lines.map((line) => line.lineTotalCents));
}

/** Valor regalado: precio de lista de las líneas de cortesía. */
export function courtesyValue(lines: readonly Pick<OrderLine, 'isCourtesy' | 'unitPriceCents' | 'quantity'>[]): Cents {
  return sumCents(lines.filter((l) => l.isCourtesy).map((l) => l.unitPriceCents * l.quantity));
}

/** Descuento por membresía activa del cliente (SPEC-CAFETERIA D13). */
export interface MemberDiscount {
  percent: number;
  /** «Lab Progress 10%»: se guarda en el pedido. */
  label: string;
}

/** `percent` % del subtotal, redondeado al centavo (la mitad sube). Nunca más que el subtotal. */
export function discountCents(subtotalCents: Cents, percent: number): Cents {
  if (!Number.isInteger(percent) || percent <= 0) return 0;
  return Math.min(subtotalCents, Math.floor((subtotalCents * Math.min(percent, 100) + 50) / 100));
}

/** Total 0 ⇒ sin método (100 % cortesía); total > 0 ⇒ método obligatorio. */
export function resolvePaymentMethod(total: Cents, method: PaymentMethod | null): PaymentMethod | null {
  if (total === 0) return null;
  if (method === null) throw invalid('Elige efectivo o transferencia.', 'paymentMethod');
  return method;
}
